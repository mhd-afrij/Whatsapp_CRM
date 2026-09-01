"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { contactSchema, type ContactSchemaValues } from "@/lib/schemas";
import { fetchCustomFieldDefinitions, type CustomFieldDefinition } from "@/lib/custom-fields-api";
import { normalizePhoneNumber, PHONE_COUNTRY_CODE } from "@/lib/phone";
import { detectCountryFromNumber } from "@/lib/countries";
import { PhoneNumberInput } from "@/components/contacts/phone-number-input";

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

  // A stored number arrives as E.164 ("94750144774"); detect the country and
  // split it so the field holds the national part while the dropdown carries
  // the dialing code. Done once up front - typing is handled by
  // PhoneNumberInput's auto-detect.
  const initialPhone = detectCountryFromNumber(defaultValues?.phone_number ?? "");
  const initialPhoneNumber = initialPhone?.national ?? defaultValues?.phone_number ?? "";

  // Dialing code of the country selected in the phone dropdown (defaults to
  // the workspace's +{PHONE_COUNTRY_CODE}); the input itself only ever holds
  // the national part.
  const [phoneDial, setPhoneDial] = useState(initialPhone?.country.dial ?? PHONE_COUNTRY_CODE);

  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ["custom-field-definitions", "contact"],
    queryFn: () => fetchCustomFieldDefinitions("contact"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContactSchemaValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      full_name: defaultValues?.full_name ?? "",
      email: defaultValues?.email ?? "",
      phone_number: initialPhoneNumber,
      address: defaultValues?.address ?? "",
      city: defaultValues?.city ?? "",
      country: defaultValues?.country ?? "",
      timezone: defaultValues?.timezone ?? "",
    },
  });

  const watchedPhoneNumber = useWatch({ control, name: "phone_number" }) ?? "";

  useEffect(() => {
    if (defaultValues?.custom_fields) {
      setCustomFieldValues(defaultValues.custom_fields);
    }
  }, [defaultValues?.custom_fields]);

  // Timezone is always filled in automatically from the visitor's browser;
  // the field is informational and not editable. Only set it when the form
  // has no saved timezone (e.g. a contact imported without one) so an
  // existing value is never clobbered. Runs client-side after hydration to
  // avoid a server/client mismatch.
  useEffect(() => {
    if (getValues("timezone")) return;
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimezone) {
      setValue("timezone", browserTimezone, { shouldValidate: false });
    }
  }, [getValues, setValue]);

  const submit = handleSubmit(async (values) => {
    // Normalize to E.164 so the stored number can be dialed/WhatsApp'd later
    // (see lib/phone.ts) - a bare "0750144774" can never receive a message.
    // The dialing code comes from the country dropdown (phoneDial), not the
    // workspace default, so international numbers stay correct.
    const phone_number = values.phone_number
      ? normalizePhoneNumber(values.phone_number, phoneDial)
      : null;
    await onSubmit({
      full_name: values.full_name ?? null,
      email: values.email ? values.email : null,
      company: values.company ? values.company : null,
      job_title: values.job_title ? values.job_title : null,
      phone_number,
      address: values.address ? values.address : null,
      city: values.city ? values.city : null,
      country: values.country ? values.country : null,
      timezone:
        values.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
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
          <PhoneNumberInput
            id="phone_number"
            value={watchedPhoneNumber}
            dialCode={phoneDial}
            onDialCodeChange={setPhoneDial}
            onChange={(nationalNumber) => setValue("phone_number", nationalNumber, { shouldValidate: true })}
            hasError={!!errors.phone_number}
          />
          {errors.phone_number && (
            <p className="text-xs text-danger">{errors.phone_number.message}</p>
          )}
          <p className="text-xs text-muted">
            Select the country code — numbers are saved in international format.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="timezone" className="text-sm font-medium text-text">
            Timezone
          </label>
          <input
            id="timezone"
            readOnly
            placeholder="Set automatically"
            className={cn(fieldClass(!!errors.timezone), "cursor-not-allowed opacity-70")}
            {...register("timezone")}
          />
          <p className="text-xs text-muted">Set automatically from your browser.</p>
          {errors.timezone && <p className="text-xs text-danger">{errors.timezone.message}</p>}
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium text-text">Location</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="country" className="text-sm font-medium text-text">
              Country
            </label>
            <input id="country" className={fieldClass(!!errors.country)} {...register("country")} />
            {errors.country && <p className="text-xs text-danger">{errors.country.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="city" className="text-sm font-medium text-text">
              City
            </label>
            <input id="city" className={fieldClass(!!errors.city)} {...register("city")} />
            {errors.city && <p className="text-xs text-danger">{errors.city.message}</p>}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="address" className="text-sm font-medium text-text">
              Address
            </label>
            <input id="address" className={fieldClass(!!errors.address)} {...register("address")} />
            {errors.address && <p className="text-xs text-danger">{errors.address.message}</p>}
          </div>
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
