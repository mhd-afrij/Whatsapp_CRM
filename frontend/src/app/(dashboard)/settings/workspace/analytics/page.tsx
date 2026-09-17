"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Database,
  Download,
  FileText,
  Inbox,
  MessageSquare,
  Shield,
  SlidersHorizontal,
  UserCheck,
  Users,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { SettingsCard, SettingRow } from "@/components/settings/settings-card";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { SettingsSaveBar } from "@/components/settings/settings-save-bar";
import { SettingsSkeleton, SettingsErrorState } from "@/components/settings/settings-states";
import { Toggle } from "@/components/settings/toggle";
import { Select } from "@/components/settings/select";
import { Modal } from "@/components/settings/modal";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import {
  useAnalyticsSettings,
  useResetAnalyticsSettings,
  useUpdateAnalyticsSettings,
} from "@/hooks/use-analytics-settings";
import type {
  AgentVisibility,
  AnalyticsDefaultPeriod,
  AnalyticsDateFormat,
  AnalyticsSettings,
  AggregateRetentionDays,
  ConversationResolutionRule,
  ConversationStartRule,
  DeletedMessagesRule,
  MaxExportRangeDays,
  RawEventRetentionDays,
} from "@/lib/analytics-settings-api";

type TabKey =
  | "general"
  | "messages"
  | "conversations"
  | "contacts"
  | "agents"
  | "accounts"
  | "templates"
  | "rules"
  | "retention"
  | "permissions"
  | "export";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "general", label: "General", icon: SlidersHorizontal },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "conversations", label: "Conversations", icon: Inbox },
  { key: "contacts", label: "Contacts & Leads", icon: Users },
  { key: "agents", label: "Agents", icon: UserCheck },
  { key: "accounts", label: "WhatsApp Accounts", icon: Building2 },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "rules", label: "Tracking Rules", icon: BarChart3 },
  { key: "retention", label: "Retention", icon: Database },
  { key: "permissions", label: "Permissions", icon: Shield },
  { key: "export", label: "Export & Reports", icon: Download },
];

const TIMEZONE_OPTIONS = [
  "UTC",
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
].map((tz) => ({ value: tz, label: tz }));

const PERIOD_OPTIONS: Array<{ value: AnalyticsDefaultPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
];

const DATE_FORMAT_OPTIONS: Array<{ value: AnalyticsDateFormat; label: string }> = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

const CURRENCY_OPTIONS = ["LKR", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }));

const AGENT_VISIBILITY_OPTIONS: Array<{ value: AgentVisibility; label: string }> = [
  { value: "super_admin", label: "Super Admin Only" },
  { value: "workspace_admins", label: "Workspace Admins" },
  { value: "managers", label: "Managers" },
  { value: "managers_plus_self", label: "Managers + Agent Self View" },
  { value: "agent_self", label: "Agent Self View Only" },
];

const START_RULE_OPTIONS: Array<{ value: ConversationStartRule; label: string }> = [
  { value: "first_incoming", label: "First incoming message" },
  { value: "first_outgoing", label: "First outgoing message" },
  { value: "either_direction", label: "Either incoming or outgoing message" },
];

const RESOLUTION_RULE_OPTIONS: Array<{ value: ConversationResolutionRule; label: string }> = [
  { value: "resolved", label: "Status changed to Resolved" },
  { value: "closed", label: "Status changed to Closed" },
  { value: "either", label: "Either Resolved or Closed" },
];

const DELETED_MESSAGES_OPTIONS: Array<{ value: DeletedMessagesRule; label: string }> = [
  { value: "keep", label: "Keep in historical analytics" },
  { value: "exclude", label: "Exclude from analytics" },
];

function retentionOptions(values: Array<number>, unlimitedLabel = "Unlimited") {
  return values.map((days) => ({
    value: String(days),
    label: days === 0 ? unlimitedLabel : days >= 365 ? `${days / 365} Year${days > 365 ? "s" : ""}` : `${days} Days`,
  }));
}

const RAW_RETENTION_OPTIONS = retentionOptions([30, 90, 180, 365, 730, 0]);
const AGGREGATE_RETENTION_OPTIONS = retentionOptions([90, 365, 730, 1825, 0]);
const EXPORT_RANGE_OPTIONS = retentionOptions([30, 90, 180, 365, 0]);

function formErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors && typeof error.errors === "object" && !Array.isArray(error.errors)) {
      const first = Object.values(error.errors).flat()[0];
      if (typeof first === "string") return first;
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function normalizeSettings(raw: unknown): AnalyticsSettings {
  const base = {
    analytics_enabled: true,
    timezone: "Asia/Colombo",
    default_period: "last_30_days",
    week_starts_on_monday: true,
    currency: "LKR",
    date_format: "DD/MM/YYYY",

    track_sent_messages: true,
    track_received_messages: true,
    track_delivered_messages: true,
    track_read_messages: true,
    track_failed_messages: true,
    track_deleted_messages: true,
    track_response_time: true,
    track_first_response_time: true,
    track_message_volume: true,
    track_messages_by_agent: true,
    track_messages_by_account: true,
    track_messages_by_template: true,
    include_automated_messages: true,
    include_system_events: false,

    track_conversations: true,
    track_conversation_status_counts: true,
    track_conversation_duration: true,
    track_resolution_time: true,
    track_assignment_time: true,
    track_sla_breaches: true,

    track_contacts: true,
    track_contact_source: true,
    track_contact_tags: true,
    track_contact_activity: true,
    track_contact_assignment: true,
    track_leads: true,
    track_lead_source: true,
    track_lead_stage_changes: true,
    track_lead_status_changes: true,
    track_lead_assignment: true,
    track_won_leads: true,
    track_lost_leads: true,
    track_lead_conversion: true,

    track_agent_performance: true,
    track_agent_assigned_conversations: true,
    track_agent_conversations_handled: true,
    track_agent_conversations_resolved: true,
    track_agent_first_response_time: true,
    track_agent_avg_response_time: true,
    track_agent_resolution_time: true,
    track_agent_messages_sent: true,
    track_agent_messages_received: true,
    track_agent_reopened_conversations: true,
    track_agent_sla_performance: true,
    track_agent_active_conversations: true,
    agent_leaderboard_enabled: false,
    agent_visibility: "managers_plus_self",

    track_account_analytics: true,
    track_account_messages: true,
    track_account_conversations: true,
    track_account_contacts: true,
    track_account_leads: true,
    track_account_delivery_rate: true,
    track_account_read_rate: true,
    track_account_failed_messages: true,
    track_account_response_time: true,
    track_account_templates: true,
    track_account_message_volume: true,
    aggregate_accounts: true,

    track_template_analytics: true,
    track_template_usage: true,
    track_template_sent_count: true,
    track_template_delivered_count: true,
    track_template_read_count: true,
    track_template_failed_count: true,
    track_template_reply_count: true,
    track_template_by_account: true,
    track_template_by_agent: true,

    conversation_start_rule: "either_direction",
    conversation_resolution_rule: "either",
    bot_reply_counts_as_response: false,
    include_imported_messages: false,
    deleted_messages_rule: "keep",
    count_internal_notes: false,

    raw_event_retention_days: 90,
    aggregate_retention_days: 365,

    allow_csv_export: true,
    allow_excel_export: true,
    allow_pdf_export: true,
    allow_personal_data_export: false,
    max_export_range_days: 365,
  } as AnalyticsSettings;

  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<AnalyticsSettings>) };
}

/** Toggle row bound to a boolean settings key. */
function ToggleRow({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={<Toggle label={label} checked={value} disabled={disabled} onChange={onChange} />}
    />
  );
}

export default function WorkspaceAnalyticsSettingsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <AnalyticsSettingsContent />
    </RequirePermission>
  );
}

