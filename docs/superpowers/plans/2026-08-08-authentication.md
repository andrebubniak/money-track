# Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship email/password registration and login, Google sign-in, and a protected `/dashboard` page that displays `Signed in (name)`.

**Architecture:** better-auth owns all authentication, backed by Postgres through the Prisma adapter with standard database-backed sessions. One server instance (`src/lib/auth.ts`), one HTTP surface (`app/api/auth/[...all]/route.ts`), one browser client (`src/lib/auth-client.ts`). Forms are client components using react-hook-form + zod, calling the browser client directly. Route protection is two-layered: an optimistic cookie check in `src/proxy.ts`, and an authoritative session query inside the page itself.

**Tech Stack:** Next.js 16.3, React 19.2, better-auth 1.6, Prisma 7 (Postgres, `@prisma/adapter-pg`), shadcn/ui (`base-vega` style, built on `@base-ui/react`), Tailwind v4, react-hook-form 7 + zod 4.

**Source spec:** `docs/superpowers/specs/2026-08-08-authentication-design.md`
**Visual reference:** the interactive prototype published alongside this plan — it shows every state these screens must produce.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **This is not the Next.js in your training data.** Read `node_modules/next/dist/docs/` before writing route or config code. In particular: `middleware.ts` no longer exists — the convention is `proxy.ts` exporting a function named `proxy`.
- **Prisma client is NOT at `@prisma/client`.** This project generates to `src/generated/prisma`. Import the shared instance from `@/lib/prisma` and never construct a new `PrismaClient`.
- **Do not hand-write shadcn components.** Add them with `npx shadcn@latest add <name>`. This project's style is `base-vega` on `@base-ui/react`, not Radix; components written from memory will be wrong.
- **There is no test framework in this repo, and this plan does not add one.** That was a deliberate, user-approved decision recorded in the spec. Each task therefore ends with concrete verification commands and browser steps with stated expected results, in place of a red/green test cycle. Do not fabricate passing tests. Do not claim a step passed without running it and reading the output.
- **Never commit `.env`.** It is already gitignored. Confirm before every commit.
- **Commit message format** is defined in `.claude/rules/commit-guideline.md`: `<type>(<subject>): <short description>`, kebab-case, imperative mood, no trailing period.
- **Password minimum is 8 characters**, enforced in both zod and better-auth config.
- **Login must not reveal whether an email is registered.** Unknown email and wrong password produce the identical message.
- Copy is **English only**. Do not add i18n scaffolding.
- Out of scope, do not build: email verification, password reset, session-list/revoke UI, theme toggle, real dashboard content.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | *Modify.* Drop `passwordHash`/`googleId`, add better-auth's required user fields, add `Session`/`Account`/`Verification`. |
| `src/lib/auth.ts` | *Create.* The only place better-auth server config is constructed. |
| `src/lib/auth-client.ts` | *Create.* Browser client. The only auth import in form components. |
| `src/lib/auth-errors.ts` | *Create.* better-auth error code → user-facing English. |
| `src/lib/validations/auth.ts` | *Create.* Zod schemas + inferred types, shared by both forms. |
| `src/app/api/auth/[...all]/route.ts` | *Create.* Mounts the better-auth handler. |
| `src/proxy.ts` | *Create.* Optimistic redirect. Not a security boundary. |
| `src/app/(auth)/layout.tsx` | *Create.* Centred-card shell for both auth screens. |
| `src/app/(auth)/login/page.tsx` | *Create.* Server component + inverse guard. |
| `src/app/(auth)/register/page.tsx` | *Create.* Server component + inverse guard. |
| `src/components/auth/login-form.tsx` | *Create.* Client. Email + password. |
| `src/components/auth/register-form.tsx` | *Create.* Client. Name, email, password, confirm. |
| `src/components/auth/google-button.tsx` | *Create.* Client. Shared verbatim by both screens. |
| `src/components/auth/sign-out-button.tsx` | *Create.* Client. |
| `src/app/dashboard/page.tsx` | *Create.* Protected. The authoritative session check lives here. |

