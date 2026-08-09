import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema, signUpPayloadSchema } from "@/lib/validations/auth";

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
    password: "Hunter2hunter2",
    confirmPassword: "Hunter2hunter2",
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
    const result = registerSchema.safeParse({ ...valid, password: "Short1", confirmPassword: "Short1" });
    expect(errorsFor(result).password).toBe("Password must be at least 8 characters.");
  });

  it("rejects a name longer than 60 characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "a".repeat(61) });
    expect(errorsFor(result).name).toBe("Name must be at most 60 characters.");
  });

  it("accepts a name of exactly 60 characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "a".repeat(60) });
    expect(result.success).toBe(true);
  });

  it("rejects a password longer than 60 characters", () => {
    const long = "Aa1" + "b".repeat(58);
    const result = registerSchema.safeParse({ ...valid, password: long, confirmPassword: long });
    expect(errorsFor(result).password).toBe("Password must be at most 60 characters.");
  });

  it("accepts a password of exactly 60 characters", () => {
    const exact = "Aa1" + "b".repeat(57);
    expect(exact).toHaveLength(60);
    const result = registerSchema.safeParse({ ...valid, password: exact, confirmPassword: exact });
    expect(result.success).toBe(true);
  });

  it("rejects a password with no lowercase letter", () => {
    const result = registerSchema.safeParse({ ...valid, password: "PASSWORD1", confirmPassword: "PASSWORD1" });
    expect(errorsFor(result).password).toBe(
      "Password must include a lowercase letter, an uppercase letter, and a number.",
    );
  });

  it("rejects a password with no uppercase letter", () => {
    const result = registerSchema.safeParse({ ...valid, password: "password1", confirmPassword: "password1" });
    expect(errorsFor(result).password).toBe(
      "Password must include a lowercase letter, an uppercase letter, and a number.",
    );
  });

  it("rejects a password with no number", () => {
    const result = registerSchema.safeParse({ ...valid, password: "PasswordOnly", confirmPassword: "PasswordOnly" });
    expect(errorsFor(result).password).toBe(
      "Password must include a lowercase letter, an uppercase letter, and a number.",
    );
  });

  it("reports one combined message rather than one issue per missing rule", () => {
    // "aaaaaaaa" is missing both an uppercase letter and a number. The user
    // should be told everything at once, not made to fix the field twice.
    const result = registerSchema.safeParse({ ...valid, password: "aaaaaaaa", confirmPassword: "aaaaaaaa" });
    const passwordIssues = result.success
      ? []
      : result.error.issues.filter((issue) => issue.path[0] === "password");
    expect(passwordIssues).toHaveLength(1);
  });

  it("does not impose composition rules on the login schema", () => {
    // An account created under older rules must still be able to sign in.
    expect(loginSchema.safeParse({ email: "ana@example.com", password: "old" }).success).toBe(true);
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

describe("signUpPayloadSchema", () => {
  const valid = { name: "Ana Bubniak", email: "ana@example.com", password: "Hunter2hunter2" };

  it("accepts what the register form sends", () => {
    expect(signUpPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it("enforces the same name bounds as the form", () => {
    expect(signUpPayloadSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(signUpPayloadSchema.safeParse({ ...valid, name: "a".repeat(61) }).success).toBe(false);
  });

  it("enforces the same password rules as the form", () => {
    expect(signUpPayloadSchema.safeParse({ ...valid, password: "short1A" }).success).toBe(false);
    expect(signUpPayloadSchema.safeParse({ ...valid, password: "nouppercase1" }).success).toBe(false);
    expect(signUpPayloadSchema.safeParse({ ...valid, password: "NoDigitsHere" }).success).toBe(false);
  });

  it("ignores confirmPassword, which never reaches the server", () => {
    const result = signUpPayloadSchema.safeParse({ ...valid, confirmPassword: "anything" });
    expect(result.success).toBe(true);
    expect(result.success && "confirmPassword" in result.data).toBe(false);
  });
});