function AnalyticsSettingsContent() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useAnalyticsSettings();
  const update = useUpdateAnalyticsSettings();
  const resetMutation = useResetAnalyticsSettings();

  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<AnalyticsSettings>(normalizeSettings(null));
  const [syncedJson, setSyncedJson] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const saved = useMemo(() => normalizeSettings(data?.settings), [data]);
  const savedJson = JSON.stringify(saved);
  if (data && savedJson !== syncedJson) {
    setSyncedJson(savedJson);
    setDraft(saved);
  }

  const dirty = syncedJson !== "" && JSON.stringify(draft) !== savedJson;

  const patch = (changes: Partial<AnalyticsSettings>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // Unsaved-changes guard: warn before internal navigation.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const confirmLeave = () => {
    setShowLeaveModal(false);
    const href = pendingNavigation;
    setPendingNavigation(null);
    if (href) window.location.href = href;
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      const result = await update.mutateAsync(draft);
      setSyncedJson(JSON.stringify(normalizeSettings(result.settings)));
      setDraft(normalizeSettings(result.settings));
      toast("Analytics settings updated successfully.", "success");
    } catch (err) {
      const message = formErrorMessage(err);
      setSaveError(message);
      toast(message, "error");
    }
  };

  const handleReset = async () => {
    setShowResetModal(false);
    setSaveError(null);
    try {
      const result = await resetMutation.mutateAsync();
      setSyncedJson(JSON.stringify(normalizeSettings(result.settings)));
      setDraft(normalizeSettings(result.settings));
      toast("Analytics settings were reset to the recommended defaults.", "success");
    } catch (err) {
      const message = formErrorMessage(err);
      setSaveError(message);
      toast(message, "error");
    }
  };

  const handleNavClick = (href: string) => {
    if (dirty) {
      setPendingNavigation(href);
      setShowLeaveModal(true);
      return;
    }
    window.location.href = href;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/settings"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              handleNavClick("/settings");
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
        >
          Back to Settings
        </Link>
        <SettingsBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "System", href: "/settings" },
            { label: "Analytics" },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Analytics Settings</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Configure analytics tracking, reporting rules, agent performance metrics, data
              retention, exports, and access permissions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!dirty || update.isPending} onClick={() => setShowResetModal(true)}>
              Reset to Defaults
            </Button>
            <Button type="button" size="sm" disabled={!dirty || update.isPending} onClick={() => void handleSave()}>
              {update.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {isLoading && <SettingsSkeleton rows={7} />}
      {isError && (
        <SettingsErrorState message="Unable to load analytics settings." onRetry={() => void refetch()} />
      )}

      {!isLoading && !isError && (
        <>
          <SettingsTabs tabs={TABS} active={activeTab} onChange={(key) => setActiveTab(key as TabKey)} />

          {activeTab === "general" && (
            <GeneralSection draft={draft} onChange={patch} />
          )}
          {activeTab === "messages" && (
            <MessagesSection draft={draft} onChange={patch} />
          )}
          {activeTab === "conversations" && (
            <ConversationsSection draft={draft} onChange={patch} />
          )}
          {activeTab === "contacts" && (
            <ContactsSection draft={draft} onChange={patch} />
          )}
          {activeTab === "agents" && (
            <AgentsSection draft={draft} onChange={patch} />
          )}
          {activeTab === "accounts" && (
            <AccountsSection draft={draft} onChange={patch} />
          )}
          {activeTab === "templates" && (
            <TemplatesSection draft={draft} onChange={patch} />
          )}
          {activeTab === "rules" && (
            <RulesSection draft={draft} onChange={patch} />
          )}
          {activeTab === "retention" && (
            <RetentionSection draft={draft} onChange={patch} />
          )}
          {activeTab === "permissions" && (
            <PermissionsSection draft={draft} onChange={patch} />
          )}
          {activeTab === "export" && (
            <ExportSection draft={draft} onChange={patch} />
          )}

          <SettingsSaveBar
            dirty={dirty}
            saving={update.isPending}
            error={saveError}
            canSave
            onSave={() => void handleSave()}
            onReset={() => setDraft(saved)}
          />
        </>
      )}

      <Modal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset analytics settings?"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowResetModal(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={resetMutation.isPending} onClick={() => void handleReset()}>
              {resetMutation.isPending ? "Resetting…" : "Reset Settings"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">
          Reset all analytics settings for this workspace to the recommended defaults?
        </p>
      </Modal>

      <Modal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Unsaved changes"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowLeaveModal(false)}>
              Stay
            </Button>
            <Button type="button" variant="destructive" onClick={confirmLeave}>
              Leave Without Saving
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">You have unsaved analytics settings. Leave without saving?</p>
      </Modal>
    </div>
  );
}

type SectionProps = {
  draft: AnalyticsSettings;
  onChange: (changes: Partial<AnalyticsSettings>) => void;
};

