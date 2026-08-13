"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Save } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { ApiError } from "@/lib/api-client";

function AwayMessageManager() {
  const { data: workspace, isLoading } = useWorkspaceSettings();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [trigger, setTrigger] = useState<"outside_hours" | "once_per_conversation">("outside_hours");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (workspace) {
      setEnabled(workspace.away_message_enabled ?? false);
      setMessage(workspace.away_message ?? "");
      setTrigger(workspace.away_message_trigger ?? "outside_hours");
    }
  }, [workspace]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const response = await fetch("/api/v1/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          away_message_enabled: enabled,
          away_message: message,
          away_message_trigger: trigger,
        }),
      });
      if (!response.ok) throw new Error("Failed to save");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save away message settings.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-border/60" />
        <div className="h-4 w-96 animate-pulse rounded bg-border/60" />
        <div className="h-48 animate-pulse rounded bg-bg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Away Message</h1>
        <p className="mt-1 text-sm text-muted">
          Automatically send a message when customers contact you outside business hours.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="away-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="away-enabled" className="text-sm font-medium text-text">
            Enable away message
          </label>
        </div>

        {enabled && (
          <>
            <div>
              <label htmlFor="away-trigger" className="mb-1 block text-xs font-medium text-muted">
                Send trigger
              </label>
              <select
                id="away-trigger"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as typeof trigger)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
              >
                <option value="outside_hours">Outside business hours</option>
                <option value="once_per_conversation">Once per conversation</option>
              </select>
            </div>

            <div>
              <label htmlFor="away-message" className="mb-1 block text-xs font-medium text-muted">
                Message
              </label>
              <textarea
                id="away-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Thanks for contacting us. Our team is currently offline and will respond during business hours."
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
              />
            </div>

            <div className="rounded-md bg-bg p-3">
              <p className="text-xs font-medium text-muted mb-1">Preview</p>
              <div className="flex items-start gap-2">
                <MessageSquare className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-text whitespace-pre-wrap">
                  {message || "No message configured."}
                </p>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        {saveSuccess && <p className="text-sm text-success">Away message settings saved.</p>}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AwayMessagePage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <AwayMessageManager />
    </RequirePermission>
  );
}
