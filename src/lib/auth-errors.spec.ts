import { describe, expect, it } from "vitest";

import { authErrorMessage, type AuthErrorTranslator } from "@/lib/auth-errors";
import {
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/validations/auth";

/** Echoes the key, with any interpolated values appended. */
const t: AuthErrorTranslator = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe("authErrorMessage", () => {
  it("interpolates the schema bounds rather than hardcoding them", () => {
    // The catalogs hold `{min}` / `{max}`; these constants are the only place
    // the numbers are written down.
    expect(authErrorMessage(t, "PASSWORD_TOO_SHORT")).toBe(
      `PASSWORD_TOO_SHORT:{"min":${MIN_PASSWORD_LENGTH}}`,
    );
    expect(authErrorMessage(t, "INVALID_NAME")).toBe(
      `INVALID_NAME:{"min":${MIN_NAME_LENGTH},"max":${MAX_NAME_LENGTH}}`,
    );
    expect(authErrorMessage(t, "PASSWORD_DOES_NOT_MEET_REQUIREMENTS")).toBe(
      `PASSWORD_DOES_NOT_MEET_REQUIREMENTS:{"min":${MIN_PASSWORD_LENGTH},"max":${MAX_PASSWORD_LENGTH}}`,
    );
  });

  it("passes no values to a message that declares no placeholders", () => {
    // next-intl treats values for a placeholder-less message as a type error,
    // so the map is deliberately partial.
    expect(authErrorMessage(t, "PASSWORD_TOO_LONG")).toBe("PASSWORD_TOO_LONG");
  });

  it("maps a known code to its own key", () => {
    expect(authErrorMessage(t, "INVALID_EMAIL_OR_PASSWORD")).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("maps both spellings of the already-exists code to the same key", () => {
    expect(authErrorMessage(t, "USER_ALREADY_EXISTS")).toBe("USER_ALREADY_EXISTS");
    expect(authErrorMessage(t, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toBe(
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    );
  });

  it("falls back for an unknown code", () => {
    expect(authErrorMessage(t, "SOMETHING_NEW_IN_A_LATER_RELEASE")).toBe("fallback");
  });

  it("falls back for a missing code", () => {
    expect(authErrorMessage(t, null)).toBe("fallback");
    expect(authErrorMessage(t)).toBe("fallback");
  });

  it("falls back for an inherited object key", () => {
    // `Object.hasOwn`, not `in` — `in` would match "toString" and hand the
    // translator a key that is not in the catalog.
    expect(authErrorMessage(t, "toString")).toBe("fallback");
    expect(authErrorMessage(t, "constructor")).toBe("fallback");
  });

  it("never distinguishes an unknown email from a wrong password", () => {
    // One message for every credential failure, so the form cannot be used to
    // enumerate which addresses have accounts.
    expect(authErrorMessage(t, "INVALID_EMAIL_OR_PASSWORD")).toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});
