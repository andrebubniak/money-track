import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/validations/auth";

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
    password: "hunter2hunter2",
    confirmPassword: "hunter2hunter2",
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
    const result = registerSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" });
    expect(errorsFor(result).password).toBe("Password must be at least 8 characters.");
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
