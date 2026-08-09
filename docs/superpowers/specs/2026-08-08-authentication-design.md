# Authentication — Design Spec

**Date:** 2026-08-08
**Status:** Approved, ready for implementation planning

## Overview

Add authentication to MoneyTrack: email/password registration and login, Google
sign-in, and a protected page that proves the whole thing works end to end.

This is the first feature that touches the database, so it also ships the
project's initial Prisma migration — and the first with tests, so it stands up
the Vitest and Playwright infrastructure the rest of the app will use.

## Goals

- A user can register with name, email, and password.
- A user can log in with email and password.
- A user can register or log in with Google.
- A signed-in user visiting `/dashboard` sees `Signed in (name)`.
- A signed-out user visiting `/dashboard` is redirected to `/login`.
- A user can sign out.

## Non-Goals

These are deliberately excluded. Each is its own feature.

- Email verification. No email provider is configured.
- Password reset / forgot password. Same reason.
- Session management UI (list devices, revoke other sessions).
- Internationalization of auth copy. English only for now; the PRD's pt-BR
  support is a separate feature that will cover the whole app.
- Light/dark theme toggle. The screens must *render* correctly in both, since
  `globals.css` already defines a `.dark` palette, but no toggle ships here.
- Rate limiting beyond better-auth's built-in defaults.
- Real dashboard content. `/dashboard` is a placeholder that later becomes the
  dashboard described in the PRD.

## Decisions

These were settled during design. Recorded with reasoning so they don't get
relitigated mid-implementation.

### Sessions are stored in the database

The original ask was for stateless JWT sessions. Fully stateless better-auth
means *no database at all* — which cannot work here: email/password needs
somewhere to store the password hash, and every model in the schema has a
`user_id` foreign key.

Given that, we use better-auth's standard database-backed sessions. No
`cookieCache`, no JWT layer. Every session check queries Postgres. This is the
simplest correct setup and gives immediate, real session revocation.

### `User.passwordHash` and `User.googleId` are removed

better-auth supports renaming most columns through field mapping, but not
these two. It stores the password hash in `account.password` and the Google
link as an `account` row with `providerId: "google"` — one user can hold both
a credential account and a Google account simultaneously. No configuration
option relocates those onto the user table.

Keeping the fields would require a bespoke database adapter: a large amount of
custom code and a permanent hazard on every better-auth upgrade. Not worth it
for two columns that have never held data.

The rest of the schema's conventions are preserved. Prisma `@map` handles
snake_case columns and plural table names at the database level; better-auth
never sees them.

### Google accounts link to existing users by email

`account.accountLinking` is enabled with `trustedProviders: ["google"]`.

Register with `ana@example.com` and a password, then later click "Continue with
Google" with that same address, and the Google account links to the existing
user rather than erroring or creating a duplicate.

This is safe specifically because Google asserts the email address as verified.
It would not be safe for an untrusted provider, and this list must not be
widened without that same reasoning.

### Forms use react-hook-form + zod

Client components call `authClient` directly. This is the standard shadcn
`Form` pattern and gives field-level validation without a server round trip.

### The protected page lives at `/dashboard`

Not a throwaway route. The PRD already calls for a dashboard, so this page
becomes the real one later rather than being deleted.

## Architecture

Three modules, each with one responsibility.

### `src/lib/auth.ts` — server instance

Owns all better-auth configuration and is the only place that constructs it.

- Prisma adapter, `provider: "postgresql"`, importing `PrismaClient` from
  `@/generated/prisma/client` (**not** `@prisma/client` — this project uses a
  custom Prisma output path).
- Reuses the shared client from `src/lib/prisma.ts`; does not instantiate its own.
- `emailAndPassword: { enabled: true, requireEmailVerification: false }`.
- `socialProviders.google` reading `GOOGLE_OAUTH_CLIENT_ID` and
  `GOOGLE_OAUTH_CLIENT_SECRET`.
