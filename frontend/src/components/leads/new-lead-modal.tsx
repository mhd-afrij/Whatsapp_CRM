"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCreateLead } from "@/hooks/use-leads";
import { useUsers } from "@/hooks/use-users";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { ApiError } from "@/lib/api-client";
import { leadSchema, type LeadSchemaValues } from "@/lib/schemas";
import { ACTIVE_STAGES, SOURCE_OPTIONS } from "@/lib/leads-constants";

export function NewLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const createLead = useCreateLead();
  const { data: users } = useUsers();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showRequirements, setShowRequirements] = useState(false);

  const {
    handleSubmit,
    register,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LeadSchemaValues>({
    resolver: zodResolver(leadSchema) as any,
    defaultValues: {
      contact_id: undefined as unknown as number,
      source: "manual",
      stage: "new",
      budget_min: null,
      budget_max: null,
      bedrooms: null,
      bathrooms: null,
      requirement_type: null,
      notes: "",
    },
  });

  const contactId = useWatch({ control, name: "contact_id" });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const lead = await createLead.mutateAsync({
        contact_id: values.contact_id,
        source: values.source,
        stage: values.stage,
        owner_user_id: values.owner_user_id,
        assigned_team_id: values.assigned_team_id,
        property_type: values.property_type || undefined,
        preferred_location: values.preferred_location || undefined,
        budget_min: values.budget_min,
        budget_max: values.budget_max,
        bedrooms: values.bedrooms,
        bathrooms: values.bathrooms,
        requirement_type: values.requirement_type,
        notes: values.notes || undefined,
      });
      onClose();
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Unable to create lead.");
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg">
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

          {/* Contact */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Contact *</label>
            <ContactPicker
              value={contactId ?? null}
              onChange={(id) => setValue("contact_id", id ?? (undefined as unknown as number), { shouldValidate: true })}
              hasError={!!errors.contact_id}
            />
            {errors.contact_id && <p className="text-xs text-danger">{errors.contact_id.message}</p>}
          </div>

          {/* Source + Stage */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Source *</label>
              <select
                {...register("source")}
                defaultValue="manual"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Stage</label>
              <select
                {...register("stage")}
                defaultValue="new"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                {ACTIVE_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Owner */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Owner</label>
            <select
              {...register("owner_user_id", { valueAsNumber: true })}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              <option value="">Current user (default)</option>
              {users?.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Requirements toggle */}
          <button
            type="button"
            onClick={() => setShowRequirements(!showRequirements)}
            className="text-xs text-primary hover:underline"
          >
            {showRequirements ? "Hide requirements" : "Add requirements (optional)"}
          </button>

          {showRequirements && (
            <div className="space-y-4 rounded-md border border-border-muted bg-bg/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Property type</label>
                  <input
                    type="text"
                    {...register("property_type")}
                    placeholder="e.g. Apartment"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Location</label>
                  <input
                    type="text"
                    {...register("preferred_location")}
                    placeholder="e.g. Colombo"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted">Requirement</label>
                <select
                  {...register("requirement_type")}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                >
                  <option value="">Not specified</option>
                  <option value="purchase">Purchase</option>
                  <option value="rental">Rental</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Budget min</label>
                  <input
                    type="number"
                    {...register("budget_min")}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Budget max</label>
                  <input
                    type="number"
                    {...register("budget_max")}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Bedrooms</label>
                  <input
                    type="number"
                    {...register("bedrooms")}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted">Bathrooms</label>
                  <input
                    type="number"
                    {...register("bathrooms")}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Notes</label>
            <textarea
              rows={3}
              {...register("notes")}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            />
          </div>

          {/* Actions */}
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
