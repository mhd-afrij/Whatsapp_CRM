"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCreateDeal } from "@/hooks/use-deals";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { ApiError } from "@/lib/api-client";
import { dealSchema, type DealSchemaValues } from "@/lib/schemas";

export function NewDealModal({
  pipelineId,
  stages,
  onClose,
}: {
  pipelineId: number;
  stages: { id: number; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const createDeal = useCreateDeal();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    handleSubmit,
    register,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DealSchemaValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      contact_id: undefined as unknown as number,
      title: "",
      value_amount: "",
      value_currency: "USD",
      pipeline_stage_id: stages[0]?.id,
      expected_close_date: "",
    },
  });

  const contactId = useWatch({ control, name: "contact_id" });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const deal = await createDeal.mutateAsync({
        contact_id: values.contact_id,
        pipeline_id: pipelineId,
        pipeline_stage_id: values.pipeline_stage_id,
        title: values.title,
        value_amount: values.value_amount ? Number(values.value_amount) : null,
        value_currency: values.value_currency,
        expected_close_date: values.expected_close_date || null,
      });
      onClose();
      router.push(`/deals/${deal.id}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Unable to create deal.");
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">New deal</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-primary-soft/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit} noValidate>
          {serverError && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{serverError}</p>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Title</label>
            <input
              {...register("title")}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
          </div>

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
              <label className="text-sm font-medium text-text">Value</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("value_amount")}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
              />
              {errors.value_amount && <p className="text-xs text-danger">{errors.value_amount.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-text">Currency</label>
              <input
                {...register("value_currency")}
                maxLength={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm uppercase text-text"
              />
              {errors.value_currency && (
                <p className="text-xs text-danger">{errors.value_currency.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Stage</label>
            <select
              {...register("pipeline_stage_id", { valueAsNumber: true })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {errors.pipeline_stage_id && (
              <p className="text-xs text-danger">{errors.pipeline_stage_id.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Expected close date</label>
            <input
              type="date"
              {...register("expected_close_date")}
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
              {isSubmitting ? "Creating…" : "Create deal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
