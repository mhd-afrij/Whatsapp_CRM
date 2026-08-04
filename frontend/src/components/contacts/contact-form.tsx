"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";
import type { ContactFormValues } from "@/lib/contacts-api";

const contactSchema = z.object({
  full_name: z.string().max(255).optional().or(z.literal("")),
  email: z
    .string()
    .max(255)
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  job_title: z.string().max(150).optional().or(z.literal("")),
  phone_number: z.string().max(32).optional().or(z.literal("")),
});

type ContactSchemaValues = z.infer<typeof contactSchema>;

export function ContactForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  serverError,
}: {
  defaultValues?: Partial<ContactSchemaValues>;
  onSubmit: (values: ContactFormValues) => Promise<void> | void;
  submitLabel?: string;
  serverError?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactSchemaValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      full_name: defaultValues?.full_name ?? "",
      email: defaultValues?.email ?? "",
      company: defaultValues?.company ?? "",
      job_title: defaultValues?.job_title ?? "",
      phone_number: defaultValues?.phone_number ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      full_name: values.full_name || null,
      email: values.email || null,
      company: values.company || null,
      job_title: values.job_title || null,
      phone_number: values.phone_number || null,
    });
  });

  const fieldClass = (hasError: boolean) =>
    cn(
      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
      hasError && "border-danger focus:border-danger focus:ring-danger"
    );

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {serverError && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</p>
      )}

      <div className="space-y-1">
        <label htmlFor="full_name" className="text-sm font-medium text-text">
          Full name
        </label>
        <input id="full_name" className={fieldClass(!!errors.full_name)} {...register("full_name")} />
        {errors.full_name && <p className="text-xs text-danger">{errors.full_name.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-text">
            Email
          </label>
          <input id="email" type="email" className={fieldClass(!!errors.email)} {...register("email")} />
          {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="phone_number" className="text-sm font-medium text-text">
            Phone number
          </label>
          <input id="phone_number" className={fieldClass(!!errors.phone_number)} {...register("phone_number")} />
          {errors.phone_number && (
            <p className="text-xs text-danger">{errors.phone_number.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="company" className="text-sm font-medium text-text">
            Company
          </label>
          <input id="company" className={fieldClass(!!errors.company)} {...register("company")} />
          {errors.company && <p className="text-xs text-danger">{errors.company.message}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="job_title" className="text-sm font-medium text-text">
            Job title
          </label>
          <input id="job_title" className={fieldClass(!!errors.job_title)} {...register("job_title")} />
          {errors.job_title && <p className="text-xs text-danger">{errors.job_title.message}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
