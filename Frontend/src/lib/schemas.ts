import { z } from "zod";

export const contactSchema = z.object({
  full_name: z.string().max(255).optional().or(z.literal("")).or(z.null()),
  email: z
    .string()
    .max(255)
    .email("Enter a valid email address")
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  company: z.string().max(255).optional().or(z.literal("")).or(z.null()),
  job_title: z.string().max(150).optional().or(z.literal("")).or(z.null()),
  address: z.string().max(255).optional().or(z.literal("")).or(z.null()),
  city: z.string().max(100).optional().or(z.literal("")).or(z.null()),
  country: z.string().max(100).optional().or(z.literal("")).or(z.null()),
  timezone: z.string().max(64).optional().or(z.literal("")).or(z.null()),
  phone_number: z.string().max(32).optional().or(z.literal("")).or(z.null()),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export type ContactSchemaValues = z.infer<typeof contactSchema>;

export const leadSchema = z.object({
  contact_id: z.number({ message: "Select a contact" }).int().positive("Select a contact"),
  source: z.enum(["whatsapp", "manual", "import", "other"]),
  status: z.enum(["new", "contacted", "qualified", "disqualified", "converted"]),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type LeadSchemaValues = z.infer<typeof leadSchema>;

export const dealSchema = z.object({
  contact_id: z.number({ message: "Select a contact" }).int().positive("Select a contact"),
  title: z.string().min(1, "Title is required").max(255),
  value_amount: z
    .string()
    .optional()
    .refine((v) => !v || Number(v) >= 0, "Must be 0 or more"),
  value_currency: z.string().length(3, "Use a 3-letter currency code"),
  pipeline_stage_id: z.number({ message: "Select a stage" }).int().positive("Select a stage"),
  expected_close_date: z.string().optional().or(z.literal("")),
});

export type DealSchemaValues = z.infer<typeof dealSchema>;

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(5000).optional().or(z.literal("")),
  due_at: z.string().optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assignee_id: z.number().int().positive().optional(),
  contact_id: z.number().int().positive().optional(),
  lead_id: z.number().int().positive().optional(),
  deal_id: z.number().int().positive().optional(),
});

export type TaskSchemaValues = z.infer<typeof taskSchema>;

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginSchemaValues = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    name: z.string().min(1, "Your name is required").max(255),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    workspace_name: z.string().min(1, "Workspace name is required").max(255),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

export type SignupSchemaValues = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});

export type ForgotPasswordSchemaValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

export type ResetPasswordSchemaValues = z.infer<typeof resetPasswordSchema>;