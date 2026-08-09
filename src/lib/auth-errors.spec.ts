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

  it("maps the server-side name rejection", () => {
    expect(authErrorMessage("INVALID_NAME")).toBe(
      "Name must be between 2 and 60 characters.",
    );
  });

  it("maps the server-side password rejection", () => {
    expect(authErrorMessage("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")).toBe(
      "Password must be 8-60 characters and include a lowercase letter, an uppercase letter, and a number.",
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
