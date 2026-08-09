# Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship email/password registration and login, Google sign-in, and a protected `/dashboard` page that displays `Signed in (name)` — with Vitest unit coverage and a Playwright end-to-end suite.

**Architecture:** better-auth owns all authentication, backed by Postgres through the Prisma adapter with standard database-backed sessions. One server instance (`src/lib/auth.ts`), one HTTP surface (`app/api/auth/[...all]/route.ts`), one browser client (`src/lib/auth-client.ts`). Forms are client components using react-hook-form + zod, calling the browser client directly. Route protection is two-layered: an optimistic cookie check in `src/proxy.ts`, and an authoritative session query inside the page itself.

**Tech Stack:** Next.js 16.3, React 19.2, better-auth 1.6, Prisma 7 (Postgres, `@prisma/adapter-pg`), shadcn/ui (`base-vega` style, built on `@base-ui/react`), Tailwind v4, react-hook-form 7 + zod 4, Vitest 4 + Testing Library, Playwright 1.62.

**Source spec:** `docs/superpowers/specs/2026-08-08-authentication-design.md`
**Visual reference:** the interactive prototype published alongside this plan — it shows every state these screens must produce.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **This is not the Next.js in your training data.** Read `node_modules/next/dist/docs/` before writing route or config code. In particular: `middleware.ts` no longer exists — the convention is `proxy.ts` exporting a function named `proxy`.
- **Prisma client is NOT at `@prisma/client`.** This project generates to `src/generated/prisma`. Import the shared instance from `@/lib/prisma` and never construct a new `PrismaClient` in application code.
- **Do not hand-write shadcn components.** Add them with `npx shadcn@latest add <name>`. This project's style is `base-vega` on `@base-ui/react`, not Radix; components written from memory will be wrong.
- **Unit specs live next to their source.** `login-form.tsx` → `login-form.spec.tsx`, same directory. Never a `__tests__` folder.
- **End-to-end specs live in `e2e/` at the project root**, one file per user flow.
- **Tests must fail before they pass.** Every TDD step that says "run and verify it fails" means running it and reading the output. A test that passes before the implementation exists is testing nothing — stop and fix the test.
- **Never claim a suite passed without running it** and reading the result.
- **Never commit `.env`.** It is already gitignored. Confirm before every commit.
- **Commit message format** is defined in `.claude/rules/commit-guideline.md`: `<type>(<subject>): <short description>`, kebab-case, imperative mood, no trailing period.
- **Password minimum is 8 characters**, enforced in both zod and better-auth config.
- **Login must not reveal whether an email is registered.** Unknown email and wrong password produce the identical message.
- Copy is **English only**. Do not add i18n scaffolding.
- Out of scope, do not build: email verification, password reset, session-list/revoke UI, theme toggle, real dashboard content.

---

## File Structure

### Application

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

### Test infrastructure

| File | Responsibility |
| --- | --- |
| `vitest.config.mts` | Vitest config. jsdom, path aliases, `src/**/*.spec.*` only. `.mts` so Vite loads it as ESM without a project-wide `"type": "module"`. |
| `vitest.setup.ts` | jest-dom matchers, RTL cleanup. |
| `playwright.config.ts` | Playwright config. `e2e/` only, dev server pointed at the test database. |
| `e2e/global-setup.ts` | Migrate + truncate the test database before the suite. |
| `e2e/helpers.ts` | Shared fixtures: unique email generator, register helper. |

### Specs

| Spec | Task |
| --- | --- |
| `src/lib/validations/auth.spec.ts` | 4 |
| `src/lib/auth-errors.spec.ts` | 4 |
| `src/components/auth/google-button.spec.tsx` | 6 |
| `src/components/auth/login-form.spec.tsx` | 7 |
| `src/components/auth/register-form.spec.tsx` | 8 |
| `src/components/auth/sign-out-button.spec.tsx` | 9 |
| `src/proxy.spec.ts` | 9 |
| `e2e/registration.spec.ts` | 10 |
| `e2e/login.spec.ts` | 11 |
| `e2e/logout.spec.ts` | 11 |
| `e2e/route-protection.spec.ts` | 12 |
| `e2e/google-sign-in.spec.ts` | 12 |

**Two files get no spec, deliberately.** `src/lib/auth.ts` is pure configuration with no branches — a spec would only restate the source. The async server-component pages (`login/page.tsx`, `register/page.tsx`, `dashboard/page.tsx`) are covered by the Playwright suite, which exercises them properly; RSC unit testing would be fragile for no extra signal.

**Deviation from the spec's component list, applied deliberately:** the spec named shadcn's `form` component. This plan uses `Label` + `Input` + react-hook-form's `register` and `formState.errors` directly, and does not install `form`. Reason: shadcn's `Form` is a compound wrapper whose availability varies by style, and this project is on `base-vega`/`@base-ui/react` rather than the Radix default. The direct approach produces identical markup and behaviour with one fewer dependency on a component that may not exist in this style.

---

## Task 1: Dependencies and environment

**Files:**
- Modify: `package.json`
- Modify: `.env` (local only — never committed)

**Interfaces:**
- Consumes: nothing.
- Produces: installed runtime and test packages; env vars `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL_TEST`.

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install better-auth@^1.6.26 react-hook-form@^7.85.0 zod@^4.4.3 @hookform/resolvers@^5.7.1
```

Do **not** install `@better-auth/prisma-adapter`. better-auth 1.6.26 ships the Prisma adapter at the `better-auth/adapters/prisma` subpath, confirmed present in its export map. The standalone package is an alternative distribution, not a requirement.

- [ ] **Step 2: Install test dependencies**

```bash
npm install -D vitest@^4.1.10 @vitejs/plugin-react@^6.0.5 jsdom@^30.0.1 @testing-library/react@^16.3.2 @testing-library/jest-dom@^7.0.0 @testing-library/user-event@^14.6.3 @playwright/test@^1.62.1
```

> **Amended 2026-08-08 during execution.** `vite-tsconfig-paths` was originally
> in this list. Vitest 4 bundles Vite 8, which resolves tsconfig paths natively
> via `resolve.tsconfigPaths` and prints a deprecation warning when the plugin
> is present. The plugin is obsolete here; Task 2 uses the native option.
> `@testing-library/dom@^10.4.1` must also be installed — npm's
> `--legacy-peer-deps` (needed for an unrelated optional-peer conflict)
> suppresses auto-install of that required peer.

- [ ] **Step 3: Install the Playwright browser**

```bash
npx playwright install chromium
```

Only chromium — the suite runs one project, and downloading three browsers wastes several hundred megabytes.

- [ ] **Step 4: Verify the better-auth adapter subpath resolves**

```bash
node -e "import('better-auth/adapters/prisma').then(m => console.log('prismaAdapter:', typeof m.prismaAdapter))"
```

Expected: `prismaAdapter: function`

If this prints anything else, stop and report before continuing — every later task imports from this path.

- [ ] **Step 5: Create the test database**

The e2e suite must never touch the development database. Create a second one:

```bash
psql "$DATABASE_URL" -c "CREATE DATABASE money_track_test;"
```

If `psql` is unavailable, create the database through whatever tool you use to administer this Postgres instance. If the database is hosted and you cannot create databases, use a separate free-tier instance instead — do not point the test suite at the dev database.

- [ ] **Step 6: Add the environment variables**

Generate a secret:

```bash
node -e "console.log('BETTER_AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

