"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCreateLead } from "@/hooks/use-leads";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { ApiError } from "@/lib/api-client";
import { leadSchema, type LeadSchemaValues } from "@/lib/schemas";

const SOURCE_OPTIONS = ["whatsapp", "manual", "import", "other"] as const;
const STATUS_OPTIONS = ["new", "contacted", "qualified", "disqualified", "converted"] as const;

export function NewLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const createLead = useCreateLead();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    handleSubmit,
    register,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LeadSchemaValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: { contact_id: undefined as unknown as number, source: "manual", status: "new", notes: "" },
  });

  const contactId = useWatch({ control, name: "contact_id" });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const lead = await createLead.mutateAsync({
        contact_id: values.contact_id,
        source: values.source,
        status: values.status,
        notes: values.notes || null,
      });
      onClose();
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Unable to create lead.");
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">New lead</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-primary-soft/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit} noValidate>
          {serverError && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</p>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Contact</label>
            <ContactPicker
              value={contactId ?? null}
              onChange={(id) => setValue("contact_id", id ?? (undefined as unknown as number), { shouldValidate: true })}
              hasError={!!errors.contact_id}
            />
            {errors.contact_id && <p className="text-xs text-danger">{errors.contact_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Source</label>
              <select
                {...register("source")}
                defaultValue="manual"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Status</label>
              <select
                {...register("status")}
                defaultValue="new"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Notes</label>
            <textarea
              rows={3}
              {...register("notes")}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {isSubmitting ? "Creating…" : "Create lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