function GeneralSection({ draft, onChange }: SectionProps) {
  return (
    <div className="space-y-6">
      {draft.analytics_enabled === false && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Analytics is disabled. New analytics aggregation stops now; existing historical data
            remains available unless removed by retention rules.
          </span>
        </div>
      )}
      <SettingsCard
        title="General Analytics"
        description="Workspace-wide analytics behavior and display defaults."
      >
        <ToggleRow
          label="Enable analytics"
          description="Collect and process analytics data for this workspace."
          value={draft.analytics_enabled}
          onChange={(v) => onChange({ analytics_enabled: v })}
        />
        <SettingRow
          label="Workspace timezone"
          description="All analytics grouping and date calculations use this timezone."
          control={
            <Select
              className="w-full sm:w-56"
              aria-label="Workspace timezone"
              value={draft.timezone}
              options={TIMEZONE_OPTIONS}
              onChange={(e) => onChange({ timezone: e.target.value })}
            />
          }
        />
        <SettingRow
          label="Default analytics period"
          description="Initial date range used across analytics views."
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Default analytics period"
              value={draft.default_period}
              options={PERIOD_OPTIONS}
              onChange={(e) => onChange({ default_period: e.target.value as AnalyticsDefaultPeriod })}
            />
          }
        />
        <SettingRow
          label="Week starts on"
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Week starts on"
              value={draft.week_starts_on_monday ? "monday" : "sunday"}
              options={[
                { value: "monday", label: "Monday" },
                { value: "sunday", label: "Sunday" },
              ]}
              onChange={(e) => onChange({ week_starts_on_monday: e.target.value === "monday" })}
            />
          }
        />
        <SettingRow
          label="Currency"
          description="Used for future revenue and conversion analytics."
          control={
            <Select
              className="w-full sm:w-32"
              aria-label="Currency"
              value={draft.currency}
              options={CURRENCY_OPTIONS}
              onChange={(e) => onChange({ currency: e.target.value })}
            />
          }
        />
        <SettingRow
          label="Date format"
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Date format"
              value={draft.date_format}
              options={DATE_FORMAT_OPTIONS}
              onChange={(e) => onChange({ date_format: e.target.value as AnalyticsDateFormat })}
            />
          }
        />
      </SettingsCard>
    </div>
  );
}

function MessagesSection({ draft, onChange }: SectionProps) {
  return (
    <SettingsCard
      title="Message Analytics"
      description="Choose which WhatsApp messaging events should be included in analytics."
    >
      <ToggleRow label="Track sent messages" value={draft.track_sent_messages} onChange={(v) => onChange({ track_sent_messages: v })} />
      <ToggleRow label="Track received messages" value={draft.track_received_messages} onChange={(v) => onChange({ track_received_messages: v })} />
      <ToggleRow label="Track delivered messages" value={draft.track_delivered_messages} onChange={(v) => onChange({ track_delivered_messages: v })} />
      <ToggleRow label="Track read messages" value={draft.track_read_messages} onChange={(v) => onChange({ track_read_messages: v })} />
      <ToggleRow label="Track failed messages" value={draft.track_failed_messages} onChange={(v) => onChange({ track_failed_messages: v })} />
      <ToggleRow label="Track deleted messages" value={draft.track_deleted_messages} onChange={(v) => onChange({ track_deleted_messages: v })} />
      <ToggleRow label="Track response time" value={draft.track_response_time} onChange={(v) => onChange({ track_response_time: v })} />
      <ToggleRow label="Track first response time" value={draft.track_first_response_time} onChange={(v) => onChange({ track_first_response_time: v })} />
      <ToggleRow label="Track message volume" value={draft.track_message_volume} onChange={(v) => onChange({ track_message_volume: v })} />
      <ToggleRow label="Track messages by agent" value={draft.track_messages_by_agent} onChange={(v) => onChange({ track_messages_by_agent: v })} />
      <ToggleRow label="Track messages by WhatsApp account" value={draft.track_messages_by_account} onChange={(v) => onChange({ track_messages_by_account: v })} />
      <ToggleRow label="Track messages by template" value={draft.track_messages_by_template} onChange={(v) => onChange({ track_messages_by_template: v })} />
      <ToggleRow
        label="Include automated messages"
        description="When off, bot/system/automation messages do not count toward normal agent message statistics."
        value={draft.include_automated_messages}
        onChange={(v) => onChange({ include_automated_messages: v })}
      />
      <ToggleRow
        label="Include internal/system events"
        value={draft.include_system_events}
        onChange={(v) => onChange({ include_system_events: v })}
      />
    </SettingsCard>
  );
}

