import { z } from "zod";

/**
 * Bounds on free-text fields. Kept generous enough never to reject a real
 * name or passphrase, but bounded so nothing unbounded reaches the database.
 *
 * These are interpolated into messages as `{min}` / `{max}` rather than
 * written into the copy, so the number lives in exactly one place across all
 * three catalogs.
 */
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 60;

/**
 * Every message key these schemas can emit, relative to the `validation.auth`
 * namespace.
 *
 * Declaring the union explicitly is what makes the catalog and the schemas
 * check each other: passing a real `useTranslations("validation.auth")` into a
 * factory only type-checks while every key here exists in the catalog.
 */
export type AuthValidationKey =
  | "email.required"
  | "email.invalid"
  | "name.tooShort"
  | "name.tooLong"
  | "password.required"
  | "password.tooShort"
  | "password.tooLong"
  | "password.composition"
  | "confirmPassword.required"
  | "confirmPassword.mismatch";

export type AuthValidationTranslator = (
  key: AuthValidationKey,
  values?: Record<string, string | number>,
) => string;

const hasRequiredComposition = (value: string) =>
  /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);

/**
 * Field schemas are built once per translator and composed into the
 * browser-facing and server-facing object schemas, so the two sides cannot
 * drift. See `.claude/rules/validation.md`.
 */
function fields(t: AuthValidationTranslator) {
  const email = z
    .string()
    .trim()
    .min(1, t("email.required"))
    .pipe(z.email(t("email.invalid")))
    .transform((value) => value.toLowerCase());

  const name = z
    .string()
    .trim()
    .min(MIN_NAME_LENGTH, t("name.tooShort", { min: MIN_NAME_LENGTH }))
    .max(MAX_NAME_LENGTH, t("name.tooLong", { max: MAX_NAME_LENGTH }));

  const password = z
    .string()
    .min(MIN_PASSWORD_LENGTH, t("password.tooShort", { min: MIN_PASSWORD_LENGTH }))
    .max(MAX_PASSWORD_LENGTH, t("password.tooLong", { max: MAX_PASSWORD_LENGTH }))
    .refine(hasRequiredComposition, t("password.composition"));

  return { email, name, password };
}

export function createLoginSchema(t: AuthValidationTranslator) {
  const { email } = fields(t);

  return z.object({
    email,
    // Non-empty only. No length or composition rules: those have changed
    // before and may change again, and an existing password must stay
    // enterable.
    password: z.string().min(1, t("password.required")),
  });
}

/**
 * What the server accepts at `/sign-up/email`.
 *
 * The browser is not a trust boundary: better-auth's own body schema types
 * `name` as an unbounded `z.string()` and knows nothing about our composition
 * rules, so a direct POST would otherwise bypass both. Enforced by the
 * `before` hook in `src/lib/auth.ts`, which builds this with the English
 * catalog — see `auth.server.ts`.
 *
 * No `confirmPassword` — that is a UI concern and never reaches the server.
 */
export function createSignUpPayloadSchema(t: AuthValidationTranslator) {
  const { name, email, password } = fields(t);
  return z.object({ name, email, password });
}

export function createRegisterSchema(t: AuthValidationTranslator) {
  const { name, email, password } = fields(t);

  return z
    .object({
      name,
      email,
      password,
      confirmPassword: z.string().min(1, t("confirmPassword.required")),
    })
    .superRefine((values, ctx) => {
      // Guard on a non-empty confirmPassword so this never collides with the
      // shape-level "required" issue on the same path — in zod 4.4.3,
      // .refine() runs even when the object shape already failed, and both
      // issues would otherwise land on confirmPassword.
      if (values.confirmPassword && values.password !== values.confirmPassword) {
        ctx.addIssue({
          code: "custom",
          message: t("confirmPassword.mismatch"),
          path: ["confirmPassword"],
        });
      }
    });
}

export type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>;
export type RegisterValues = z.infer<ReturnType<typeof createRegisterSchema>>;