- `user.additionalFields` declaring `currency`, `numberFormat`, and
  `dateFormat` with `input: false`, so they keep their schema defaults and
  cannot be injected through the signup payload.
- `account.accountLinking` as described above.
- `plugins: [nextCookies()]` — **must be last in the array**. This is what
  allows server-side auth calls to set cookies.

### `src/app/api/auth/[...all]/route.ts` — HTTP surface

```ts
export const { GET, POST } = toNextJsHandler(auth);
```

Serves every auth endpoint: `/api/auth/sign-in/email`,
`/api/auth/callback/google`, `/api/auth/sign-out`, and the rest.

### `src/lib/auth-client.ts` — browser client

`createAuthClient` from `better-auth/react`. The only auth module the form
components import.

## Data flow

**Email/password.** Form submits → `authClient.signUp.email()` or
`authClient.signIn.email()` → route handler → Prisma writes user/account/session
→ session cookie set → `router.push('/dashboard')` followed by
`router.refresh()` so the server component re-reads the new session.

**Google.** `authClient.signIn.social({ provider: 'google' })` → full-page
redirect to Google → back to `/api/auth/callback/google` → better-auth creates
or links the user and account rows → redirect to `/dashboard`.

## Database schema

No migration has ever run against this schema, so this ships as the **initial**
migration (`prisma migrate dev --name init`), not an incremental change.

### `User` — modified

| Change | Field | Note |
| --- | --- | --- |
| Remove | `passwordHash` | Superseded by `account.password` |
| Remove | `googleId` | Superseded by an `account` row with `providerId: "google"` |
| Add | `emailVerified Boolean @default(false)` | Structurally required by better-auth. Stays `false` permanently; nothing reads it while verification is out of scope. |
| Add | `image String?` | Structurally required. Populated from the Google profile picture when present. |
| Add | `sessions Session[]` | Relation |
| Add | `accounts Account[]` | Relation |

`name` stays `String?` to match better-auth's core model, even though the
register form requires it. Google profiles can in principle arrive without one.

Unchanged: `id`, `email`, `currency`, `numberFormat`, `dateFormat`, timestamps,
and every existing relation.

### `Session`, `Account`, `Verification` — new

Generated with `npx @better-auth/cli generate`, then hand-adjusted to match the
schema's existing conventions: `@@map` to plural snake_case table names, `@map`
on every column, `onDelete: Cascade` from the user relation, and an index on
`userId`.

`Verification` carries no traffic today — email verification and password reset
are both out of scope — but the adapter expects the model to exist.

## Route structure

```
src/app/(auth)/layout.tsx        centered-card shell, shared
src/app/(auth)/login/page.tsx    server component
src/app/(auth)/register/page.tsx server component
src/app/dashboard/page.tsx       server component, protected
```

`(auth)` is a route group, so the URLs are `/login` and `/register` with no
`/auth` segment.

Both auth pages perform the inverse check: if a session already exists, they
redirect to `/dashboard`.

## Route protection — two layers

**Layer 1, `src/proxy.ts`.** Next.js 16 renamed the `middleware` convention to
`proxy`; the file exports a function named `proxy` and sits in `src/` alongside
`app/`. It checks only for the *presence* of a session cookie via
`getSessionCookie` from `better-auth/cookies`, matched to `/dashboard`.

This is **not a security boundary.** A hand-forged cookie passes it. Its only
purpose is redirecting signed-out users without paying for a wasted render.

**Layer 2, the page itself.** `src/app/dashboard/page.tsx` calls
`auth.api.getSession({ headers: await headers() })` and redirects to `/login`
when it returns null. This queries Postgres and is authoritative.

The check lives in the page, not in a layout. Per the Next.js 16 auth guide,
layouts do not re-render on client-side navigation, and a layout cannot prevent
its child segments from rendering or appearing in the RSC payload.

## Components

```
src/components/auth/login-form.tsx        'use client'
src/components/auth/register-form.tsx     'use client'
src/components/auth/google-button.tsx     'use client', shared by both forms
src/components/auth/sign-out-button.tsx   'use client'
```

