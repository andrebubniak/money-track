import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .pipe(z.email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email,
  // Non-empty only. No length rule: the minimum has changed before and may
  // change again, and an existing password must stay enterable.
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email,
    password: z.string().min(8, "Password must be at least 8 characters."),
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
