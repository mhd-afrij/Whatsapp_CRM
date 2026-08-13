"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { contactSchema, type ContactSchemaValues } from "@/lib/schemas";
import { fetchCustomFieldDefinitions, type CustomFieldDefinition } from "@/lib/custom-fields-api";
import { normalizePhoneNumber, PHONE_COUNTRY_CODE } from "@/lib/phone";

export function ContactForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  serverError,
}: {
  defaultValues?: Partial<ContactSchemaValues & { custom_fields?: Record<string, unknown> }>;
  onSubmit: (values: ContactSchemaValues & { custom_fields?: Record<string, unknown> }) => Promise<void> | void;
  submitLabel?: string;
  serverError?: string | null;
}) {
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    defaultValues?.custom_fields ?? {}
  );

  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ["custom-field-definitions", "contact"],
    queryFn: () => fetchCustomFieldDefinitions("contact"),
  });

  const {
    register,
    handleSubmit,
    setValue,
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

  useEffect(() => {
    if (defaultValues?.custom_fields) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing external prop values into local form state on mount/update
      setCustomFieldValues(defaultValues.custom_fields);
    }
  }, [defaultValues?.custom_fields]);

  const submit = handleSubmit(async (values) => {
    // Normalize to E.164 so the stored number can be dialed/WhatsApp'd later
    // (see lib/phone.ts) - a bare "0750144774" can never receive a message.
    const phone_number = values.phone_number
      ? normalizePhoneNumber(values.phone_number)
      : null;
    await onSubmit({
      full_name: values.full_name ?? null,
      email: values.email ? values.email : null,
      company: values.company ? values.company : null,
      job_title: values.job_title ? values.job_title : null,
      phone_number,
      custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
    });
  });

  const fieldClass = (hasError: boolean) =>
    cn(
      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
      hasError && "border-danger focus:border-danger focus:ring-danger"
    );

  const activeCustomFields = customFieldDefs.filter((f) => f.is_active);

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
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted"
            >
              +{PHONE_COUNTRY_CODE}
            </span>
            <input
              id="phone_number"
              placeholder="712345678"
              className={cn(fieldClass(!!errors.phone_number), "pl-12")}
              inputMode="tel"
              {...register("phone_number", {
                onBlur: (event) => {
                  const normalized = normalizePhoneNumber(event.target.value);
                  if (normalized !== event.target.value) {
                    setValue("phone_number", normalized);
                  }
                },
              })}
            />
          </div>
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

      {activeCustomFields.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium text-text">Custom Fields</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activeCustomFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={customFieldValues[field.key]}
                onChange={(val) => setCustomFieldValues((prev) => ({ ...prev, [field.key]: val }))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const inputClass = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  switch (field.field_type) {
    case "text":
      return (
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">
            {field.name}
            {field.is_required && <span className="text-danger"> *</span>}
          </label>
          <input
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">
            {field.name}
            {field.is_required && <span className="text-danger"> *</span>}
          </label>
          <input
            type="number"
            value={(value as number) ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className={inputClass}
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">
            {field.name}
            {field.is_required && <span className="text-danger"> *</span>}
          </label>
          <input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          />
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-border"
          />
          <label className="text-sm font-medium text-text">
            {field.name}
            {field.is_required && <span className="text-danger"> *</span>}
          </label>
        </div>
      );

    case "select":
      return (
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">
            {field.name}
            {field.is_required && <span className="text-danger"> *</span>}
          </label>
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    default:
      return null;
  }
}