The two forms stay separate files rather than one parameterized component.
They differ in fields, copy, and error cases; merging them would mean
conditionals threaded through every branch for no reuse benefit.

`google-button.tsx` is genuinely shared — identical on both screens apart from
nothing at all.

## Validation

Zod schemas live in `src/lib/validations/auth.ts` and are imported by both
forms.

**Register**
- `name` — trimmed, min 2 characters
- `email` — valid email, trimmed, lowercased
- `password` — min 8 characters
- `confirmPassword` — must equal `password`, enforced with `.refine()` and
  reported on the `confirmPassword` path

**Login**
- `email` — valid email
- `password` — non-empty (no length rule; the rules may change over time and an
  old password must still be enterable)

Field errors render inline through the shadcn `Form` component.

## Error handling

Server errors render in a shadcn `Alert` above the submit button. better-auth
error codes are mapped to plain English in one lookup table:

| Code | Message |
| --- | --- |
| `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` | An account with this email already exists. |
| `INVALID_EMAIL_OR_PASSWORD` | Incorrect email or password. |
| `PASSWORD_TOO_SHORT` | Password must be at least 8 characters. |
| *unmapped* | Something went wrong. Please try again. |

Login deliberately does not distinguish "no such email" from "wrong password" —
doing so would confirm which addresses have accounts.

Submit buttons disable and show a spinner while a request is pending. The
Google button disables too, since its redirect can take a moment to begin.

## Visual design

Centered shadcn `Card`, roughly 400px wide, on a plain `bg-background` page.
Inside, top to bottom: the MoneyTrack wordmark, a heading, a one-line
subheading, the fields, the primary submit button, an "or" separator, the
Google button, and a footer link to the opposite screen.

Both screens must render correctly under `.dark`, which `globals.css` already
defines. The style is `base-vega` with a `neutral` base color, and the shadcn
components in this project are built on `@base-ui/react` rather than Radix —
components must be added with the shadcn CLI so the correct variants are
installed, never hand-written from memory.

An interactive HTML prototype accompanies this spec as the visual reference,
covering every state: empty, filled, per-field validation errors, server error,
pending, and the signed-in dashboard.

## Dependencies

Runtime: `better-auth`, `react-hook-form`, `zod`, `@hookform/resolvers`.

Testing: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`,
`@testing-library/dom`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `@playwright/test`.

Path aliases in tests come from Vite 8's native `resolve.tsconfigPaths`, not
the `vite-tsconfig-paths` plugin, which Vite now reports as redundant.

New shadcn components: `card`, `input`, `label`, `form`, `alert`, `separator`.
`button` already exists.

## Environment

Already present: `DATABASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`.

To be added: `BETTER_AUTH_SECRET` (generated during implementation),
`BETTER_AUTH_URL=http://localhost:3000`, and `DATABASE_URL_TEST` pointing at a
separate Postgres database used only by the end-to-end suite.

**External setup, which cannot be automated:** the Google Cloud Console OAuth
client must list `http://localhost:3000/api/auth/callback/google` as an
authorized redirect URI. Google sign-in fails with `redirect_uri_mismatch`
until it does.

`DATABASE_URL` must point at a reachable Postgres instance, because the initial
migration has to actually run.

## Testing

This feature introduces the project's test infrastructure. Two layers.

### Unit — Vitest

Specs sit **next to the file they test**: `login-form.tsx` is tested by
`login-form.spec.tsx` in the same directory. jsdom environment, React Testing
Library, user-event for interaction.

Seven spec files, covering every module that contains a branch:

| Spec | Covers |
| --- | --- |
| `src/lib/validations/auth.spec.ts` | Both zod schemas — every rule, trimming, lowercasing, the confirm-password refinement |
| `src/lib/auth-errors.spec.ts` | Each mapped code, the fallback, `undefined`/`null` input |
| `src/components/auth/login-form.spec.tsx` | Field errors, server error rendering, pending state, redirect on success |
| `src/components/auth/register-form.spec.tsx` | Same, plus the confirm-password mismatch |
| `src/components/auth/google-button.spec.tsx` | Calls `signIn.social` with the right provider and callback, pending label, recovery on error |
| `src/components/auth/sign-out-button.spec.tsx` | Calls `signOut`, then redirects |
| `src/proxy.spec.ts` | Redirects without a cookie, passes through with one |

`src/lib/auth.ts` gets no spec — it is pure configuration with no branches, and
asserting the shape of a config object only restates the source. The async
server component pages get no specs either; end-to-end covers them properly,
and RSC unit testing would be fragile for no additional signal.

`authClient` and `next/navigation` are mocked with `vi.hoisted` + `vi.mock` in
the specs that need them.

### End-to-end — Playwright

One file per user flow, in an `e2e/` directory at the project root:

| File | Flow |
| --- | --- |
| `e2e/registration.spec.ts` | Register → land on dashboard → duplicate email rejected → field validation |
| `e2e/login.spec.ts` | Sign in → dashboard; wrong password and unknown email both rejected identically |
| `e2e/logout.spec.ts` | Sign out → redirected → session no longer valid |
| `e2e/route-protection.spec.ts` | `/dashboard` signed out redirects; `/login` and `/register` signed in redirect |
| `e2e/google-sign-in.spec.ts` | Clicking Google sends the browser to `accounts.google.com` with the correct `client_id` and `redirect_uri` |

**Database.** The suite runs against `DATABASE_URL_TEST`, a database separate
from development. Global setup applies migrations with `prisma migrate deploy`
and truncates all tables, so every run starts from a known-empty state. The
dev database is never touched.

**Google.** The e2e test asserts the redirect *into* Google and stops there. It
does not complete the consent flow: Google blocks automated browsers, so a full
round trip would be flaky rather than informative. Completing a real Google
sign-in — and the account-linking behaviour that follows — stays on the manual
checklist below.

## Manual verification

Automated tests do not cover the Google round trip or dark-mode rendering.
After the suites pass, walk this checklist:

1. Register a new account → lands on `/dashboard` showing `Signed in (name)`.
2. Sign out → redirected to `/login`.
3. Sign in with those credentials → back to `/dashboard`.
4. Register again with the same email → "An account with this email already
   exists."
5. Sign in with a wrong password → "Incorrect email or password."
6. Submit an invalid email, a 5-character password, and mismatched password
   confirmation → correct inline field errors, no request sent.
7. Sign in with Google → lands on `/dashboard` showing the Google profile name.
8. Sign out, then sign in with Google using the same address as an existing
   password account → links to that account instead of creating a second user.
   Verify one `users` row and two `accounts` rows.
9. Visit `/dashboard` while signed out → redirected to `/login`.
10. Visit `/login` while signed in → redirected to `/dashboard`.
11. Render both screens under `.dark`.

Items 1–6 and 9–10 are also covered automatically by the Playwright suite;
re-walking them by hand is a sanity check, not the primary evidence. Items 7,
8, and 11 are the ones only a human can confirm.

Plus: `npm test`, `npm run test:e2e`, `npx tsc --noEmit`, and `npm run build`
all clean.

## Risks

**Custom Prisma output path.** better-auth's documentation imports
`PrismaClient` from `@prisma/client`. This project generates to
`src/generated/prisma`. Every example must be adjusted; getting this wrong
produces a confusing runtime failure rather than a type error.

**better-auth CLI and the schema.** `@better-auth/cli generate` may rewrite
more of `schema.prisma` than intended. Generate to a scratch location and merge
by hand rather than letting it overwrite the file in place.

**Next.js 16 conventions.** `proxy.ts` is not `middleware.ts`, and this
codebase uses typed route props (`LayoutProps<"/">`). Training-data patterns for
Next.js will be wrong in specific, quiet ways; the bundled docs under
`node_modules/next/dist/docs/` are the authority.
