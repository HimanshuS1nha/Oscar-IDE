import z from "zod";

export const registerValidator = z.object({
  name: z
    .string("Name is required")
    .trim()
    .min(1, "Name is required")
    .max(255, "Name can be at max 255 characters long"),
  email: z.email("Email is required and must be valid"),
  password: z
    .string("Password is required")
    .trim()
    .min(8, "Password must be at least 8 characters long")
    .max(100, "Password can be at max 100 characters long"),
});

export type RegisterValidatorType = z.infer<typeof registerValidator>;
