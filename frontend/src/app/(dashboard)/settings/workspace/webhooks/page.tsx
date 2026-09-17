"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Webhook,
  X,
  XCircle,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsCard } from "@/components/settings/settings-card";
import { Toggle } from "@/components/settings/toggle";
import { danger, input, primary, secondary } from "@/components/settings/styles";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useRotateWebhookSecret,
  useTestWebhookEndpoint,
  useUpdateWebhookEndpoint,
  useWebhookEndpoints,
} from "@/hooks/use-webhooks";
import { WEBHOOK_EVENT_CATALOG, type WebhookEndpoint, type WebhookTestResult } from "@/lib/webhooks-api";
import { cn } from "@/lib/utils";

const BREADCRUMBS = [
  { label: "Settings", href: "/settings" },
  { label: "WhatsApp", href: "/settings/workspace/whatsapp" },
  { label: "Webhooks" },
];

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventLabel(event: string) {
  return WEBHOOK_EVENT_CATALOG.find((item) => item.event === event)?.label ?? event;
}

// ── Endpoint form modal (create / edit) ─────────────────────────

interface FormState {
  name: string;
  url: string;
  description: string;
  is_active: boolean;
  timeout_seconds: number;
  max_retries: number;
  events: Set<string>;
}

const EMPTY_FORM: FormState = {
  name: "",
  url: "",
  description: "",
  is_active: true,
  timeout_seconds: 10,
  max_retries: 3,
  events: new Set(),
};

