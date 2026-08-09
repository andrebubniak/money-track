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

- Define the schema once, in `src/lib/validations/<subject>.ts`.
- Import that same schema in the client component and on the server.
- Export the inferred type (`export type XValues = z.infer<typeof xSchema>`) and
  use it rather than redeclaring the shape.

A rule enforced only in the browser is not enforced. A rule enforced only on the
server produces a round trip to tell the user something the page already knew.

Where a library owns the server-side check — better-auth's `minPasswordLength`,
for example — the zod schema and the library configuration must be kept in
sync, with a comment on each pointing at the other.

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

Put shared bounds in exported constants (`MAX_NAME_LENGTH`) and interpolate them
into the message, so the number and the copy cannot drift apart.

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