**Deviation from the spec's component list, applied deliberately:** the spec named shadcn's `form` component. This plan uses `Label` + `Input` + react-hook-form's `register` and `formState.errors` directly, and does not install `form`. Reason: shadcn's `Form` is a compound wrapper whose availability varies by style, and this project is on `base-vega`/`@base-ui/react` rather than the Radix default. The direct approach produces identical markup and behaviour with one fewer dependency on a component that may not exist in this style. Everything else in the spec's component list is unchanged.

---

## Task 1: Dependencies and environment

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env` (local only — never committed)

**Interfaces:**
- Consumes: nothing.
- Produces: installed packages `better-auth@^1.6.26`, `react-hook-form@^7.85.0`, `zod@^4.4.3`, `@hookform/resolvers@^5.7.1`; env vars `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

- [ ] **Step 1: Install the runtime dependencies**

```bash
npm install better-auth@^1.6.26 react-hook-form@^7.85.0 zod@^4.4.3 @hookform/resolvers@^5.7.1
```

Do **not** install `@better-auth/prisma-adapter`. better-auth 1.6.26 ships the Prisma adapter at the `better-auth/adapters/prisma` subpath, which is confirmed present in its export map. The standalone package is an alternative distribution, not a requirement.

- [ ] **Step 2: Verify the adapter subpath actually resolves**

```bash
node -e "import('better-auth/adapters/prisma').then(m => console.log('prismaAdapter:', typeof m.prismaAdapter))"
```

Expected: `prismaAdapter: function`

If this prints anything else, stop and report it before continuing — every later task imports from this path.

- [ ] **Step 3: Generate an auth secret and add the env vars**

```bash
node -e "console.log('BETTER_AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

Append the printed line to `.env`, then add one more line:

```
BETTER_AUTH_URL=http://localhost:3000
```

`.env` already contains `DATABASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, and `GOOGLE_OAUTH_CLIENT_SECRET`. Leave those untouched.

- [ ] **Step 4: Confirm `.env` is not staged**

```bash
git status --short
```

Expected: `.env` does **not** appear. Only `package.json` and `package-lock.json` are modified. If `.env` appears, stop and fix `.gitignore` before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(dependencies): add better-auth, react-hook-form and zod"
```

---

## Task 2: Database schema and initial migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: Prisma models `User` (reshaped), `Session`, `Account`, `Verification`. Prisma client accessors `prisma.user`, `prisma.session`, `prisma.account`, `prisma.verification` — these names must match better-auth's default model names exactly, which is why the models are singular.

**Why no `modelName`/`fields` config is needed anywhere:** better-auth addresses Prisma models by their client accessor (`prisma.user`), not by table name. Naming the models `User`/`Session`/`Account`/`Verification` makes the accessors match better-auth's defaults. The `@@map`/`@map` directives rename tables and columns at the database level only — Prisma handles that translation and better-auth never sees it. This is what lets the schema keep its snake_case convention with zero mapping configuration.

- [ ] **Step 1: Modify the `User` model**

In `prisma/schema.prisma`, replace these two lines:

```prisma
  passwordHash String? @map("password_hash") // null for Google-only accounts
  googleId     String? @unique @map("google_id") // null for password-only accounts
```

with:

```prisma
  emailVerified Boolean @default(false) @map("email_verified")
  image         String?
```

Then add these two relations to `User`, alongside the existing `categories`/`cards`/etc. relation block:

```prisma
  sessions              Session[]
  accounts              Account[]
```

Leave `id`, `email`, `name`, `currency`, `numberFormat`, `dateFormat`, the timestamps, and every existing relation exactly as they are.

- [ ] **Step 2: Append the three new models**

Add to the end of `prisma/schema.prisma`:

```prisma
// ---------------------------------------------------------------------------
// Better Auth
// ---------------------------------------------------------------------------

model Session {
  id     String @id @default(cuid())
  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  token     String   @unique
  expiresAt DateTime @map("expires_at")
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("sessions")
}

model Account {
  id     String @id @default(cuid())
  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Provider's own id for this account. Equal to userId for credential accounts.
  accountId  String @map("account_id")
  // "credential" for email/password, "google" for Google sign-in.
  providerId String @map("provider_id")

  accessToken           String?   @map("access_token")
  refreshToken          String?   @map("refresh_token")
  accessTokenExpiresAt  DateTime? @map("access_token_expires_at")
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at")
  scope                 String?
  idToken               String?   @map("id_token")

  // Hashed password. Only set on credential accounts.
  password String?

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("accounts")
}

