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
  stage: z.enum(["new", "contacted", "qualified", "disqualified", "converted"]),
  notes: z.string().max(2000).optional().or(z.literal("")),
  follow_up_date: z.string().optional().or(z.literal("")),
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
  remember_me: z.boolean().optional(),
});

export type LoginSchemaValues = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    name: z.string().min(1, "Please enter your full name").max(255),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers and underscores"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

export type SignupSchemaValues = z.infer<typeof signupSchema>;

/**
 * Onboarding Step 2: workspace identity. `workspace_name` renames the
 * provisional "{name}'s Workspace" created at signup; `position` is
 * free-text metadata; `whatsapp_display_name` is shown in the gateway as the
 * linked device name.
 */
export const onboardingWorkspaceSchema = z.object({
  workspace_name: z.string().trim().min(1, "Workspace name is required").max(150),
  position: z.string().trim().min(1, "Position is required").max(120),
  whatsapp_display_name: z.string().trim().min(1, "WhatsApp display name is required").max(120),
});

export type OnboardingWorkspaceSchemaValues = z.infer<typeof onboardingWorkspaceSchema>;

/**
 * Onboarding Step 3: the real WhatsApp number. `country` is the display name
 * (e.g. "Sri Lanka"), `country_code` the dialing code without "+", and
 * `mobile_number` the national part. The backend normalizes the full number
 * to E.164 and stores it on both the workspace and the account slot.
 */
export const onboardingWhatsappSchema = z.object({
  country: z.string().min(1, "Select a country"),
  country_code: z.string().regex(/^[0-9]{1,4}$/, "Enter a valid country code"),
  mobile_number: z
    .string()
    .trim()
    .regex(/^[0-9][0-9 ]{5,19}$/, "Enter a valid mobile number"),
});

export type OnboardingWhatsappSchemaValues = z.infer<typeof onboardingWhatsappSchema>;

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