function ConversationsSection({ draft, onChange }: SectionProps) {
  const statusCounts = draft.track_conversation_status_counts;
  return (
    <SettingsCard title="Conversation Analytics" description="Which conversation lifecycle events are tracked.">
      <ToggleRow
        label="Track conversations"
        description="Master switch for conversation analytics; when off, no conversation metrics are calculated."
        value={draft.track_conversations}
        onChange={(v) => onChange({ track_conversations: v })}
      />
      {draft.track_conversations && (
        <>
          <ToggleRow
            label="Track status counts"
            description="New, open, pending, resolved, closed and reopened conversation totals."
            value={statusCounts}
            onChange={(v) => onChange({ track_conversation_status_counts: v })}
          />
          <ToggleRow label="Track conversation duration" value={draft.track_conversation_duration} onChange={(v) => onChange({ track_conversation_duration: v })} />
          <ToggleRow label="Track resolution time" value={draft.track_resolution_time} onChange={(v) => onChange({ track_resolution_time: v })} />
          <ToggleRow label="Track assignment time" value={draft.track_assignment_time} onChange={(v) => onChange({ track_assignment_time: v })} />
          <ToggleRow label="Track SLA breaches" value={draft.track_sla_breaches} onChange={(v) => onChange({ track_sla_breaches: v })} />
          <p className="px-3 pb-1 text-xs text-muted">
            Unassigned-conversation totals are derived from assignment snapshots while status counts
            are tracked; they are never fabricated when tracking is off.
          </p>
        </>
      )}
    </SettingsCard>
  );
}

function ContactsSection({ draft, onChange }: SectionProps) {
  return (
    <div className="space-y-6">
      <SettingsCard title="Contact Tracking" description="Which contact events are included in analytics.">
        <ToggleRow label="Track new contacts" value={draft.track_contacts} onChange={(v) => onChange({ track_contacts: v })} />
        <ToggleRow label="Track contact source" value={draft.track_contact_source} onChange={(v) => onChange({ track_contact_source: v })} />
        <ToggleRow label="Track contact tags" value={draft.track_contact_tags} onChange={(v) => onChange({ track_contact_tags: v })} />
        <ToggleRow label="Track contact activity" value={draft.track_contact_activity} onChange={(v) => onChange({ track_contact_activity: v })} />
        <ToggleRow label="Track contact assignment" value={draft.track_contact_assignment} onChange={(v) => onChange({ track_contact_assignment: v })} />
      </SettingsCard>
      <SettingsCard title="Lead Tracking" description="Which lead and pipeline events are included in analytics.">
        <ToggleRow label="Track new leads" value={draft.track_leads} onChange={(v) => onChange({ track_leads: v })} />
        <ToggleRow label="Track lead source" value={draft.track_lead_source} onChange={(v) => onChange({ track_lead_source: v })} />
        <ToggleRow label="Track pipeline stage changes" value={draft.track_lead_stage_changes} onChange={(v) => onChange({ track_lead_stage_changes: v })} />
        <ToggleRow label="Track lead status changes" value={draft.track_lead_status_changes} onChange={(v) => onChange({ track_lead_status_changes: v })} />
        <ToggleRow label="Track assigned agent" value={draft.track_lead_assignment} onChange={(v) => onChange({ track_lead_assignment: v })} />
        <ToggleRow label="Track won leads" value={draft.track_won_leads} onChange={(v) => onChange({ track_won_leads: v })} />
        <ToggleRow label="Track lost leads" value={draft.track_lost_leads} onChange={(v) => onChange({ track_lost_leads: v })} />
        <ToggleRow label="Track lead conversion" value={draft.track_lead_conversion} onChange={(v) => onChange({ track_lead_conversion: v })} />
      </SettingsCard>
    </div>
  );
}

