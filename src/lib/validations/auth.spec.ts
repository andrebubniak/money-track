import { describe, expect, it } from "vitest";

import {
  createLoginSchema,
  createRegisterSchema,
  createSignUpPayloadSchema,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  type AuthValidationTranslator,
} from "@/lib/validations/auth";

/**
 * Echoes the key back, with any interpolated values appended, so a test can
 * assert both which message fired and what was substituted into it — without
 * depending on a single word of user-facing copy.
 */
const t: AuthValidationTranslator = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const loginSchema = createLoginSchema(t);
const registerSchema = createRegisterSchema(t);
const signUpPayloadSchema = createSignUpPayloadSchema(t);

function errorsFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  if (result.success || !result.error) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe("createLoginSchema", () => {
  it("accepts a valid email and any non-empty password", () => {
    expect(loginSchema.safeParse({ email: "ana@example.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty email with a required message", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret123" });
    expect(errorsFor(result).email).toBe("email.required");
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "secret123" });
    expect(errorsFor(result).email).toBe("email.invalid");
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "ana@example.com", password: "" });
    expect(errorsFor(result).password).toBe("password.required");
  });

  it("does not impose a minimum length on the password", () => {
    // An existing account's password predates any rule we add later, so the
    // login form must never reject it client-side.
    expect(loginSchema.safeParse({ email: "ana@example.com", password: "abc" }).success).toBe(true);
  });

  it("trims and lowercases the email", () => {
    const result = loginSchema.safeParse({ email: "  ANA@Example.COM  ", password: "secret123" });
    expect(result.success && result.data.email).toBe("ana@example.com");
  });
});

describe("createRegisterSchema", () => {
  const valid = {
    name: "Ana Bubniak",
    email: "ana@example.com",
    password: "Hunter2hunter2",
    confirmPassword: "Hunter2hunter2",
  };

  it("accepts a complete valid payload", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name of at least the minimum length", () => {
    const result = registerSchema.safeParse({ ...valid, name: "A" });
    expect(errorsFor(result).name).toBe(`name.tooShort:{"min":${MIN_NAME_LENGTH}}`);
  });

  it("accepts a name exactly at the minimum length", () => {
    expect(registerSchema.safeParse({ ...valid, name: "Al" }).success).toBe(true);
  });

  it("accepts a name exactly at the maximum length", () => {
    const name = "a".repeat(MAX_NAME_LENGTH);
    expect(registerSchema.safeParse({ ...valid, name }).success).toBe(true);
  });

  it("rejects a name one character over the maximum, interpolating the bound", () => {
    const result = registerSchema.safeParse({ ...valid, name: "a".repeat(MAX_NAME_LENGTH + 1) });
    expect(errorsFor(result).name).toBe(`name.tooLong:{"max":${MAX_NAME_LENGTH}}`);
  });

  it("trims the name before measuring it", () => {
    const result = registerSchema.safeParse({ ...valid, name: "  A  " });
    expect(errorsFor(result).name).toBe(`name.tooShort:{"min":${MIN_NAME_LENGTH}}`);
  });

  it("rejects a password below the minimum length", () => {
    const short = "Ab1" + "c".repeat(MIN_PASSWORD_LENGTH - 4);
    const result = registerSchema.safeParse({ ...valid, password: short, confirmPassword: short });
    expect(errorsFor(result).password).toBe(`password.tooShort:{"min":${MIN_PASSWORD_LENGTH}}`);
  });

  it("accepts a password exactly at the maximum length", () => {
    const password = "Aa1" + "b".repeat(MAX_PASSWORD_LENGTH - 3);
    expect(registerSchema.safeParse({ ...valid, password, confirmPassword: password }).success).toBe(true);
  });

  it("rejects a password one character over the maximum", () => {
    const password = "Aa1" + "b".repeat(MAX_PASSWORD_LENGTH - 2);
    const result = registerSchema.safeParse({ ...valid, password, confirmPassword: password });
    expect(errorsFor(result).password).toBe(`password.tooLong:{"max":${MAX_PASSWORD_LENGTH}}`);
  });

  // One case per composition clause. A single fixture violating two clauses at
  // once would let any one of them be deleted with the suite still green —
  // including the digit requirement, which weakens every password in the
  // product. Each fixture below satisfies the other two clauses exactly.
  it.each([
    ["no lowercase letter", "PASSWORD1"],
    ["no uppercase letter", "password1"],
    ["no number", "PasswordOnly"],
  ])("rejects a password with %s", (_label, password) => {
    const result = registerSchema.safeParse({ ...valid, password, confirmPassword: password });
    expect(errorsFor(result).password).toBe("password.composition");
  });

  it("reports one issue for the password, not one per broken rule", () => {
    // `.claude/rules/validation.md`: one message per field. `errorsFor`
    // collapses same-path issues, so this has to count them directly —
    // splitting the single .refine() into three would otherwise pass.
    //
    // Long enough to clear `.min()`, so composition is the only rule it
    // breaks. A short password would fail two rules and prove nothing here.
    const password = "PasswordOnly";
    const result = registerSchema.safeParse({ ...valid, password, confirmPassword: password });
    const issues = result.success
      ? []
      : result.error.issues.filter((i) => i.path[0] === "password");
    expect(issues).toHaveLength(1);
  });

  it("requires a confirmation", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "" });
    expect(errorsFor(result).confirmPassword).toBe("confirmPassword.required");
  });

  it("reports a mismatch on the confirmation field", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "Different1" });
    expect(errorsFor(result).confirmPassword).toBe("confirmPassword.mismatch");
  });

  it("does not stack two issues on an empty confirmation", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "" });
    const issues = result.success ? [] : result.error.issues.filter((i) => i.path[0] === "confirmPassword");
    expect(issues).toHaveLength(1);
  });
});

describe("createSignUpPayloadSchema", () => {
  it("accepts the three fields the server stores", () => {
    const result = signUpPayloadSchema.safeParse({
      name: "Ana Bubniak",
      email: "ana@example.com",
      password: "Hunter2hunter2",
    });
    expect(result.success).toBe(true);
  });

  it("applies the same name bound as the register schema", () => {
    const result = signUpPayloadSchema.safeParse({
      name: "a".repeat(MAX_NAME_LENGTH + 1),
      email: "ana@example.com",
      password: "Hunter2hunter2",
    });
    expect(errorsFor(result).name).toBe(`name.tooLong:{"max":${MAX_NAME_LENGTH}}`);
  });

  it("applies the same composition rule as the register schema", () => {
    const result = signUpPayloadSchema.safeParse({
      name: "Ana Bubniak",
      email: "ana@example.com",
      password: "alllowercase",
    });
    expect(errorsFor(result).password).toBe("password.composition");
  });
});
