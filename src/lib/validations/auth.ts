import { z } from "zod";

/**
 * Upper bound on free-text fields. Kept generous enough never to reject a real
 * name or passphrase, but bounded so nothing unbounded reaches the database.
 */
export const MAX_NAME_LENGTH = 60;
export const MAX_PASSWORD_LENGTH = 60;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * One message covering all three composition rules, rather than one issue per
 * rule. Revealing the requirements one at a time — "needs an uppercase", then
 * "needs a number" — makes the user fix the same field repeatedly.
 */
const PASSWORD_COMPOSITION_MESSAGE =
  "Password must include a lowercase letter, an uppercase letter, and a number.";

const hasRequiredComposition = (value: string) =>
  /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .pipe(z.email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

/**
 * Field schemas are defined once and composed into both the browser-facing
 * `registerSchema` and the server-facing `signUpPayloadSchema`, so the two
 * sides cannot drift. See `.claude/rules/validation.md`.
 */
const name = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters.`);

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`)
  .refine(hasRequiredComposition, PASSWORD_COMPOSITION_MESSAGE);

export const loginSchema = z.object({
  email,
  // Non-empty only. No length or composition rules: those have changed before
  // and may change again, and an existing password must stay enterable.
  password: z.string().min(1, "Password is required."),
});

/**
 * What the server accepts at `/sign-up/email`.
 *
 * The browser is not a trust boundary: better-auth's own body schema types
 * `name` as an unbounded `z.string()` and knows nothing about our composition
 * rules, so a direct POST would otherwise bypass both. Enforced by the
 * `before` hook in `src/lib/auth.ts`.
 *
 * No `confirmPassword` — that is a UI concern and never reaches the server.
 */
export const signUpPayloadSchema = z.object({ name, email, password });

export const registerSchema = z
  .object({
    name,
    email,
    password,
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