function AgentsSection({ draft, onChange }: SectionProps) {
  return (
    <SettingsCard title="Agent Performance" description="Agent-level productivity and SLA metrics.">
      <ToggleRow
        label="Enable agent performance analytics"
        value={draft.track_agent_performance}
        onChange={(v) => onChange({ track_agent_performance: v })}
      />
      {draft.track_agent_performance && (
        <>
          <ToggleRow label="Assigned conversations" value={draft.track_agent_assigned_conversations} onChange={(v) => onChange({ track_agent_assigned_conversations: v })} />
          <ToggleRow label="Conversations handled" value={draft.track_agent_conversations_handled} onChange={(v) => onChange({ track_agent_conversations_handled: v })} />
          <ToggleRow label="Conversations resolved" value={draft.track_agent_conversations_resolved} onChange={(v) => onChange({ track_agent_conversations_resolved: v })} />
          <ToggleRow label="First response time" value={draft.track_agent_first_response_time} onChange={(v) => onChange({ track_agent_first_response_time: v })} />
          <ToggleRow label="Average response time" value={draft.track_agent_avg_response_time} onChange={(v) => onChange({ track_agent_avg_response_time: v })} />
          <ToggleRow label="Average resolution time" value={draft.track_agent_resolution_time} onChange={(v) => onChange({ track_agent_resolution_time: v })} />
          <ToggleRow label="Messages sent" value={draft.track_agent_messages_sent} onChange={(v) => onChange({ track_agent_messages_sent: v })} />
          <ToggleRow label="Messages received" value={draft.track_agent_messages_received} onChange={(v) => onChange({ track_agent_messages_received: v })} />
          <ToggleRow label="Reopened conversations" value={draft.track_agent_reopened_conversations} onChange={(v) => onChange({ track_agent_reopened_conversations: v })} />
          <ToggleRow label="SLA performance" value={draft.track_agent_sla_performance} onChange={(v) => onChange({ track_agent_sla_performance: v })} />
          <ToggleRow label="Active conversation count" value={draft.track_agent_active_conversations} onChange={(v) => onChange({ track_agent_active_conversations: v })} />
          <ToggleRow
            label="Enable agent leaderboard"
            description="When enabled, authorized users can compare performance between agents."
            value={draft.agent_leaderboard_enabled}
            onChange={(v) => onChange({ agent_leaderboard_enabled: v })}
          />
          <SettingRow
            label="Performance visibility"
            description="An agent never sees another agent's private performance data unless their role explicitly has permission."
            control={
              <Select
                className="w-full sm:w-64"
                aria-label="Performance visibility"
                value={draft.agent_visibility}
                options={AGENT_VISIBILITY_OPTIONS}
                onChange={(e) => onChange({ agent_visibility: e.target.value as AgentVisibility })}
              />
            }
          />
        </>
      )}
    </SettingsCard>
  );
}

function AccountsSection({ draft, onChange }: SectionProps) {
  return (
    <div className="space-y-6">
      <SettingsCard
        title="WhatsApp Account Analytics"
        description="Only real data from actual WhatsApp sessions and message events is used. Accounts without real event data report zero/no data honestly."
      >
        <ToggleRow
          label="Track analytics by WhatsApp account"
          value={draft.track_account_analytics}
          onChange={(v) => onChange({ track_account_analytics: v })}
        />
        {draft.track_account_analytics && (
          <>
            <ToggleRow label="Messages" value={draft.track_account_messages} onChange={(v) => onChange({ track_account_messages: v })} />
            <ToggleRow label="Conversations" value={draft.track_account_conversations} onChange={(v) => onChange({ track_account_conversations: v })} />
            <ToggleRow label="Contacts" value={draft.track_account_contacts} onChange={(v) => onChange({ track_account_contacts: v })} />
            <ToggleRow label="Leads" value={draft.track_account_leads} onChange={(v) => onChange({ track_account_leads: v })} />
            <ToggleRow label="Delivery rate" value={draft.track_account_delivery_rate} onChange={(v) => onChange({ track_account_delivery_rate: v })} />
            <ToggleRow label="Read rate" value={draft.track_account_read_rate} onChange={(v) => onChange({ track_account_read_rate: v })} />
            <ToggleRow label="Failed messages" value={draft.track_account_failed_messages} onChange={(v) => onChange({ track_account_failed_messages: v })} />
            <ToggleRow label="Response time" value={draft.track_account_response_time} onChange={(v) => onChange({ track_account_response_time: v })} />
            <ToggleRow label="Templates" value={draft.track_account_templates} onChange={(v) => onChange({ track_account_templates: v })} />
            <ToggleRow label="Message volume" value={draft.track_account_message_volume} onChange={(v) => onChange({ track_account_message_volume: v })} />
            <ToggleRow
              label="Aggregate all accounts in workspace"
              description="When off, analytics require account-level filtering."
              value={draft.aggregate_accounts}
              onChange={(v) => onChange({ aggregate_accounts: v })}
            />
          </>
        )}
      </SettingsCard>
    </div>
  );
}

