import z from "zod";

export const loginValidator = z.object({
  email: z.email("Email is required and must be valid"),
  password: z
    .string("Password is required")
    .trim()
    .min(1, "Password is required")
    .max(100, "Password can be at max 100 characters long"),
});

export type LoginValidatorType = z.infer<typeof loginValidator>;