function EndpointModal({
  open,
  endpoint,
  onClose,
}: {
  open: boolean;
  endpoint: WebhookEndpoint | null;
  onClose: () => void;
}) {
  const canManage = usePermission("webhooks.manage");
  const { toast } = useToast();
  const create = useCreateWebhookEndpoint();
  const update = useUpdateWebhookEndpoint();
  const [form, setForm] = useState<FormState>(() =>
    endpoint
      ? {
          name: endpoint.name,
          url: endpoint.url,
          description: endpoint.description ?? "",
          is_active: endpoint.is_active,
          timeout_seconds: endpoint.timeout_seconds,
          max_retries: endpoint.max_retries,
          events: new Set(endpoint.events),
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof WEBHOOK_EVENT_CATALOG>();
    for (const item of WEBHOOK_EVENT_CATALOG) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, []);

  if (!open) return null;

  const isEdit = Boolean(endpoint);
  const pending = create.isPending || update.isPending;

  const toggleEvent = (event: string) => {
    setForm((prev) => {
      const events = new Set(prev.events);
      if (events.has(event)) events.delete(event);
      else events.add(event);
      return { ...prev, events };
    });
  };

  const onSubmit = async () => {
    setError(null);
    if (!form.name.trim() || !form.url.trim()) {
      setError("Name and payload URL are required.");
      return;
    }
    const values = {
      name: form.name.trim(),
      url: form.url.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      timeout_seconds: form.timeout_seconds,
      max_retries: form.max_retries,
      events: Array.from(form.events),
    };
    try {
      if (endpoint) {
        await update.mutateAsync({ id: endpoint.id, values });
        toast("Webhook updated.", "success");
      } else {
        await create.mutateAsync(values);
        toast("Webhook created.", "success");
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save the webhook.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text">
            <Webhook className="h-5 w-5 text-primary" />
            {isEdit ? "Edit Webhook" : "Add Webhook"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Name *</label>
              <input
                className={input}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. CRM sync"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Payload URL *</label>
              <input
                className={input}
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/hooks/crm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted">Description</label>
              <input
                className={input}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What is this endpoint used for?"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Timeout (seconds, 1–60)</label>
              <input
                type="number"
                min={1}
                max={60}
                className={input}
                value={form.timeout_seconds}
                onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) || 10 })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Max retries (0–10)</label>
              <input
                type="number"
                min={0}
                max={10}
                className={input}
                value={form.max_retries}
                onChange={(e) => setForm({ ...form, max_retries: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Active</p>
              <p className="text-xs text-muted">Inactive webhooks are saved but never receive events.</p>
            </div>
            <Toggle label="Webhook active" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Events ({form.events.size} selected)
              </p>
            </div>
            <div className="space-y-3">
              {grouped.map(([group, items]) => (
                <div key={group} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium capitalize text-text">{group}</p>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() =>
                        setForm((prev) => {
                          const events = new Set(prev.events);
                          const allSelected = items.every((item) => events.has(item.event));
                          for (const item of items) {
                            if (allSelected) events.delete(item.event);
                            else events.add(item.event);
                          }
                          return { ...prev, events };
                        })
                      }
                    >
                      {items.every((item) => form.events.has(item.event)) ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <label
                        key={item.event}
                        title={item.event}
                        className={cn(
                          "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                          form.events.has(item.event)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-surface text-muted hover:bg-bg"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={form.events.has(item.event)}
                          onChange={() => toggleEvent(item.event)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Deliveries are signed with HMAC-SHA256 in the <code>X-Webhook-Signature</code> header.
            </p>
          </div>

          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose} className={secondary}>
            Cancel
          </button>
          <button type="button" onClick={() => void onSubmit()} disabled={pending || !canManage} className={primary}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Send test panel ─────────────────────────────────────────────

function TestPanel({ endpoint }: { endpoint: WebhookEndpoint }) {
  const test = useTestWebhookEndpoint();
  const [event, setEvent] = useState(endpoint.events[0] ?? WEBHOOK_EVENT_CATALOG[0].event);
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  const run = () => {
    setResult(null);
    test.mutate(
      { id: endpoint.id, event },
      {
        onSuccess: (data) => setResult(data),
      }
    );
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-bg p-4">
      <p className="text-sm font-medium text-text">Send a test delivery</p>
      <p className="mt-0.5 text-xs text-muted">
        One real signed HTTP POST to the configured URL. Nothing is faked — the result shows the actual response.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={cn(input, "max-w-xs")} value={event} onChange={(e) => setEvent(e.target.value)}>
          {(endpoint.events.length > 0 ? endpoint.events : WEBHOOK_EVENT_CATALOG.map((item) => item.event)).map((evt) => (
            <option key={evt} value={evt}>
              {eventLabel(evt)}
            </option>
          ))}
        </select>
        <button type="button" className={secondary} disabled={test.isPending} onClick={run}>
          {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test
        </button>
      </div>

      {test.isError && (
        <p className="mt-3 flex items-center gap-2 text-sm text-danger">
          <XCircle className="h-4 w-4" />
          {test.error instanceof ApiError ? test.error.message : "Test request failed."}
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-surface p-3 text-xs">
          <p className="flex items-center gap-2 font-medium">
            {result.status != null && result.status >= 200 && result.status < 300 ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <XCircle className="h-4 w-4 text-danger" />
            )}
            {result.status != null ? `HTTP ${result.status}` : "No response"} · {result.durationMs} ms
          </p>
          {result.error && <p className="text-danger">{result.error}</p>}
          {result.eventId && <p className="text-muted">Event ID: {result.eventId}</p>}
          {result.body && <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 text-muted">{result.body}</pre>}
        </div>
      )}
    </div>
  );
}

// ── Endpoint row ────────────────────────────────────────────────

function EndpointRow({
  endpoint,
  onEdit,
}: {
  endpoint: WebhookEndpoint;
  onEdit: () => void;
}) {
  const canManage = usePermission("webhooks.manage");
  const canTest = usePermission("webhooks.test");
  const { toast } = useToast();
  const update = useUpdateWebhookEndpoint();
  const remove = useDeleteWebhookEndpoint();
  const rotate = useRotateWebhookSecret();
  const [showTest, setShowTest] = useState(false);

  const onDelete = async () => {
    if (!window.confirm(`Delete webhook "${endpoint.name}"? Deliveries will stop immediately.`)) return;
    try {
      await remove.mutateAsync(endpoint.id);
      toast("Webhook deleted.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to delete the webhook.", "error");
    }
  };

  const onRotate = async () => {
    if (!window.confirm("Rotate the signing secret? Requests signed with the old secret will fail.")) return;
    try {
      await rotate.mutateAsync(endpoint.id);
      toast("Signing secret rotated. Update consumers with the new secret.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to rotate the secret.", "error");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-text">{endpoint.name}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                endpoint.is_active ? "bg-success/10 text-success" : "bg-muted text-muted"
              )}
            >
              {endpoint.is_active ? "Active" : "Paused"}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 break-all text-xs text-muted">
            {endpoint.url}
            <button
              type="button"
              aria-label="Copy URL"
              className="shrink-0 text-muted hover:text-text"
              onClick={() => {
                void navigator.clipboard?.writeText(endpoint.url);
                toast("URL copied.", "info");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </p>
          {endpoint.description && <p className="mt-1 text-xs text-muted">{endpoint.description}</p>}
          <p className="mt-2 flex flex-wrap gap-1.5">
            {endpoint.events.length === 0 ? (
              <span className="text-xs text-warning">No events subscribed — this webhook receives nothing.</span>
            ) : (
              endpoint.events.map((evt) => (
                <span key={evt} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">
                  {eventLabel(evt)}
                </span>
              ))
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle
            label={`${endpoint.is_active ? "Pause" : "Activate"} ${endpoint.name}`}
            checked={endpoint.is_active}
            disabled={!canManage}
            onChange={(next) =>
              update.mutate(
                { id: endpoint.id, values: { is_active: next } },
                { onError: (err) => toast(err instanceof ApiError ? err.message : "Unable to update.", "error") }
              )
            }
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted">Last delivery: {formatDateTime(endpoint.last_delivery_at)}</p>
        <div className="flex flex-wrap gap-2">
          {canTest && (
            <button type="button" className={secondary} onClick={() => setShowTest((open) => !open)}>
              <Send className="h-4 w-4" />
              {showTest ? "Hide test" : "Send test"}
            </button>
          )}
          {canManage && (
            <>
              <button type="button" className={secondary} onClick={onRotate} disabled={rotate.isPending}>
                <KeyRound className="h-4 w-4" />
                Rotate secret
              </button>
              <button type="button" className={secondary} onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </button>
              <button type="button" className={danger} onClick={() => void onDelete()} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {showTest && canTest && <TestPanel endpoint={endpoint} />}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────

function WebhooksContent() {
  const canManage = usePermission("webhooks.manage");
  const endpoints = useWebhookEndpoints();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);

  const activeCount = endpoints.data?.filter((item) => item.is_active).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SettingsBreadcrumb items={BREADCRUMBS} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Webhooks</h1>
            <p className="mt-1 text-sm text-muted">
              Push workspace events to external systems. Deliveries are queued, retried, and signed.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              className={primary}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Webhook
            </button>
          )}
        </div>
      </div>

      {endpoints.isLoading && (
        <SettingsCard>
          <div className="h-32 animate-pulse rounded-lg bg-bg" />
        </SettingsCard>
      )}
      {endpoints.isError && (
        <ErrorState message="Unable to load webhooks." onRetry={() => void endpoints.refetch()} />
      )}

      {!endpoints.isLoading && !endpoints.isError && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Total webhooks", endpoints.data?.length ?? 0],
              ["Active", activeCount],
              ["Paused", (endpoints.data?.length ?? 0) - activeCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
              </div>
            ))}
          </div>

          <SettingsCard
            title="Endpoints"
            description="Each endpoint receives only the events it subscribes to."
          >
            <div className="space-y-3">
              {(endpoints.data ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-bg p-8 text-center">
                  <Webhook className="mx-auto h-8 w-8 text-muted" />
                  <p className="mt-3 text-sm font-medium text-text">No webhooks yet</p>
                  <p className="mt-1 text-xs text-muted">
                    Add an endpoint to start receiving signed event deliveries.
                  </p>
                </div>
              )}
              {(endpoints.data ?? []).map((endpoint) => (
                <EndpointRow
                  key={endpoint.id}
                  endpoint={endpoint}
                  onEdit={() => {
                    setEditing(endpoint);
                    setModalOpen(true);
                  }}
                />
              ))}
            </div>
          </SettingsCard>
        </>
      )}

      <EndpointModal
        key={editing?.id ?? "new"}
        open={modalOpen}
        endpoint={editing}
        onClose={() => setModalOpen(false)}
      />

      <p className="text-xs text-muted">
        Looking to connect a WhatsApp number instead?{" "}
        <Link href="/settings/workspace/whatsapp" className="font-medium text-primary hover:underline">
          Go to WhatsApp Accounts
        </Link>
        .
      </p>
    </div>
  );
}

export default function WorkspaceWebhooksPage() {
  return (
    <RequirePermission permission="webhooks.view">
      <WebhooksContent />
    </RequirePermission>
  );
}
