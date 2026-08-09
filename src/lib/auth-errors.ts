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
  // Object.hasOwn, not `in` — `in` would match inherited keys like "toString".
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code)
    ? AUTH_ERROR_MESSAGES[code]
    : FALLBACK_MESSAGE;
}