Append the printed line to `.env`, plus:

```
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL_TEST=<same connection string as DATABASE_URL, but with the database name replaced by money_track_test>
```

Leave `DATABASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, and `GOOGLE_OAUTH_CLIENT_SECRET` untouched.

- [ ] **Step 7: Confirm `.env` is not staged**

```bash
git status --short
```

Expected: `.env` does **not** appear. If it does, stop and fix `.gitignore`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(dependencies): add better-auth, form and test tooling"
```

---

## Task 2: Test infrastructure

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `e2e/global-setup.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: packages from Task 1.
- Produces: `npm test` (Vitest, run-once), `npm run test:watch`, `npm run test:e2e`. Vitest resolves `@/…` aliases and runs only `src/**/*.spec.{ts,tsx}`. Playwright runs only `e2e/`.

This task ends with a deliberately trivial spec proving the harness works, which is then deleted. Everything after this task can trust the runner.

- [ ] **Step 1: Create the Vitest config**

Create `vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite 8 resolves tsconfig `paths` natively. Do not add
  // `vite-tsconfig-paths` — Vite warns that the plugin is redundant.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Only co-located specs under src. e2e/ belongs to Playwright, and if
    // Vitest picks those files up it will fail on Playwright's imports.
    include: ["src/**/*.spec.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "src/generated/**"],
  },
});
```

- [ ] **Step 2: Create the Vitest setup file**

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Create the Playwright config**

Create `playwright.config.ts`:

```ts
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  throw new Error(
    "DATABASE_URL_TEST is not set. The e2e suite must run against its own " +
      "database — refusing to fall back to DATABASE_URL.",
  );
}

// Global setup TRUNCATEs every table. If the two URLs ever point at the same
// database, that wipes development data with no warning. Fail closed.
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL_TEST is identical to DATABASE_URL. The e2e suite truncates " +
      "all tables — refusing to run against the development database.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  // These tests share one database and one dev server, so they run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    // Next.js does not override variables already present in process.env,
    // so this wins over the DATABASE_URL in .env.
    env: { DATABASE_URL: testDatabaseUrl },
  },
});
```

`reuseExistingServer: false` matters: if you already have `npm run dev` running against the *development* database, reusing it would point the suite at your real data.

- [ ] **Step 4: Create the e2e global setup**

Create `e2e/global-setup.ts`:

```ts
import { execSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set.");

  // Bring the test database up to the current schema.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  // Start every run from empty. CASCADE clears the dependent app tables too.
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$executeRawUnsafe(
      "TRUNCATE TABLE sessions, accounts, verifications, users RESTART IDENTITY CASCADE",
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
```

This references tables created in Task 3. It will fail until then — that is expected and is why the harness check in Step 7 uses Vitest only.

- [ ] **Step 5: Add the scripts**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 6: Ignore Playwright's output**

Append to `.gitignore`:

```
# playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 7: Write a throwaway spec to prove the harness works**

Create `src/lib/harness-check.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("test harness", () => {
  it("resolves the @/ alias and runs assertions", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("provides a DOM", () => {
    document.body.innerHTML = "<main id='probe'>ok</main>";
    expect(document.getElementById("probe")).toHaveTextContent("ok");
  });
});
```

The second assertion uses `toHaveTextContent`, which only exists if `vitest.setup.ts` loaded jest-dom. It proves three things at once: aliases, jsdom, and matchers.

- [ ] **Step 8: Run it**

```bash
npm test
```

Expected: `2 passed`. If the alias fails, `vite-tsconfig-paths` is not wired. If `toHaveTextContent` is not a function, `setupFiles` is not loading.

- [ ] **Step 9: Delete the throwaway spec**

```bash
rm src/lib/harness-check.spec.ts
```

Its only job was proving the harness. Leaving it behind would mean permanently testing `clsx`.

- [ ] **Step 10: Commit**

```bash
git add vitest.config.mts vitest.setup.ts playwright.config.ts e2e/global-setup.ts package.json package-lock.json .gitignore
git commit -m "chore(testing): set up vitest and playwright"
```

---

## Task 3: Database schema and initial migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: Prisma models `User` (reshaped), `Session`, `Account`, `Verification`. Client accessors `prisma.user`, `prisma.session`, `prisma.account`, `prisma.verification` — these must match better-auth's default model names exactly, which is why the models are singular.

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

Then add these two relations to `User`, alongside the existing `categories`/`cards`/etc. block:

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

- [ ] **Step 3: Validate before touching the database**

```bash
npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Create and run the initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: a new `prisma/migrations/<timestamp>_init/` directory and all ten tables created — the seven pre-existing app models (`users`, `categories`, `cards`, `transactions`, `recurring_transactions`, `expense_plans`, `expense_plan_items`) plus the three new ones (`sessions`, `accounts`, `verifications`).

`prisma migrate dev` may or may not run `prisma generate` for you on Prisma 7. Run `npx prisma generate` explicitly afterwards and confirm it succeeds before the type-check in Step 5 — a stale client will produce confusing type errors.

This is the project's **first** migration — the schema has never been applied. If Prisma reports drift or a non-empty existing database, stop and report rather than resetting: the target database may not be the one you think it is.

- [ ] **Step 5: Type-check against the regenerated client**

```bash
npx tsc --noEmit
```

Expected: clean. This confirms the generated client picked up the new models.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(authentication): add better-auth models and initial migration"
```

---

## Task 4: Validation schemas and error mapping (TDD)

**Files:**
- Create: `src/lib/validations/auth.ts`, `src/lib/validations/auth.spec.ts`
- Create: `src/lib/auth-errors.ts`, `src/lib/auth-errors.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `loginSchema`, `registerSchema` — zod schemas.
  - `LoginValues = z.infer<typeof loginSchema>` → `{ email: string; password: string }`
  - `RegisterValues = z.infer<typeof registerSchema>` → `{ name: string; email: string; password: string; confirmPassword: string }`
  - `authErrorMessage(code?: string | null): string`

These are pure functions with no I/O — the best possible TDD candidates. Write the specs first.

- [ ] **Step 1: Write the failing schema spec**

Create `src/lib/validations/auth.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/validations/auth";

function errorsFor(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe("loginSchema", () => {
  it("accepts a valid email and any non-empty password", () => {
    const result = loginSchema.safeParse({ email: "ana@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty email with a required message", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret123" });
    expect(errorsFor(result).email).toBe("Email is required.");
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "secret123" });
    expect(errorsFor(result).email).toBe("Enter a valid email address.");
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "ana@example.com", password: "" });
    expect(errorsFor(result).password).toBe("Password is required.");
  });

  it("does not impose a minimum length on the password", () => {
    // An existing account's password predates any rule we add later, so the
    // login form must never reject it client-side.
    const result = loginSchema.safeParse({ email: "ana@example.com", password: "abc" });
    expect(result.success).toBe(true);
  });

  it("trims and lowercases the email", () => {
    const result = loginSchema.safeParse({ email: "  ANA@Example.COM  ", password: "secret123" });
    expect(result.success && result.data.email).toBe("ana@example.com");
  });
});

describe("registerSchema", () => {
  const valid = {
    name: "Ana Bubniak",
    email: "ana@example.com",
    password: "hunter2hunter2",
    confirmPassword: "hunter2hunter2",
  };

  it("accepts a complete valid payload", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name of at least two characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "A" });
    expect(errorsFor(result).name).toBe("Name must be at least 2 characters.");
  });

  it("trims whitespace from the name before measuring it", () => {
    const result = registerSchema.safeParse({ ...valid, name: "  A  " });
    expect(errorsFor(result).name).toBe("Name must be at least 2 characters.");
  });

  it("requires a password of at least eight characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" });
    expect(errorsFor(result).password).toBe("Password must be at least 8 characters.");
  });

  it("reports a mismatch on the confirmPassword field, not on password", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "different" });
    expect(errorsFor(result).confirmPassword).toBe("Passwords don't match.");
    expect(errorsFor(result).password).toBeUndefined();
  });

  it("requires the confirmation to be filled in", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "" });
    expect(errorsFor(result).confirmPassword).toBe("Please confirm your password.");
  });

  it("reports every invalid field at once", () => {
    const result = registerSchema.safeParse({
      name: "A",
      email: "nope",
      password: "short",
      confirmPassword: "different",
    });
    const errors = errorsFor(result);
    expect(Object.keys(errors).sort()).toEqual(["confirmPassword", "email", "name", "password"]);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
npm test -- src/lib/validations/auth.spec.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/validations/auth"`. The module does not exist yet.

- [ ] **Step 3: Write the schemas**

Create `src/lib/validations/auth.ts`:

```ts
import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .pipe(z.email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email,
  // Non-empty only. No length rule: the minimum has changed before and may
  // change again, and an existing password must stay enterable.
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email,
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .superRefine((values, ctx) => {
    // Guard on a non-empty confirmPassword so this never collides with the
    // shape-level "Please confirm your password." issue on the same path —
    // in zod 4.4.3, .refine() runs even when the object shape already
    // failed, and both issues would otherwise land on confirmPassword.
    if (values.confirmPassword && values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords don't match.",
        path: ["confirmPassword"],
      });
    }
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
```

Note the zod 4 API: `z.email()` is a top-level function, not `z.string().email()`. The `.pipe()` composition is what makes the "required" message fire before the format message.

- [ ] **Step 4: Run and verify it passes**

```bash
npm test -- src/lib/validations/auth.spec.ts
```

Expected: PASS, 13 tests.

> **Amended 2026-08-08 during execution.** This step originally used `.refine()`
> and warned that zod might *short-circuit* it after a shape failure, dropping
> the fourth key. The real zod 4.4.3 behaviour is the opposite: `.refine()`
> still runs, so an empty `confirmPassword` produces **two** issues on the same
> `confirmPassword` path — the required message and the mismatch message. The
> spec's `errorsFor()` helper is last-write-wins, so the mismatch message
> masked the required one and "requires the confirmation to be filled in"
> failed. The guarded `.superRefine()` above fixes the root cause in the
> schema rather than patching the test helper, which matters because Tasks 7–8
> feed this schema to react-hook-form's zod resolver. Verified independently:
> guarded, an empty confirmation yields exactly one issue; a non-empty
> mismatch (including whitespace-only) still reports "Passwords don't match."

- [ ] **Step 5: Write the failing error-mapping spec**

Create `src/lib/auth-errors.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/lib/auth-errors";

describe("authErrorMessage", () => {
  it("maps the duplicate-signup code better-auth actually returns", () => {
    // Verified against node_modules/better-auth/dist/api/routes/sign-up.mjs:208.
    expect(authErrorMessage("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toBe(
      "An account with this email already exists.",
    );
  });

  it("also maps the admin-plugin spelling, against version drift", () => {
    expect(authErrorMessage("USER_ALREADY_EXISTS")).toBe(
      "An account with this email already exists.",
    );
  });

  it("maps bad credentials", () => {
    expect(authErrorMessage("INVALID_EMAIL_OR_PASSWORD")).toBe(
      "Incorrect email or password.",
    );
  });

  it("maps a too-short password", () => {
    expect(authErrorMessage("PASSWORD_TOO_SHORT")).toBe(
      "Password must be at least 8 characters.",
    );
  });

  it("falls back for an unrecognised code", () => {
    expect(authErrorMessage("SOME_FUTURE_CODE")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("falls back for undefined", () => {
    expect(authErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("falls back for null", () => {
    expect(authErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("does not leak whether an email exists", () => {
    // Both failure modes must be indistinguishable to the user.
    expect(authErrorMessage("INVALID_EMAIL_OR_PASSWORD")).not.toMatch(/email.*not found|no account|unknown/i);
  });

  it("is not fooled by inherited object properties", () => {
    expect(authErrorMessage("toString")).toBe("Something went wrong. Please try again.");
  });
});
```

That last test matters: a naive `code in MESSAGES` check would return `true` for `"toString"` and blow up on inherited prototype properties.

- [ ] **Step 6: Run and verify it fails**

```bash
npm test -- src/lib/auth-errors.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Write the error mapping**

Create `src/lib/auth-errors.ts`:

```ts
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // What better-auth's sign-up route actually throws (sign-up.mjs:208).
  // The shorter USER_ALREADY_EXISTS exists only in the admin plugin, which
  // this app does not use — it is mapped too, purely against version drift.
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "An account with this email already exists.",
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
  // Object.hasOwn, not `in` — `in` would match inherited keys like "toString".
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code)
    ? AUTH_ERROR_MESSAGES[code]
    : FALLBACK_MESSAGE;
}
```

- [ ] **Step 8: Run and verify it passes**

```bash
npm test
```

Expected: PASS, 22 tests across 2 files.

- [ ] **Step 9: Commit**

```bash
git add src/lib/validations src/lib/auth-errors.ts src/lib/auth-errors.spec.ts
git commit -m "feat(authentication): add form schemas and error mapping"
```

---

## Task 5: better-auth server instance, route handler, and client

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`, models from Task 3.
- Produces:
  - `auth` — server instance. Used later as `auth.api.getSession({ headers })`.
  - `authClient` — browser client. Used later as `authClient.signIn.email(...)`, `authClient.signUp.email(...)`, `authClient.signIn.social(...)`, `authClient.signOut()`.

No unit spec here — this file is configuration with no branches. It is verified by live HTTP calls in Step 5, and thoroughly by the e2e suite.

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

No `baseURL` needed — the client defaults to the current origin, and the handler sits at the default `/api/auth` path.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify the handler serves requests**

Start `npm run dev`, then in a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/get-session
```

Expected: `200`. The body is `null` because there is no session cookie — correct, not a failure.

Then confirm the Google provider is wired:

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-in/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","callbackURL":"/dashboard"}'
```

Expected: JSON containing a `url` field pointing at `accounts.google.com`. An "unknown provider" error means the env vars are not being read.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts "src/app/api/auth/[...all]/route.ts"
git commit -m "feat(authentication): configure better-auth server and client"
```

---

## Task 6: shadcn components, auth layout, and Google button (TDD)

**Files:**
- Create: `src/components/ui/card.tsx`, `input.tsx`, `label.tsx`, `alert.tsx`, `separator.tsx` (via CLI)
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/components/auth/google-button.tsx`, `src/components/auth/google-button.spec.tsx`

**Interfaces:**
- Consumes: `authClient` (Task 5), shadcn `Button`.
- Produces: `<GoogleButton />` — a client component taking no props, reused verbatim in Tasks 7 and 8.

- [ ] **Step 1: Add the shadcn components**

```bash
npx shadcn@latest add card input label alert separator
```

`button` already exists and must not be regenerated.

- [ ] **Step 2: Confirm what landed**

```bash
ls src/components/ui && grep -o "CardDescription" src/components/ui/card.tsx | head -1
```

Expected: `alert.tsx  button.tsx  card.tsx  input.tsx  label.tsx  separator.tsx`, and `CardDescription` printed once.

If `CardDescription` is absent, Tasks 7 and 8 must render the subheading as a plain `<p className="text-sm text-muted-foreground">` instead. Note which it is now — do not discover it during a build failure. If any component failed to install, stop and report; do not hand-write a replacement.

- [ ] **Step 3: Create the auth layout**

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

Props are typed inline rather than with Next's generated `LayoutProps<"/">`. Route groups are transparent to routing, so this layout's segment path collides with the root layout's; the explicit type avoids that ambiguity.

- [ ] **Step 4: Write the failing Google button spec**

Create `src/components/auth/google-button.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInSocial } = vi.hoisted(() => ({ signInSocial: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: signInSocial } },
}));

import { GoogleButton } from "@/components/auth/google-button";

describe("GoogleButton", () => {
  beforeEach(() => {
    signInSocial.mockReset();
    signInSocial.mockResolvedValue({ error: null });
  });

  it("renders the idle label", () => {
    render(<GoogleButton />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("starts the Google flow with the dashboard callback", async () => {
    const user = userEvent.setup();
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/dashboard",
    });
  });

  it("shows a pending label and disables itself while redirecting", async () => {
    const user = userEvent.setup();
    // Never resolves — the redirect would normally navigate away.
    signInSocial.mockImplementation(() => new Promise(() => {}));
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = screen.getByRole("button", { name: /redirecting to google/i });
    expect(button).toBeDisabled();
  });

  it("recovers to the idle label when the call fails", async () => {
    const user = userEvent.setup();
    signInSocial.mockResolvedValue({ error: { code: "SOMETHING_BROKE" } });
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = await screen.findByRole("button", { name: /continue with google/i });
    expect(button).toBeEnabled();
  });

  it("recovers when the call throws instead of returning an error", async () => {
    const user = userEvent.setup();
    signInSocial.mockRejectedValue(new Error("network down"));
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = await screen.findByRole("button", { name: /continue with google/i });
    expect(button).toBeEnabled();
  });
});
```

- [ ] **Step 5: Run and verify it fails**

```bash
npm test -- src/components/auth/google-button.spec.tsx
```

Expected: FAIL — cannot resolve `@/components/auth/google-button`.

- [ ] **Step 6: Write the Google button**

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
    try {
      // On success this navigates away, so `pending` is never cleared on the
      // happy path. It is only reset if the call fails and we stay on the page.
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
      if (error) setPending(false);
    } catch {
      // better-fetch returns errors as values by default, so this is the
      // defensive path. A thrown rejection must not strand the button in a
      // permanently disabled state with no way to retry.
      setPending(false);
    }
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

- [ ] **Step 7: Run and verify it passes**

```bash
npm test
```

Expected: PASS, 28 tests across 3 files.

If the button's accessible name includes stray whitespace and the regex misses, check that the `<svg>` carries `aria-hidden="true"` — without it the SVG contributes to the accessible name.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui "src/app/(auth)/layout.tsx" src/components/auth/google-button.tsx src/components/auth/google-button.spec.tsx
git commit -m "feat(authentication): add auth layout and google sign-in button"
```

---

## Task 7: Login screen (TDD)

**Files:**
- Create: `src/components/auth/login-form.tsx`, `src/components/auth/login-form.spec.tsx`
- Create: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `auth`, `authClient`, `loginSchema`/`LoginValues`, `authErrorMessage`, `<GoogleButton />`, shadcn components.
- Produces: `<LoginForm />` — client component, no props.

- [ ] **Step 1: Write the failing login form spec**

Create `src/components/auth/login-form.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInEmail, push, refresh } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signInEmail } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { LoginForm } from "@/components/auth/login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    push.mockReset();
    refresh.mockReset();
    signInEmail.mockResolvedValue({ error: null });
  });

  it("blocks submission and shows field errors when empty", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed email without calling the server", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "nope");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("submits normalised credentials", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "  ANA@Example.com ");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(signInEmail).toHaveBeenCalledWith({
        email: "ana@example.com",
        password: "secret123",
      });
    });
  });

  it("redirects to the dashboard on success", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders a mapped server error and stays put", async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back for an unrecognised server error", async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ error: { code: "WAT" } });
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  });

  it("shows the generic error when the call throws instead of returning one", async () => {
    const user = userEvent.setup();
    signInEmail.mockRejectedValue(new Error("network down"));
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("clears a previous error when resubmitting", async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("alert");

    signInEmail.mockResolvedValue({ error: null });
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("disables the button while the request is in flight", async () => {
    const user = userEvent.setup();
    signInEmail.mockImplementation(() => new Promise(() => {}));
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ana@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("marks invalid fields for assistive technology", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true"),
    );
  });
});
```

- [ ] **Step 2: Run and verify it fails**

```bash
npm test -- src/components/auth/login-form.spec.tsx
```

Expected: FAIL — cannot resolve `@/components/auth/login-form`.

- [ ] **Step 3: Write the login form**

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

    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (error) {
        setFormError(authErrorMessage(error.code));
        return;
      }
    } catch {
      // better-fetch returns errors as values by default, so this is the
      // defensive path. A thrown rejection must surface as a message rather
      // than leaving the form looking like nothing happened.
      setFormError(authErrorMessage(null));
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
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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

- [ ] **Step 4: Run and verify it passes**

```bash
npm test -- src/components/auth/login-form.spec.tsx
```

Expected: PASS, 10 tests.

If "submits normalised credentials" fails because the email arrives untrimmed, the resolver is not applying the schema's `.transform()` — confirm `zodResolver` is wired and the schema is `loginSchema`, not a hand-rolled duplicate.

- [ ] **Step 5: Create the login page**

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
        <CardTitle className="text-xl">
          {/* A real <h1>: CardTitle renders a plain div, so without this the
              page has no heading element at all. Tailwind preflight resets
              h1 size/weight/margin to inherit, so this is visually identical. */}
          <h1>Welcome back</h1>
        </CardTitle>
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

