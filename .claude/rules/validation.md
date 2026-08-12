# Validation Guideline

How input is validated across MoneyTrack. Applies to every form, Server Action,
Route Handler, and any function that accepts data originating outside the app.

## Zod is the only validation tool

Use [zod](https://zod.dev) for all input validation. Do not hand-roll checks,
do not use a second validation library, and do not rely on HTML attributes
(`required`, `maxlength`, `type="email"`) as the validation — they are a
convenience for the browser, trivially bypassed, and invisible to the server.

The installed version is **zod 4**. Note the API differs from zod 3: `z.email()`
is a top-level function, not `z.string().email()`.

## Validate on both sides, from the same schema

Client-side validation exists for fast feedback. Server-side validation exists
for correctness. **Neither replaces the other**, and they must never disagree.

- Define the schema factory once, in `src/lib/validations/<subject>.ts`. It
  takes a translator and returns the schema, so messages are localized
  without the client and the server ever holding different rules.
- Import that same factory in the client component and on the server.
- Export the inferred type (`export type XValues = z.infer<typeof xSchema>`) and
  use it rather than redeclaring the shape.

A rule enforced only in the browser is not enforced. A rule enforced only on the
server produces a round trip to tell the user something the page already knew.

### When a library owns the endpoint

Our auth forms call `authClient` directly, so there is no Server Action or
Route Handler of ours in between where a schema could run. That does **not**
excuse the server side — it just moves where the check lives.

Use a better-auth **`before` hook** (`src/lib/auth.ts`), which runs on the real
endpoint before its handler:

```ts
hooks: {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-up/email") return;
    const result = signUpPayloadSchema.safeParse(ctx.body);
    if (result.success) return;
    const issue = result.error.issues[0];
    throw new APIError("BAD_REQUEST", { message: issue.message, code: "…" });
  }),
}
```

The hook runs at `/api/auth/[...all]`, outside the `[locale]` segment, so no
locale is resolved there. Build its schema with `createTranslator` and the
English catalog — see `src/lib/validations/auth.server.ts`. The error
**code** is the contract; the client translates it. Never render
`error.message`.

Two things to know:

- **better-auth does not derive an error code from the message.** Pass `code`
  explicitly, and map it in `src/lib/auth-errors.ts`, or the client falls back
  to the generic message.
- **Do not assume the library's own bounds are adequate.** better-auth types
  `name` as an unbounded `z.string()`. Read the endpoint's body schema in
  `node_modules/better-auth/dist/api/routes/` before deciding a field is
  already covered.

Where the library *does* own a check — `minPasswordLength` — keep it in sync
with the zod schema, with a comment on each pointing at the other.

**Test the bypass, not just the form.** A server-side rule that only the form
exercises is untested. Post directly to the endpoint from an e2e test with a
payload the browser would have rejected, and assert both the status and the
error code — see `e2e/registration.spec.ts`.

## Always bound strings at both ends

**Every** string field gets an explicit `.min()` and `.max()`. No exceptions,
including fields that feel obviously short.

```ts
name: z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(60, "Name must be at most 60 characters."),
```

An unbounded string is an unbounded database write, an unbounded render, and an
unbounded log line. `.max()` is the cheap defence.

Put shared bounds in exported constants (`MAX_NAME_LENGTH`) and interpolate
them into the message as `{max}` rather than writing the number in — see
`.claude/rules/i18n.md` — so the number and the copy cannot drift apart.

## Normalise inside the schema, not in the component

`.trim()`, `.toLowerCase()`, and other normalisation belong in the schema, so
every caller gets the same treatment. A component that lowercases an email
before calling the schema is a component that will eventually forget to.

Order matters: `.trim()` before `.min()`, or `"  "` passes a `min(2)` check.

## One message per field, not one per rule

When several rules govern one field, prefer a single message stating all of
them over one issue per rule. Revealing requirements one at a time — "needs an
uppercase letter", then "needs a number" — makes the user fix the same field
repeatedly.

```ts
.refine(
  (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
  "Password must include a lowercase letter, an uppercase letter, and a number.",
)
```

## Cross-field rules use a guarded `superRefine`

A plain `.refine()` on the object still runs when the shape has already failed,
so an empty confirmation field can produce two issues on the same path — and
whichever the form renders last wins. Guard the comparison:

```ts
.superRefine((values, ctx) => {
  if (values.confirmPassword && values.password !== values.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      message: "Passwords don't match.",
      path: ["confirmPassword"],
    });
  }
})
```

## Messages are user-facing copy

Write them for the person reading them: sentence case, ending in a period,
saying what to do rather than what failed. They are asserted verbatim by unit
and end-to-end tests, so changing one is a deliberate act — update the tests in
the same commit.

**Never let a message reveal whether an account exists.** Authentication
failures use one message for every cause.

## Test the schema directly

Schemas are pure functions and belong under test in their own right, not only
through the components that use them. Cover each rule, the boundary values on
both sides of every `.min()`/`.max()`, the normalisation, and the cross-field
rules. See `src/lib/validations/auth.spec.ts`.