model Verification {
  id String @id @default(cuid())

  identifier String
  value      String
  expiresAt  DateTime @map("expires_at")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([identifier])
  @@map("verifications")
}
```

`Verification` carries no traffic while email verification and password reset are out of scope, but the adapter expects the model to exist.

- [ ] **Step 3: Validate the schema before touching the database**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Create and run the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: a new `prisma/migrations/<timestamp>_init/` directory, all eight tables created, and `prisma generate` running automatically at the end.

This is the project's **first** migration — the schema has never been applied. If Prisma reports drift or an existing non-empty database, stop and report rather than resetting: the target database may not be the one you think it is.

- [ ] **Step 5: Confirm the generated client exposes the new models**

```bash
node -e "const{PrismaClient}=require('./src/generated/prisma/client');const c=Object.keys(new PrismaClient({datasourceUrl:'postgresql://x'}));console.log(['user','session','account','verification'].map(k=>k+':'+(k in new PrismaClient({datasourceUrl:'postgresql://x'}))).join(' '))" 2>/dev/null || npx tsc --noEmit
```

If the node probe is awkward under this Prisma version, `npx tsc --noEmit` is the authoritative check and must pass cleanly.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(authentication): add better-auth models and initial migration"
```

---

## Task 3: better-auth server instance, route handler, and client

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth-client.ts`
- Create: `src/app/api/auth/[...all]/route.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma` (Task 2's models).
- Produces:
  - `auth` — the better-auth server instance. Used later as `auth.api.getSession({ headers })`.
  - `authClient` — browser client. Used later as `authClient.signIn.email(...)`, `authClient.signUp.email(...)`, `authClient.signIn.social(...)`, `authClient.signOut()`.

- [ ] **Step 1: Create the server instance**

Create `src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET as string,
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      // Google asserts the email address as verified, so linking by email is
      // safe here. Do not widen this list without that same guarantee.
      trustedProviders: ["google"],
    },
  },

  user: {
    additionalFields: {
      currency: { type: "string", required: false, input: false },
      numberFormat: { type: "string", required: false, input: false },
      dateFormat: { type: "string", required: false, input: false },
    },
  },

  // nextCookies() must stay last — it is what lets server-side calls set cookies.
  plugins: [nextCookies()],
});
```

`input: false` on the three preference fields means they keep their Prisma defaults and cannot be injected through the signup payload.

- [ ] **Step 2: Create the route handler**

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 3: Create the browser client**

Create `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

No `baseURL` is needed — the client defaults to the current origin, and the handler is mounted at the default `/api/auth` path.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify the handler actually serves requests**

Start the dev server (`npm run dev`), then in a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/get-session
```

Expected: `200`. The body will be `null` because there is no session cookie yet — that is correct, not a failure.

Then confirm the Google provider is wired:

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-in/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","callbackURL":"/dashboard"}'
```

Expected: a JSON body containing a `url` field pointing at `accounts.google.com`. If it returns an error about an unknown provider, the env vars are not being read.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts "src/app/api/auth/[...all]/route.ts"
git commit -m "feat(authentication): configure better-auth server and client"
```

---

## Task 4: shadcn components, validation schemas, and error mapping

**Files:**
- Create: `src/components/ui/card.tsx`, `input.tsx`, `label.tsx`, `alert.tsx`, `separator.tsx` (all via CLI)
- Create: `src/lib/validations/auth.ts`
- Create: `src/lib/auth-errors.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `loginSchema`, `registerSchema` — zod schemas.
  - `LoginValues = z.infer<typeof loginSchema>` → `{ email: string; password: string }`
  - `RegisterValues = z.infer<typeof registerSchema>` → `{ name: string; email: string; password: string; confirmPassword: string }`
  - `authErrorMessage(code?: string | null): string`

- [ ] **Step 1: Add the shadcn components**

```bash
npx shadcn@latest add card input label alert separator
```

Accept overwrites if prompted for components that already exist. `button` is already present and must not be regenerated.

- [ ] **Step 2: Confirm what actually landed**

```bash
ls src/components/ui
```