If Task 6 Step 2 found no `CardDescription`, drop that import and use `<p className="text-sm text-muted-foreground">Sign in to continue to your account</p>`.

- [ ] **Step 6: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean.

- [ ] **Step 7: Compare against the prototype**

`npm run dev`, open `http://localhost:3000/login`, and check the card is centred at roughly 400px with the same field order, separator, and footer link as the prototype.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(auth)/login" src/components/auth/login-form.tsx src/components/auth/login-form.spec.tsx
git commit -m "feat(authentication): add login screen"
```

---

## Task 8: Register screen (TDD)

**Files:**
- Create: `src/components/auth/register-form.tsx`, `src/components/auth/register-form.spec.tsx`
- Create: `src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `auth`, `authClient`, `registerSchema`/`RegisterValues`, `authErrorMessage`, `<GoogleButton />` (Task 6, imported unchanged).
- Produces: `<RegisterForm />` — client component, no props.

- [ ] **Step 1: Write the failing register form spec**

Create `src/components/auth/register-form.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signUpEmail, push, refresh } = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { RegisterForm } from "@/components/auth/register-form";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^name$/i), "Ana Bubniak");
  await user.type(screen.getByLabelText(/^email$/i), "ana@example.com");
  await user.type(screen.getByLabelText(/^password$/i), "hunter2hunter2");
  await user.type(screen.getByLabelText(/confirm password/i), "hunter2hunter2");
}

describe("RegisterForm", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    push.mockReset();
    refresh.mockReset();
    signUpEmail.mockResolvedValue({ error: null });
  });

  it("shows an error for every empty field", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Name must be at least 2 characters.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm your password.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("reports a password mismatch on the confirmation field", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Ana Bubniak");
    await user.type(screen.getByLabelText(/^email$/i), "ana@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2hunter2");
    await user.type(screen.getByLabelText(/confirm password/i), "something-else");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a password under eight characters", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/^name$/i), "Ana Bubniak");
    await user.type(screen.getByLabelText(/^email$/i), "ana@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.type(screen.getByLabelText(/confirm password/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("submits name, email and password but never the confirmation", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(signUpEmail).toHaveBeenCalledWith({
        name: "Ana Bubniak",
        email: "ana@example.com",
        password: "hunter2hunter2",
      });
    });
  });

  it("redirects to the dashboard on success", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the duplicate-account error", async () => {
    const user = userEvent.setup();
    // The code better-auth's sign-up route actually returns. Do not shorten
    // this to USER_ALREADY_EXISTS — that spelling is admin-plugin only, and
    // mocking it here once masked a real production bug.
    signUpEmail.mockResolvedValue({
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the generic error when the call throws instead of returning one", async () => {
    const user = userEvent.setup();
    signUpEmail.mockRejectedValue(new Error("network down"));
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("disables the button while the request is in flight", async () => {
    const user = userEvent.setup();
    signUpEmail.mockImplementation(() => new Promise(() => {}));
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("button", { name: /creating account/i })).toBeDisabled();
  });
});
```

