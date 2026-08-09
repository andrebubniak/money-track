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
  // Raised by the sign-up `before` hook in src/lib/auth.ts when a payload
  // reaches the server without passing the browser's validation.
  INVALID_NAME: "Name must be between 2 and 60 characters.",
  PASSWORD_DOES_NOT_MEET_REQUIREMENTS:
    "Password must be 8-60 characters and include a lowercase letter, an uppercase letter, and a number.",
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