Expected: `alert.tsx  button.tsx  card.tsx  input.tsx  label.tsx  separator.tsx`

If any component failed to install, stop and report which — do not hand-write a replacement.

- [ ] **Step 3: Create the validation schemas**

Create `src/lib/validations/auth.ts`:

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .pipe(z.email("Enter a valid email address."))
    .transform((value) => value.toLowerCase()),
  // Non-empty only. No length rule here: the minimum has changed before and
  // may change again, and an existing password must stay enterable.
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .pipe(z.email("Enter a valid email address."))
      .transform((value) => value.toLowerCase()),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
```

Note the zod 4 API: `z.email()` is a top-level function, not `z.string().email()`. The `.pipe()` composition is what allows a custom "required" message to fire before the format message.

- [ ] **Step 4: Create the error mapping**

Create `src/lib/auth-errors.ts`:

```ts
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "An account with this email already exists.",
  // Deliberately identical for unknown-email and wrong-password, so the form
  // never confirms which addresses have accounts.
  INVALID_EMAIL_OR_PASSWORD: "Incorrect email or password.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password is too long.",
  INVALID_EMAIL: "Enter a valid email address.",
};

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export function authErrorMessage(code?: string | null): string {
  if (!code) return FALLBACK_MESSAGE;
  return AUTH_ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE;
}
```

- [ ] **Step 5: Verify the schemas behave correctly**

```bash
npx tsx --eval "
import { loginSchema, registerSchema } from './src/lib/validations/auth';
const bad = registerSchema.safeParse({ name: 'A', email: 'nope', password: 'short', confirmPassword: 'other' });
console.log('register invalid ->', bad.success === false);
console.log(bad.success ? '' : bad.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('\n'));
const good = registerSchema.safeParse({ name: 'Ana', email: '  ANA@Example.com ', password: 'hunter2hunter2', confirmPassword: 'hunter2hunter2' });
console.log('register valid ->', good.success, good.success ? good.data.email : '');
const login = loginSchema.safeParse({ email: 'ana@example.com', password: 'x' });
console.log('login one-char password accepted ->', login.success);
" 2>/dev/null || npx tsc --noEmit
```

Expected output:
- `register invalid -> true`, followed by four issues: `name`, `email`, `password`, `confirmPassword`
- `register valid -> true ana@example.com` (proving trim + lowercase)
- `login one-char password accepted -> true`

If `tsx` is unavailable, run `npx tsc --noEmit` instead and verify the schema behaviour manually in the browser during Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui src/lib/validations/auth.ts src/lib/auth-errors.ts
git commit -m "feat(authentication): add form schemas, error mapping and ui components"
```

---

## Task 5: Auth layout, Google button, and the login screen

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/components/auth/google-button.tsx`
- Create: `src/components/auth/login-form.tsx`

**Interfaces:**
- Consumes: `auth` (Task 3), `authClient` (Task 3), `loginSchema`/`LoginValues` (Task 4), `authErrorMessage` (Task 4), shadcn `Card`/`Input`/`Label`/`Alert`/`Separator`/`Button`.
- Produces: `<GoogleButton />` — a client component taking no props, reused verbatim in Task 6.

- [ ] **Step 1: Create the auth layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      {children}
    </div>
  );
}
```

Props are typed inline rather than with Next's generated `LayoutProps<"/">`. Route groups are transparent to routing, so this layout's segment path collides with the root layout's; the explicit type avoids that ambiguity entirely.

- [ ] **Step 2: Create the shared Google button**

Create `src/components/auth/google-button.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    // On success this navigates away, so `pending` is never cleared on the
    // happy path. It is only reset if the call fails and we stay on the page.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    if (error) setPending(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={handleClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.5 5.5 0 0 1-2.4 3.62v3h3.87c2.26-2.09 3.56-5.17 3.56-8.86Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
      {pending ? "Redirecting to Google…" : "Continue with Google"}
    </Button>
  );
}
```

- [ ] **Step 3: Create the login form**