function TemplatesSection({ draft, onChange }: SectionProps) {
  return (
    <SettingsCard
      title="Message Template Analytics"
      description="Template usage and performance, filterable by template, account, agent and date range."
    >
      <ToggleRow label="Track template analytics" value={draft.track_template_analytics} onChange={(v) => onChange({ track_template_analytics: v })} />
      {draft.track_template_analytics && (
        <>
          <ToggleRow label="Track template usage" value={draft.track_template_usage} onChange={(v) => onChange({ track_template_usage: v })} />
          <ToggleRow label="Track sent count" value={draft.track_template_sent_count} onChange={(v) => onChange({ track_template_sent_count: v })} />
          <ToggleRow label="Track delivered count" value={draft.track_template_delivered_count} onChange={(v) => onChange({ track_template_delivered_count: v })} />
          <ToggleRow label="Track read count" value={draft.track_template_read_count} onChange={(v) => onChange({ track_template_read_count: v })} />
          <ToggleRow label="Track failed count" value={draft.track_template_failed_count} onChange={(v) => onChange({ track_template_failed_count: v })} />
          <ToggleRow label="Track reply count" value={draft.track_template_reply_count} onChange={(v) => onChange({ track_template_reply_count: v })} />
          <ToggleRow label="Track performance by account" value={draft.track_template_by_account} onChange={(v) => onChange({ track_template_by_account: v })} />
          <ToggleRow label="Track performance by agent" value={draft.track_template_by_agent} onChange={(v) => onChange({ track_template_by_agent: v })} />
        </>
      )}
    </SettingsCard>
  );
}

function RulesSection({ draft, onChange }: SectionProps) {
  return (
    <SettingsCard
      title="Tracking Rules"
      description="Defines exactly how metrics are calculated from real message and conversation events."
    >
      <SettingRow
        label="Conversation start rule"
        description="Which message opens a conversation for analytics purposes."
        control={
          <Select
            className="w-full sm:w-72"
            aria-label="Conversation start rule"
            value={draft.conversation_start_rule}
            options={START_RULE_OPTIONS}
            onChange={(e) => onChange({ conversation_start_rule: e.target.value as ConversationStartRule })}
          />
        }
      />
      <SettingRow
        label="Conversation resolution rule"
        control={
          <Select
            className="w-full sm:w-72"
            aria-label="Conversation resolution rule"
            value={draft.conversation_resolution_rule}
            options={RESOLUTION_RULE_OPTIONS}
            onChange={(e) => onChange({ conversation_resolution_rule: e.target.value as ConversationResolutionRule })}
          />
        }
      />
      <ToggleRow
        label="Bot responses count as responses"
        description="Response time = time between an inbound customer message and the next valid agent response. Choose whether automated/bot replies count."
        value={draft.bot_reply_counts_as_response}
        onChange={(v) => onChange({ bot_reply_counts_as_response: v })}
      />
      <SettingRow
        label="Deleted messages"
        control={
          <Select
            className="w-full sm:w-64"
            aria-label="Deleted messages rule"
            value={draft.deleted_messages_rule}
            options={DELETED_MESSAGES_OPTIONS}
            onChange={(e) => onChange({ deleted_messages_rule: e.target.value as DeletedMessagesRule })}
          />
        }
      />
      <ToggleRow
        label="Include imported messages in analytics"
        value={draft.include_imported_messages}
        onChange={(v) => onChange({ include_imported_messages: v })}
      />
      <ToggleRow
        label="Count internal notes as agent activity"
        description="Internal notes never count as WhatsApp sent messages."
        value={draft.count_internal_notes}
        onChange={(v) => onChange({ count_internal_notes: v })}
      />
    </SettingsCard>
  );
}

function RetentionSection({ draft, onChange }: SectionProps) {
  return (
    <SettingsCard
      title="Analytics Data Retention"
      description="Control how long analytics-related information is stored. Raw event data may expire earlier than aggregated metrics. Changes apply only after saving, through the backend retention process."
    >
      <SettingRow
        label="Raw event retention"
        description="How long raw event data is kept."
        control={
          <Select
            className="w-full sm:w-44"
            aria-label="Raw event retention"
            value={String(draft.raw_event_retention_days)}
            options={RAW_RETENTION_OPTIONS}
            onChange={(e) => onChange({ raw_event_retention_days: Number(e.target.value) as RawEventRetentionDays })}
          />
        }
      />
      <SettingRow
        label="Aggregated analytics retention"
        description="How long daily/monthly aggregated metrics are kept."
        control={
          <Select
            className="w-full sm:w-44"
            aria-label="Aggregated analytics retention"
            value={String(draft.aggregate_retention_days)}
            options={AGGREGATE_RETENTION_OPTIONS}
            onChange={(e) => onChange({ aggregate_retention_days: Number(e.target.value) as AggregateRetentionDays })}
          />
        }
      />
      <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-text">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        Reducing a retention period may permanently delete analytics data older than the selected
        period once saved. This action may not be reversible.
      </p>
    </SettingsCard>
  );
}

