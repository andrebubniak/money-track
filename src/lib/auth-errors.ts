import {
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/validations/auth";

/**
 * Every key under the `errors.auth` namespace.
 *
 * Declaring the union explicitly is what ties this file to the catalog: a
 * component passing a real `useTranslations("errors.auth")` in only
 * type-checks while all of these exist.
 */
export type AuthErrorKey =
  // What better-auth's sign-up route actually throws (sign-up.mjs:208).
  // The shorter USER_ALREADY_EXISTS exists only in the admin plugin, which
  // this app does not use — it is mapped too, purely against version drift.
  | "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
  | "USER_ALREADY_EXISTS"
  // Deliberately one key for unknown-email and wrong-password, so the form
  // never confirms which addresses have accounts.
  | "INVALID_EMAIL_OR_PASSWORD"
  | "PASSWORD_TOO_SHORT"
  // Raised by the sign-up `before` hook in src/lib/auth.ts when a payload
  // reaches the server without passing the browser's validation.
  | "INVALID_NAME"
  | "PASSWORD_DOES_NOT_MEET_REQUIREMENTS"
  | "PASSWORD_TOO_LONG"
  | "INVALID_EMAIL"
  | "fallback";

export type AuthErrorTranslator = (
  key: AuthErrorKey,
  values?: Record<string, number>,
) => string;

/**
 * Codes we recognise. The code is the contract — better-auth's English
 * `message` is for logs and API consumers, and the UI never renders it.
 */
const KNOWN_CODES: Record<string, AuthErrorKey> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  INVALID_EMAIL_OR_PASSWORD: "INVALID_EMAIL_OR_PASSWORD",
  PASSWORD_TOO_SHORT: "PASSWORD_TOO_SHORT",
  INVALID_NAME: "INVALID_NAME",
  PASSWORD_DOES_NOT_MEET_REQUIREMENTS: "PASSWORD_DOES_NOT_MEET_REQUIREMENTS",
  PASSWORD_TOO_LONG: "PASSWORD_TOO_LONG",
  INVALID_EMAIL: "INVALID_EMAIL",
};

/**
 * Bounds the three bounded messages interpolate, sourced from the schema
 * constants rather than written into the catalogs. A changed limit updates the
 * copy in all three languages at once, and the parity test guards the
 * placeholders — six numbers spread across three JSON files would not be
 * guarded by anything.
 *
 * Keys absent from this map have no placeholders and are translated with no
 * values at all; passing values to such a message is a next-intl type error.
 */
const MESSAGE_VALUES: Partial<Record<AuthErrorKey, Record<string, number>>> = {
  PASSWORD_TOO_SHORT: { min: MIN_PASSWORD_LENGTH },
  INVALID_NAME: { min: MIN_NAME_LENGTH, max: MAX_NAME_LENGTH },
  PASSWORD_DOES_NOT_MEET_REQUIREMENTS: {
    min: MIN_PASSWORD_LENGTH,
    max: MAX_PASSWORD_LENGTH,
  },
};

export function authErrorMessage(
  t: AuthErrorTranslator,
  code?: string | null,
): string {
  // Object.hasOwn, not `in` — `in` would match inherited keys like "toString"
  // and hand the translator a key the catalog does not have.
  if (!code || !Object.hasOwn(KNOWN_CODES, code)) return t("fallback");

  const key = KNOWN_CODES[code];
  return t(key, MESSAGE_VALUES[key]);
}