`fillValidForm` uses anchored patterns (`/^password$/i`) because `getByLabelText(/password/i)` would match both the password and confirm-password fields and throw.

- [ ] **Step 2: Run and verify it fails**

```bash
npm test -- src/components/auth/register-form.spec.tsx
```

Expected: FAIL — cannot resolve `@/components/auth/register-form`.

- [ ] **Step 3: Write the register form**

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

    try {
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });

      if (error) {
        setFormError(authErrorMessage(error.code));
        return;
      }
    } catch {
      // better-fetch returns errors as values by default, so this is the
      // defensive path. A thrown rejection must surface as a message rather
      // than leaving the form looking like nothing happened.
      setFormError(authErrorMessage(null));
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

- [ ] **Step 4: Run and verify it passes**

```bash
npm test
```

Expected: PASS, 46 tests across 5 files.

- [ ] **Step 5: Create the register page**

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
        <CardTitle className="text-xl">
          {/* A real <h1>: CardTitle renders a plain div, so without this the
              page has no heading element at all. Tailwind preflight resets
              h1 size/weight/margin to inherit, so this is visually identical. */}
          <h1>Create your account</h1>
        </CardTitle>
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

Apply the same `CardDescription` fallback if needed.

- [ ] **Step 6: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/register" src/components/auth/register-form.tsx src/components/auth/register-form.spec.tsx
git commit -m "feat(authentication): add register screen"
```

---

## Task 9: Protected dashboard, sign-out, and route guard (TDD)

**Files:**
- Create: `src/components/auth/sign-out-button.tsx`, `src/components/auth/sign-out-button.spec.tsx`
- Create: `src/proxy.ts`, `src/proxy.spec.ts`
- Create: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `auth`, `authClient`, shadcn `Button`.
- Produces: `proxy(request: NextRequest)`, `<SignOutButton />`.

- [ ] **Step 1: Write the failing sign-out spec**

Create `src/components/auth/sign-out-button.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut, push, refresh } = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ authClient: { signOut } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { SignOutButton } from "@/components/auth/sign-out-button";