const ANALYTICS_PERMISSIONS = [
  { key: "analytics.view", description: "View workspace analytics dashboards and reports." },
  { key: "analytics.view_workspace", description: "View all analytics for the workspace." },
  { key: "analytics.view_agents", description: "View agent performance analytics for others." },
  { key: "analytics.view_accounts", description: "View per-account analytics." },
  { key: "analytics.view_contacts", description: "View contact analytics." },
  { key: "analytics.view_leads", description: "View lead analytics." },
  { key: "analytics.export", description: "Export analytics data." },
  { key: "analytics.manage_settings", description: "Change analytics settings (workspace admins)." },
] as const;

function PermissionsSection({ draft }: SectionProps) {
  return (
    <div className="space-y-6">
      <SettingsCard
        title="Analytics Access & Permissions"
        description="Integrates with the workspace Roles & Permissions system. Backend authorization always enforces these; hiding UI alone is never relied upon."
      >
        <SettingRow
          label="Analytics settings management"
          description="Only roles with workspace.settings.manage can read or change this page; the API enforces it on every request."
          control={<span className="text-xs font-medium text-muted">workspace.settings.manage</span>}
        />
        <SettingRow
          label="Agent visibility"
          description="Who can see agent performance data."
          control={
            <Select
              className="w-full sm:w-64"
              aria-label="Performance visibility"
              value={draft.agent_visibility}
              options={AGENT_VISIBILITY_OPTIONS}
              disabled
            />
          }
        />
        <p className="px-3 pb-1 text-xs text-muted">
          Agent visibility is configured on the Agents tab. Super Admins always have full access;
          workspace admins get workspace analytics and settings; managers get viewing access based
          on granted permissions; agents only get their own analytics if permission is granted.
        </p>
      </SettingsCard>
      <SettingsCard title="Permission catalog" description="Permission keys governing analytics access. Manage them in Roles.">
        <ul className="space-y-2">
          {ANALYTICS_PERMISSIONS.map((permission) => (
            <li key={permission.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-bg/70">
              <code className="rounded bg-bg px-1.5 py-0.5 text-xs text-text">{permission.key}</code>
              <span className="text-xs text-muted">{permission.description}</span>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}

function ExportSection({ draft, onChange }: SectionProps) {
  return (
    <div className="space-y-6">
      <SettingsCard title="Export & Reports" description="Which export formats users with analytics.export can use.">
        <ToggleRow label="Allow CSV export" value={draft.allow_csv_export} onChange={(v) => onChange({ allow_csv_export: v })} />
        <ToggleRow label="Allow Excel export" value={draft.allow_excel_export} onChange={(v) => onChange({ allow_excel_export: v })} />
        <ToggleRow label="Allow PDF export" value={draft.allow_pdf_export} onChange={(v) => onChange({ allow_pdf_export: v })} />
        <ToggleRow
          label="Export contact personal information"
          description="When off, sensitive contact fields are masked or excluded in exports."
          value={draft.allow_personal_data_export}
          onChange={(v) => onChange({ allow_personal_data_export: v })}
        />
        <SettingRow
          label="Maximum export date range"
          control={
            <Select
              className="w-full sm:w-44"
              aria-label="Maximum export date range"
              value={String(draft.max_export_range_days)}
              options={EXPORT_RANGE_OPTIONS}
              onChange={(e) => onChange({ max_export_range_days: Number(e.target.value) as MaxExportRangeDays })}
            />
          }
        />
      </SettingsCard>
      <SettingsCard title="Scheduled Reports" description="Automatically delivered recurring report emails.">
        <div className="flex flex-wrap gap-2">
          {["Daily", "Weekly", "Monthly"].map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs text-muted">
              {label}
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Coming Soon</span>
            </span>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
