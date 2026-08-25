"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Megaphone, Users } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLabelList } from "@/hooks/use-labels";
import { useMessageTemplates } from "@/hooks/use-message-templates";
import {
  useAudiencePreview,
  useCreateCampaign,
} from "@/hooks/use-campaigns";
import type { CampaignAudienceFilter } from "@/lib/campaigns-api";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const STEPS = ["Audience", "Message", "Review"] as const;
const CONTACT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const VARIABLE_HINTS = [
  "{{contact.first_name}}",
  "{{contact.last_name}}",
  "{{workspace.name}}",
];

function AudienceStep({
  filter,
  onChange,
}: {
  filter: CampaignAudienceFilter;
  onChange: (filter: CampaignAudienceFilter) => void;
}) {
  const { data: labels } = useLabelList();
  const [previewFilter, setPreviewFilter] = useState<CampaignAudienceFilter | null>(null);
  const preview = useAudiencePreview(previewFilter);

  const toggleLabel = (id: number) => {
    const labels2 = filter.labels.includes(id)
      ? filter.labels.filter((l) => l !== id)
      : [...filter.labels, id];
    onChange({ ...filter, labels: labels2 });
  };

  const toggleStatus = (status: string) => {
    const statuses = filter.statuses.includes(status)
      ? filter.statuses.filter((s) => s !== status)
      : [...filter.statuses, status];
    onChange({ ...filter, statuses });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text">Who should receive this campaign?</h3>
        <p className="text-xs text-muted">
          Pick at least one label or status. Only contacts with a phone number are included.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Labels</p>
        {(labels?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No labels defined yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {labels!.map((label) => {
              const selected = filter.labels.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleLabel(label.id)}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary-dark"
                      : "border-border bg-bg text-muted hover:text-text"
                  )}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: `#${label.color_hex}` }}
                  />
                  {label.name}
                  {selected && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Contact status</p>
        <div className="flex gap-2">
          {CONTACT_STATUSES.map((status) => {
            const selected = filter.statuses.includes(status.value);
            return (
              <button
                key={status.value}
                type="button"
                onClick={() => toggleStatus(status.value)}
                aria-pressed={selected}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary-dark"
                    : "border-border bg-bg text-muted hover:text-text"
                )}
              >
                {status.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="audience-search" className="mb-1 block text-xs font-medium text-muted">
          Name / phone contains (optional)
        </label>
        <input
          id="audience-search"
          value={filter.search ?? ""}
          onChange={(e) => onChange({ ...filter, search: e.target.value || undefined })}
          placeholder="e.g. VIP customers"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
      </div>

      <div className="rounded-md border border-border bg-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text">
            <Users className="mr-1.5 inline h-4 w-4 text-muted" />
            {preview.data
              ? `${preview.data.count} contact${preview.data.count === 1 ? "" : "s"} match`
              : "Preview audience size"}
          </p>
          <button
            type="button"
            onClick={() =>
              setPreviewFilter({
                labels: filter.labels,
                statuses: filter.statuses,
                ...(filter.search ? { search: filter.search } : {}),
              })
            }
            disabled={preview.isFetching}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-surface disabled:opacity-50"
          >
            {preview.isFetching ? "Checking..." : "Refresh count"}
          </button>
        </div>
        {preview.data && preview.data.sample.length > 0 && (
          <p className="mt-2 truncate text-xs text-muted">
            e.g.{" "}
            {preview.data.sample.map((c) => `${c.full_name} (${c.phone_number})`).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageStep({
  templateId,
  content,
  onTemplateChange,
  onContentChange,
}: {
  templateId: number | null;
  content: string;
  onTemplateChange: (id: number | null) => void;
  onContentChange: (content: string) => void;
}) {
  const { data: templates } = useMessageTemplates({ is_active: true });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text">What should we send?</h3>
        <p className="text-xs text-muted">
          Start from a saved reply or write a custom message. Variables are resolved per recipient.
        </p>
      </div>

      <div>
        <label htmlFor="campaign-template" className="mb-1 block text-xs font-medium text-muted">
          Saved reply (optional)
        </label>
        <select
          id="campaign-template"
          value={templateId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            onTemplateChange(id);
            if (id != null && !content.trim()) {
              const tpl = templates?.find((t) => t.id === id);
              if (tpl) onContentChange(tpl.content);
            }
          }}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          <option value="">Custom message</option>
          {templates?.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Choosing a saved reply pre-fills the message below; you can still edit it per campaign.
        </p>
      </div>

      <div>
        <label htmlFor="campaign-content" className="mb-1 block text-xs font-medium text-muted">
          Message *
        </label>
        <textarea
          id="campaign-content"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={7}
          required
          maxLength={4096}
          placeholder="Hi {{contact.first_name}}, we have exciting news for you!"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted">
          <span>
            Variables:{" "}
            {VARIABLE_HINTS.map((v) => (
              <code key={v} className="mx-0.5 rounded bg-bg px-1 py-0.5 text-[11px]">
                {v}
              </code>
            ))}
          </span>
          <span>{content.length}/4096</span>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  name,
  description,
  audienceCount,
  content,
  scheduledAt,
  onNameChange,
  onDescriptionChange,
  onScheduleModeChange,
  onScheduledAtChange,
  scheduleMode,
}: {
  name: string;
  description: string;
  audienceCount: number | null;
  content: string;
  scheduledAt: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onScheduleModeChange: (mode: "now" | "later") => void;
  onScheduledAtChange: (v: string) => void;
  scheduleMode: "now" | "later";
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text">Final details</h3>
        <p className="text-xs text-muted">Give the campaign a name and choose when to send.</p>
      </div>

      <div>
        <label htmlFor="campaign-name" className="mb-1 block text-xs font-medium text-muted">
          Campaign name *
        </label>
        <input
          id="campaign-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. March promo blast"
          required
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
      </div>

      <div>
        <label htmlFor="campaign-description" className="mb-1 block text-xs font-medium text-muted">
          Description (optional)
        </label>
        <input
          id="campaign-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Internal note about this campaign"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted">When to send</legend>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="schedule-mode"
            checked={scheduleMode === "now"}
            onChange={() => onScheduleModeChange("now")}
          />
          Save as draft — I&apos;ll send it manually
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="schedule-mode"
            checked={scheduleMode === "later"}
            onChange={() => onScheduleModeChange("later")}
          />
          Schedule for later
        </label>
        {scheduleMode === "later" && (
          <input
            type="datetime-local"
            value={scheduledAt}
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            required
            className="ml-6 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        )}
      </fieldset>

      <div className="rounded-md border border-border bg-bg p-3 text-sm text-text">
        <p className="font-medium">Summary</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted">
          <li>Audience: {audienceCount == null ? "not counted yet" : `${audienceCount} contacts`}</li>
          <li>Message: {content.trim().slice(0, 80) || "(empty)"}</li>
          <li>
            Delivery:{" "}
            {scheduleMode === "later"
              ? scheduledAt
                ? `scheduled for ${new Date(scheduledAt).toLocaleString()}`
                : "scheduled time not set yet"
              : "manual send"}
          </li>
        </ul>
      </div>
    </div>
  );
}

function NewCampaignWizard() {
  const router = useRouter();
  const createMutation = useCreateCampaign();
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState<CampaignAudienceFilter>({ labels: [], statuses: [] });
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Live count once the user has picked any criterion; refreshed by the
  // preview hook whenever the filter object identity changes.
  const hasCriteria = filter.labels.length > 0 || filter.statuses.length > 0 || Boolean(filter.search);
  const previewFilter = useMemo(
    () =>
      hasCriteria
        ? {
            labels: filter.labels,
            statuses: filter.statuses,
            ...(filter.search ? { search: filter.search } : {}),
          }
        : null,
    [hasCriteria, filter]
  );
  const { data: preview } = useAudiencePreview(previewFilter);

  const canContinue =
    step === 0
      ? hasCriteria
      : step === 1
        ? content.trim().length > 0
        : name.trim().length > 0 && (scheduleMode === "now" || Boolean(scheduledAt));

  const onSubmit = async () => {
    setError(null);
    try {
      const campaign = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        message_template_id: templateId,
        message_content: content.trim(),
        labels: filter.labels,
        statuses: filter.statuses,
        ...(filter.search ? { search: filter.search } : {}),
        ...(scheduleMode === "later" && scheduledAt
          ? { scheduled_at: new Date(scheduledAt).toISOString() }
          : {}),
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create campaign.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">New Campaign</h1>
          <p className="mt-1 text-sm text-muted">
            Segment an audience, write your message, then send or schedule.
          </p>
        </div>
        <Link href="/campaigns" className="shrink-0 text-sm text-muted hover:text-text">
          Back
        </Link>
      </div>

      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-success/15 text-success"
                  : i === step
                    ? "bg-primary text-white"
                    : "bg-bg text-muted"
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                i === step ? "text-text" : "text-muted"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) {
            if (canContinue) setStep(step + 1);
          } else {
            void onSubmit();
          }
        }}
        className="space-y-6 rounded-lg border border-border bg-surface p-4 sm:p-6"
      >
        {step === 0 && <AudienceStep filter={filter} onChange={setFilter} />}
        {step === 1 && (
          <MessageStep
            templateId={templateId}
            content={content}
            onTemplateChange={setTemplateId}
            onContentChange={setContent}
          />
        )}
        {step === 2 && (
          <ReviewStep
            name={name}
            description={description}
            audienceCount={preview?.count ?? null}
            content={content}
            scheduleMode={scheduleMode}
            scheduledAt={scheduledAt}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onScheduleModeChange={setScheduleMode}
            onScheduledAtChange={setScheduledAt}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || createMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="submit"
            disabled={!canContinue || createMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {step < STEPS.length - 1 ? (
              <>
                Continue <ArrowRight className="h-4 w-4" />
              </>
            ) : createMutation.isPending ? (
              "Creating..."
            ) : (
              <>
                <Megaphone className="h-4 w-4" />
                {scheduleMode === "later" ? "Create & schedule" : "Create draft"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <RequirePermission permission="campaigns.create">
      <NewCampaignWizard />
    </RequirePermission>
  );
}