Create `src/components/auth/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { loginSchema, type LoginValues } from "@/lib/validations/auth";

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);

    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setFormError(authErrorMessage(error.code));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return (
    <Card className="w-full max-w-100">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue to your account</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <LoginForm />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton />

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

If the generated `card.tsx` does not export `CardDescription`, drop that import and render the subheading as a plain `<p className="text-sm text-muted-foreground">`. Check the file before assuming.

- [ ] **Step 5: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean. A build failure mentioning `LayoutProps` means Step 1's inline typing was not applied.

- [ ] **Step 6: Verify in the browser**

`npm run dev`, then open `http://localhost:3000/login` and confirm each:

1. The card is centred, roughly 400px wide, matching the prototype.
2. Submitting empty → "Email is required." and "Password is required." inline. No network request in the Network tab.
3. Entering `nope` as the email → "Enter a valid email address."
4. Entering a well-formed but unregistered email with any password → the red alert reads exactly "Incorrect email or password."
5. The submit button reads "Signing in…" and is disabled while the request is in flight.
6. "Continue with Google" navigates to Google's consent screen. (It will fail to come back until the redirect URI is registered — that is Task 7's verification, not this one.)

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)" src/components/auth/google-button.tsx src/components/auth/login-form.tsx
git commit -m "feat(authentication): add login screen with email and google sign-in"
```

---

## Task 6: Register screen

**Files:**
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/components/auth/register-form.tsx`

**Interfaces:**
- Consumes: `auth`, `authClient`, `registerSchema`/`RegisterValues`, `authErrorMessage`, `<GoogleButton />` (Task 5, imported unchanged).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create the register form**

Create `src/components/auth/register-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { registerSchema, type RegisterValues } from "@/lib/validations/auth";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterValues) {
    setFormError(null);

    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });

    if (error) {
      setFormError(authErrorMessage(error.code));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Ana Bubniak"
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the register page**

Create `src/app/(auth)/register/page.tsx`:

```tsx
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GoogleButton } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import { auth } from "@/lib/auth";

export default async function RegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  return (
    <Card className="w-full max-w-100">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Start tracking where your money goes</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <RegisterForm />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>

        <GoogleButton />

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean.

- [ ] **Step 4: Verify in the browser**

`npm run dev`, open `http://localhost:3000/register`:

1. Submit empty → four inline errors, one per field.
2. Name `A`, email `nope`, password `short`, confirm `different` → exactly: "Name must be at least 2 characters.", "Enter a valid email address.", "Password must be at least 8 characters.", "Passwords don't match."
3. Register a genuinely new account → the browser lands on `/dashboard`. It will 404 until Task 7 — that is expected. Confirm the row exists:

```bash
npx prisma studio
```

Expected: one `users` row with the name and lowercased email, and one `accounts` row with `provider_id = "credential"` and a non-null `password`. The `password_hash` column no longer exists.

4. Submit the same email again → "An account with this email already exists."

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/register" src/components/auth/register-form.tsx
git commit -m "feat(authentication): add register screen"
```

---

## Task 7: Protected dashboard, sign-out, and route guard

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/auth/sign-out-button.tsx`
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `auth` (Task 3), `authClient` (Task 3), shadcn `Button`.
- Produces: the completed feature.

- [ ] **Step 1: Create the sign-out button**

Create `src/components/auth/sign-out-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
```

- [ ] **Step 2: Create the protected page**

Create `src/app/dashboard/page.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const displayName = session.user.name ?? session.user.email;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-3.5">
        <span className="text-sm font-semibold">MoneyTrack</span>
        <span className="flex-1" />
        <SignOutButton />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-10 text-center">
        <p className="text-2xl font-semibold tracking-tight">
          Signed in ({displayName})
        </p>
        <p className="font-mono text-sm text-muted-foreground">{session.user.email}</p>
        <p className="mt-4 max-w-[42ch] rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Placeholder page. This route becomes the real spending dashboard
          described in the PRD.
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create the optimistic guard**

Create `src/proxy.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// NOT a security boundary. This only checks that a session cookie exists —
// a hand-forged cookie passes it. Its only job is skipping a wasted render
// for signed-out visitors. The real check is auth.api.getSession() inside
// app/dashboard/page.tsx.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard"],
};
```

The file lives at `src/proxy.ts`, next to `app/` — not at the repo root, because this project uses a `src` directory. In Next.js 16 this convention replaced `middleware.ts`; if you find yourself writing `middleware`, you are working from stale knowledge.

- [ ] **Step 4: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean. The build output should list `/dashboard`, `/login`, `/register`, and `/api/auth/[...all]`, and report that Proxy is active.

- [ ] **Step 5: Register the Google redirect URI**

This step is done in a browser, by a human, and cannot be automated:

In Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client whose ID is in `GOOGLE_OAUTH_CLIENT_ID`, add this to **Authorized redirect URIs**:

```
http://localhost:3000/api/auth/callback/google
```

Save, and allow a minute for it to propagate. Until this is done, Google sign-in fails with `redirect_uri_mismatch`.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard src/components/auth/sign-out-button.tsx src/proxy.ts
git commit -m "feat(authentication): add protected dashboard and route guard"
```