describe("SignOutButton", () => {
  beforeEach(() => {
    signOut.mockReset();
    push.mockReset();
    refresh.mockReset();
    signOut.mockResolvedValue({});
  });

  it("renders the idle label", () => {
    render(<SignOutButton />);
    expect(screen.getByRole("button", { name: /^sign out$/i })).toBeInTheDocument();
  });

  it("signs out and returns to login", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalled();
  });

  it("does not redirect before sign-out resolves", async () => {
    const user = userEvent.setup();
    signOut.mockImplementation(() => new Promise(() => {}));
    render(<SignOutButton />);

    // Click target uses the IDLE label: the button still reads "Sign out" at
    // click time and only becomes "Signing out…" afterwards.
    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    expect(push).not.toHaveBeenCalled();
  });

  it("disables itself while signing out", async () => {
    const user = userEvent.setup();
    signOut.mockImplementation(() => new Promise(() => {}));
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    expect(await screen.findByRole("button", { name: /signing out/i })).toBeDisabled();
  });

  it("stays put and re-enables when sign-out throws", async () => {
    const user = userEvent.setup();
    signOut.mockRejectedValue(new Error("network down"));
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    // The session may still be live, so redirecting would falsely imply
    // the user is signed out.
    expect(await screen.findByRole("button", { name: /^sign out$/i })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing proxy spec**

Create `src/proxy.spec.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionCookie } = vi.hoisted(() => ({ getSessionCookie: vi.fn() }));

vi.mock("better-auth/cookies", () => ({ getSessionCookie }));

import { config, proxy } from "@/proxy";

describe("proxy", () => {
  beforeEach(() => {
    getSessionCookie.mockReset();
  });

  it("redirects to login when no session cookie is present", () => {
    getSessionCookie.mockReturnValue(null);

    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets the request through when a cookie is present", () => {
    getSessionCookie.mockReturnValue("some-token");

    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("only guards the dashboard", () => {
    expect(config.matcher).toEqual(["/dashboard"]);
  });

  it("is optimistic — it accepts any cookie value without validating it", () => {
    // Documents the security boundary: this check is bypassable by design,
    // which is why app/dashboard/page.tsx re-checks against the database.
    getSessionCookie.mockReturnValue("obviously-forged");

    const response = proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.headers.get("location")).toBeNull();
  });
});
```

- [ ] **Step 3: Run both and verify they fail**

```bash
npm test -- src/components/auth/sign-out-button.spec.tsx src/proxy.spec.ts
```

Expected: FAIL — neither module resolves.

- [ ] **Step 4: Write the sign-out button**

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
    try {
      await authClient.signOut();
    } catch {
      // Sign-out failed, so the session may still be live. Re-enable the
      // button and stay put rather than redirecting to /login and implying
      // the user is signed out when they might not be.
      setPending(false);
      return;
    }
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

- [ ] **Step 5: Write the proxy**

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

- [ ] **Step 6: Run and verify they pass**

```bash
npm test
```

Expected: PASS, 55 tests across 7 files.

- [ ] **Step 7: Create the protected page**

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
        <h1 className="text-2xl font-semibold tracking-tight">
          Signed in ({displayName})
        </h1>
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

- [ ] **Step 8: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean. The build output should list `/dashboard`, `/login`, `/register`, and `/api/auth/[...all]`, and report Proxy as active.

- [ ] **Step 9: Register the Google redirect URI**

Done in a browser, by a human — it cannot be automated:

In Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client whose ID is in `GOOGLE_OAUTH_CLIENT_ID`, add to **Authorized redirect URIs**:

```
http://localhost:3000/api/auth/callback/google
```

Save and allow a minute to propagate. Until then, Google sign-in fails with `redirect_uri_mismatch`.

- [ ] **Step 10: Commit**

```bash
git add src/app/dashboard src/components/auth/sign-out-button.tsx src/components/auth/sign-out-button.spec.tsx src/proxy.ts src/proxy.spec.ts
git commit -m "feat(authentication): add protected dashboard and route guard"
```

---

## Task 10: End-to-end — registration flow

**Files:**
- Create: `e2e/helpers.ts`, `e2e/registration.spec.ts`

**Interfaces:**
- Consumes: the running app, `e2e/global-setup.ts` (Task 2).
- Produces: `uniqueEmail(prefix?: string): string`, `registerUser(page, overrides?): Promise<{ name: string; email: string; password: string }>` — reused by Tasks 11 and 12.

- [ ] **Step 1: Write the shared helpers**

Create `e2e/helpers.ts`:

```ts
import type { Page } from "@playwright/test";

export const TEST_PASSWORD = "hunter2hunter2";

let counter = 0;

/**
 * Unique per call, so repeated runs never collide. The counter is
 * process-local; the suite runs single-worker (`workers: 1`), so that is
 * sufficient today. Add `process.pid` before enabling parallel workers.
 */
export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@moneytrack.test`;
}

export async function registerUser(
  page: Page,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  const user = {
    name: overrides.name ?? "Ana Bubniak",
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? TEST_PASSWORD,
  };

  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();

  return user;
}
```

> **Amended 2026-08-08 during execution.** Every alert assertion is scoped
> with `page.locator("form")`. Next.js renders its own route announcer —
> `<p role="alert" id="__next-route-announcer__">` (see
> `node_modules/next/dist/client/route-announcer.js`) — on *every* page, so a
> bare `page.getByRole("alert")` matches two elements and trips Playwright's
> strict mode. Scoping to the form keeps the role assertion meaningful (both
> auth alerts render inside their `<form>`) while disambiguating. Do not
> "simplify" it back, and do not swap it for `getByText`, which would stop
> asserting the accessible role.

`getByLabel("Password", { exact: true })` is required — without it the locator matches both "Password" and "Confirm password" and Playwright throws a strict-mode violation.

- [ ] **Step 2: Write the registration spec**

Create `e2e/registration.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { registerUser, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("registration", () => {
  test("creates an account and lands on the dashboard", async ({ page }) => {
    const user = await registerUser(page);

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText(`Signed in (${user.name})`)).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("rejects an email that is already registered", async ({ page }) => {
    const email = uniqueEmail("duplicate");
    await registerUser(page, { email });
    await expect(page).toHaveURL("/dashboard");

    // Sign out so the register page is reachable again.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    await registerUser(page, { email });

    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "An account with this email already exists.",
    );
    await expect(page).toHaveURL("/register");
  });

  // Named for what it actually checks. Proving no network request was sent
  // belongs at the unit level, where register-form.spec.tsx already asserts
  // signUpEmail was not called.
  test("shows field errors and stays put when empty", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
    await expect(page.getByText("Email is required.")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    await expect(page.getByText("Please confirm your password.")).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("rejects mismatched password confirmation", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Ana Bubniak");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel("Confirm password").fill("something-else");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Passwords don't match.")).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("stores the email lowercased", async ({ page }) => {
    const email = uniqueEmail("MixedCase").toUpperCase();
    await registerUser(page, { email });

    await expect(page).toHaveURL("/dashboard");
    // `exact: true` is load-bearing. Playwright's getByText defaults to
    // case-INSENSITIVE substring matching, which would match the uppercase
    // email too — making this assertion pass whether or not normalisation
    // happens, i.e. testing nothing.
    await expect(
      page.getByText(email.toLowerCase(), { exact: true }),
    ).toBeVisible();
  });
});
```

- [ ] **Step 3: Run and watch it work end to end**

```bash
npm run test:e2e -- registration.spec.ts
```

Expected: 5 passed. Playwright starts its own dev server against `DATABASE_URL_TEST`, applies migrations, and truncates first.

If global setup fails on `TRUNCATE`, the test database has no tables — confirm `DATABASE_URL_TEST` points at a database that exists and that Task 3's migration is committed.

- [ ] **Step 4: Confirm the dev database was untouched**

```bash
npx prisma studio
```

Expected: no `@moneytrack.test` users in the **development** database. If there are, `playwright.config.ts` is not overriding `DATABASE_URL` — fix that before continuing, because every later e2e task would pollute real data.

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers.ts e2e/registration.spec.ts
git commit -m "test(authentication): add registration end-to-end tests"
```

---

## Task 11: End-to-end — login and logout flows

**Files:**
- Create: `e2e/login.spec.ts`, `e2e/logout.spec.ts`

**Interfaces:**
- Consumes: `registerUser`, `uniqueEmail`, `TEST_PASSWORD` from `e2e/helpers.ts` (Task 10).
- Produces: nothing consumed later.

- [ ] **Step 1: Write the login spec**

Create `e2e/login.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { registerUser, TEST_PASSWORD, uniqueEmail } from "./helpers";

test.describe("login", () => {
  test("signs in an existing account", async ({ page }) => {
    const user = await registerUser(page);
    await expect(page).toHaveURL("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText(`Signed in (${user.name})`)).toBeVisible();
  });

  test("rejects a wrong password", async ({ page }) => {
    const user = await registerUser(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL("/login");
  });

  test("gives an unknown email the identical message", async ({ page }) => {
    // The two failures must be indistinguishable, or the form becomes an
    // oracle for which addresses have accounts.
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail("never-registered"));
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
  });

  test("validates the email format before submitting", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  });

  test("accepts the email in a different case", async ({ page }) => {
    const user = await registerUser(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.getByLabel("Email").fill(user.email.toUpperCase());
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/dashboard");
  });
});
```

- [ ] **Step 2: Write the logout spec**

Create `e2e/logout.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("logout", () => {
  test("signs out and returns to login", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL("/dashboard");

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("invalidates the session so the dashboard is no longer reachable", async ({ page }) => {
    await registerUser(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    await page.goto("/dashboard");

    await expect(page).toHaveURL("/login");
  });

  test("clears the session cookie", async ({ page, context }) => {
    await registerUser(page);
    await expect(page).toHaveURL("/dashboard");

    const before = await context.cookies();
    expect(before.some((cookie) => cookie.name.includes("session_token"))).toBe(true);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    const after = await context.cookies();
    const sessionCookie = after.find((cookie) => cookie.name.includes("session_token"));
    expect(sessionCookie?.value ?? "").toBe("");
  });
});
```

- [ ] **Step 3: Run them**

```bash
npm run test:e2e -- login.spec.ts logout.spec.ts
```

Expected: 8 passed.

If "clears the session cookie" fails because the cookie is removed rather than blanked, assert `expect(sessionCookie).toBeUndefined()` instead — both are correct sign-out behaviour, and which one better-auth does is an implementation detail. Adjust the assertion to match observed behaviour and note it in the commit.

- [ ] **Step 4: Commit**

```bash
git add e2e/login.spec.ts e2e/logout.spec.ts
git commit -m "test(authentication): add login and logout end-to-end tests"
```

---

## Task 12: End-to-end — route protection and Google redirect

**Files:**
- Create: `e2e/route-protection.spec.ts`, `e2e/google-sign-in.spec.ts`

**Interfaces:**
- Consumes: `registerUser` from `e2e/helpers.ts`.
- Produces: nothing consumed later.

- [ ] **Step 1: Write the route protection spec**

Create `e2e/route-protection.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("route protection", () => {
  test("redirects a signed-out visitor away from the dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL("/login");
  });

  test("redirects a signed-in user away from login", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/login");

    await expect(page).toHaveURL("/dashboard");
  });

  test("redirects a signed-in user away from register", async ({ page }) => {
    await registerUser(page);
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/register");

    await expect(page).toHaveURL("/dashboard");
  });

  test("a forged session cookie does not grant access", async ({ page, context }) => {
    // The proxy is optimistic and will let this through. The page's own
    // database check is what must reject it.
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "forged-value-that-was-never-issued",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/dashboard");

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: /Signed in/ })).toHaveCount(0);
  });

  test("keeps the dashboard reachable while the session is valid", async ({ page }) => {
    await registerUser(page);
    // Synchronisation point, not decoration. registerUser returns once the
    // submit click is dispatched — it deliberately does NOT await navigation,
    // because callers testing a rejected signup never navigate at all. Without
    // this wait, the goto below races the session cookie and can land on /login.
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Signed in/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: /Signed in/ })).toBeVisible();
  });
});
```

> **Amended 2026-08-08 during execution.** These assertions target the
> dashboard heading by ROLE, not by text. The dashboard's `<h1>` reads
> "Signed in (name)", and Next's app-router announcer mirrors the page's
> `<h1>` text into its own `role="alert"` node when `document.title` is
> empty — so `getByText(/Signed in/)` matches two elements and trips
> strict mode. Scoping by heading role is a real disambiguation: the
> announcer is always `role="alert"`, never a heading.

The forged-cookie test is the single most important one in the suite: it proves the optimistic proxy is not load-bearing.

- [ ] **Step 2: Write the Google redirect spec**

Create `e2e/google-sign-in.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

// This suite verifies our half of the OAuth handshake only. It deliberately
// stops at Google's door: Google blocks automated browsers, so completing the
// consent flow here would be flaky rather than informative. The full round
// trip, and the account-linking behaviour that follows it, stay on the manual
// checklist in the spec.
test.describe("google sign-in", () => {
  test("sends the browser to Google with the right parameters", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 });

    const url = new URL(page.url());
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/google",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("email");
  });

  test("offers the same Google entry point on register", async ({ page }) => {
    await page.goto("/register");

    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 });

    expect(new URL(page.url()).hostname).toBe("accounts.google.com");
  });
});
```

- [ ] **Step 3: Run them**

```bash
npm run test:e2e -- route-protection.spec.ts google-sign-in.spec.ts
```

Expected: 7 passed.

These two Google tests need outbound internet. If the environment is offline, they will fail on `waitForURL` — that is an environment limitation, not a code defect. Report it as skipped rather than marking it passed.

If "a forged session cookie does not grant access" **passes the user through to the dashboard**, stop everything: the authoritative check in `app/dashboard/page.tsx` is broken and the app has no real protection.

- [ ] **Step 4: Run the whole e2e suite together**

```bash
npm run test:e2e
```

Expected: 20 passed across 5 files. Running them together also proves global setup's truncation leaves a clean slate for the whole suite rather than for one file at a time.

- [ ] **Step 5: Commit**

```bash
git add e2e/route-protection.spec.ts e2e/google-sign-in.spec.ts
git commit -m "test(authentication): add route protection and google redirect tests"
```

---

## Task 13: Full verification pass

**Files:** none — this task changes no code unless it finds a defect.

- [ ] **Step 1: Clean build and both suites**

```bash
rm -rf .next && npx tsc --noEmit && npm run build && npm test && npm run test:e2e
```

Expected: type-check clean, build clean, 55 unit tests passed, 20 e2e tests passed.

- [ ] **Step 2: Confirm every spec is co-located as required**

```bash
find src -name "*.spec.ts" -o -name "*.spec.tsx" | sort
```

Expected exactly:

```
src/components/auth/google-button.spec.tsx
src/components/auth/login-form.spec.tsx
src/components/auth/register-form.spec.tsx
src/components/auth/sign-out-button.spec.tsx
src/lib/auth-errors.spec.ts
src/lib/validations/auth.spec.ts
src/proxy.spec.ts
```

No `__tests__` directories, and every spec sits beside its source.

- [ ] **Step 3: Walk the manual checklist**

The two things automation cannot cover. `npm run dev`, then:

1. **Google round trip.** Click "Continue with Google", complete the real consent screen → lands on `/dashboard` showing the Google profile name.
2. **Account linking.** Sign out. Register a password account using the same address as that Google account. Sign out, then sign in with Google again. In `npx prisma studio` against the **development** database: exactly **one** `users` row for that address, and **two** `accounts` rows — `provider_id` of `credential` and `google` — sharing one `user_id`.
3. **Dark mode.** Set `class="dark"` on `<html>` in devtools and confirm both auth screens and the dashboard render correctly.

- [ ] **Step 4: Confirm no secrets are tracked**

```bash
git status --short; git ls-files | grep -E "^\.env$" && echo "LEAK" || echo "clean"
```

Expected: `clean`, and no stray untracked files beyond ones you intend.

- [ ] **Step 5: Report results**

State plainly: unit test count passed, e2e count passed, and the outcome of each manual item. If the Google round trip could not be tested because the redirect URI was not registered or the environment is offline, say so explicitly rather than reporting it as passing.

---

## Self-Review

**Spec coverage.** Architecture → Task 5. Database schema → Task 3. Route structure → Tasks 6–9. Two-layer protection → Task 9, proven in Task 12's forged-cookie test. Components → Tasks 6–9. Validation → Task 4. Error handling → Task 4, exercised in 7–8. Visual design → Tasks 7–8 against the prototype. Dependencies and environment → Task 1. Unit testing → Tasks 4, 6, 7, 8, 9. End-to-end → Tasks 10–12. Manual checklist → Task 13. Account linking → Task 5 config, manual item 2 in Task 13 (deliberately not automated; see Task 12's note).

**Test count arithmetic.** 13 (schemas) + 9 (error mapping) + 6 (google button) + 10 (login form) + 8 (register form) + 5 (sign-out) + 4 (proxy) = 55 unit. 5 (registration) + 5 (login) + 3 (logout) + 5 (route protection) + 2 (google) = 20 e2e. These are the numbers each task's run step expects; if your count differs, something did not run.

**Type consistency.** `authErrorMessage(code?: string | null)` defined Task 4, called with `error.code` in Tasks 7 and 8. `LoginValues`/`RegisterValues` produced Task 4, used as `useForm` generics in 7/8. `<GoogleButton />` defined Task 6, imported unchanged in 7 and 8. `registerUser`/`uniqueEmail`/`TEST_PASSWORD` defined Task 10, imported in 11 and 12. `prismaAdapter` imported from `better-auth/adapters/prisma` in Task 5, the exact path probed in Task 1 Step 4. `proxy` and `config` exported from `src/proxy.ts` in Task 9 and imported by its spec in the same task.

**Known uncertainties, each with a stated fallback.** `CardDescription` may not exist in the generated `card.tsx` (Task 6 Step 2 checks up front; Tasks 7–8 carry the fallback). zod may short-circuit `.refine()` when the object shape already failed (Task 4 Step 4). better-auth may delete rather than blank the session cookie on sign-out (Task 11 Step 3). The Google redirect tests need outbound internet (Task 12 Step 3). None of these are placeholders — each names the alternative to apply and how to tell which case you are in.