---

## Task 8: Full verification pass

**Files:** none — this task changes no code unless it finds a defect.

**Interfaces:**
- Consumes: everything.
- Produces: a verified feature.

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf .next && npx tsc --noEmit && npm run build
```

Expected: both clean.

- [ ] **Step 2: Run the spec's checklist end to end**

`npm run dev`, then work through all eleven items from the spec's Verification section. Record the actual result of each — do not mark any item passed without observing it.

1. Register a new account → lands on `/dashboard` showing `Signed in (name)`.
2. Sign out → redirected to `/login`.
3. Sign in with those credentials → back to `/dashboard`.
4. Register again with the same email → "An account with this email already exists."
5. Sign in with a wrong password → "Incorrect email or password."
6. Invalid email, 5-character password, mismatched confirmation → correct inline field errors, no request sent.
7. Sign in with Google → lands on `/dashboard` showing the Google profile name.
8. Sign out, then sign in with Google using the same address as an existing password account → links to that account. Verify in `npx prisma studio`: **one** `users` row, **two** `accounts` rows (`credential` and `google`) sharing the same `user_id`.
9. Visit `/dashboard` while signed out → redirected to `/login`.
10. Visit `/login` while signed in → redirected to `/dashboard`.
11. Both auth screens render correctly with `class="dark"` on `<html>` (set it in devtools).

- [ ] **Step 3: Confirm the guard is not the only defense**

With the dev server running and no session, forge a cookie to prove the proxy is bypassable but the page is not:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard \
  -H "Cookie: better-auth.session_token=forged-value"
```

Expected: `307` or `302` — the proxy lets it through, then the page's `getSession()` returns null and redirects to `/login`. If this returns `200` with dashboard content, the authoritative check in `app/dashboard/page.tsx` is broken and must be fixed before proceeding.

- [ ] **Step 4: Confirm no secrets are tracked**

```bash
git status --short && git ls-files | grep -E "^\.env$" && echo "LEAK" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 5: Report results**

State plainly which of the eleven checklist items passed, which failed, and what was skipped and why. If Google sign-in could not be tested because the redirect URI was not registered, say that explicitly rather than reporting it as passing.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: architecture → Task 3; database schema → Task 2; route structure → Tasks 5–7; two-layer route protection → Task 7 (verified in Task 8 Step 3); components → Tasks 5–6; validation → Task 4; error handling → Task 4, exercised in Tasks 5–6; visual design → Tasks 5–6 against the prototype; dependencies and environment → Task 1; verification → Task 8; the account-linking decision → Task 3 config, verified in Task 8 item 8.

**Deliberate deviation.** shadcn's `form` component is not installed; forms use `Label` + `Input` + react-hook-form directly. Reasoning is recorded in the File Structure section.

**Type consistency.** `authErrorMessage(code?: string | null)` is defined in Task 4 and called with `error.code` in Tasks 5 and 6. `LoginValues`/`RegisterValues` are produced in Task 4 and consumed as `useForm` generics in Tasks 5/6. `<GoogleButton />` is defined in Task 5 and imported unchanged in Task 6. `prismaAdapter` is imported from `better-auth/adapters/prisma` in Task 3, the exact path probed in Task 1 Step 2.

**Known risk left to the implementer.** Task 5 Step 4 notes that `CardDescription` may not be exported by the generated `card.tsx`, with the fallback stated. This is the one place the plan cannot be certain in advance, because the component is generated by an external CLI.
