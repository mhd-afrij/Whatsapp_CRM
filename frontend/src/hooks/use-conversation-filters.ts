import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type {
  ConversationFilters,
  ConversationPriority,
  ConversationStatus,
} from "@/lib/conversations-api";

export type TabFilter = "all" | "mine" | "unassigned" | "unread" | "waiting" | "sla_risk" | "sla_breach" | "archived";

export interface AdvancedFilters {
  agent?: string;
  team?: string;
  status?: string;
  priority?: string;
  label?: string;
  dealStage?: string;
  dateRange?: { from: Date; to: Date };
  whatsappAccountId?: number;
}

export function useConversationFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});

  // Initialize from URL params, re-parsing whenever the URL changes (render-time
  // state adjustment per react.dev/learn/you-might-not-need-an-effect - no
  // cascading setState inside an effect body).
  const [syncedParams, setSyncedParams] = useState<string | null>(null);
  const serializedParams = searchParams?.toString() ?? null;

  if (serializedParams !== null && serializedParams !== syncedParams) {
    setSyncedParams(serializedParams);

    const tab = (searchParams.get("tab") as TabFilter) || "all";
    setTabFilter(tab);

    // Parse advanced filters from URL
    const advanced: AdvancedFilters = {};
    if (searchParams.has("agent")) advanced.agent = searchParams.get("agent") ?? undefined;
    if (searchParams.has("team")) advanced.team = searchParams.get("team") ?? undefined;
    if (searchParams.has("status")) advanced.status = searchParams.get("status") ?? undefined;
    if (searchParams.has("priority")) advanced.priority = searchParams.get("priority") ?? undefined;
    if (searchParams.has("label")) advanced.label = searchParams.get("label") ?? undefined;
    if (searchParams.has("dealStage")) advanced.dealStage = searchParams.get("dealStage") ?? undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        advanced.dateRange = { from, to };
      }
    }
    const waAccountId = searchParams.get("whatsappAccountId");
    if (waAccountId) advanced.whatsappAccountId = parseInt(waAccountId, 10);

    setAdvancedFilters(advanced);
  }

  const syncToUrl = (tab: TabFilter, filters: AdvancedFilters) => {
    const params = new URLSearchParams();
    params.set("tab", tab);

    if (filters.agent) params.set("agent", filters.agent);
    if (filters.team) params.set("team", filters.team);
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.label) params.set("label", filters.label);
    if (filters.dealStage) params.set("dealStage", filters.dealStage);
    if (filters.dateRange) {
      params.set("dateFrom", filters.dateRange.from.toISOString());
      params.set("dateTo", filters.dateRange.to.toISOString());
    }
    if (filters.whatsappAccountId) params.set("whatsappAccountId", String(filters.whatsappAccountId));

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const setTab = (tab: TabFilter) => {
    setTabFilter(tab);
    syncToUrl(tab, advancedFilters);
  };

  const setAdvanced = (filters: AdvancedFilters) => {
    setAdvancedFilters(filters);
    syncToUrl(tabFilter, filters);
  };

  const clearAdvanced = () => {
    setAdvancedFilters({});
    syncToUrl(tabFilter, {});
  };

  // Convert tab + advanced filters to API query
  const apiFilters: ConversationFilters = {
    ...(advancedFilters.agent && { assigned_to: advancedFilters.agent }),
    ...(advancedFilters.status && {
      status: advancedFilters.status as ConversationStatus,
    }),
    ...(advancedFilters.priority && {
      priority: advancedFilters.priority as ConversationPriority,
    }),
    ...(advancedFilters.label && { label: advancedFilters.label }),
    ...(advancedFilters.team && { team_id: parseInt(advancedFilters.team) || undefined }),
    ...(advancedFilters.whatsappAccountId && { whatsapp_account_id: advancedFilters.whatsappAccountId }),
    ...(advancedFilters.dealStage && { deal_stage: advancedFilters.dealStage }),
    ...(advancedFilters.dateRange && {
      date_from: advancedFilters.dateRange.from.toISOString(),
      date_to: advancedFilters.dateRange.to.toISOString(),
    }),
    ...(tabFilter === "mine" && { assigned_to: "me" }),
    ...(tabFilter === "unassigned" && { assigned_to: "unassigned" }),
    ...(tabFilter === "unread" && { unread: true }),
    ...(tabFilter === "waiting" && { status: "pending" }),
    ...(tabFilter === "archived" && { archived: true }),
    ...(tabFilter === "sla_risk" && { sla_status: "risk" }),
    ...(tabFilter === "sla_breach" && { sla_status: "breached" }),
  };

  return {
    tabFilter,
    advancedFilters,
    apiFilters,
    setTab,
    setAdvanced,
    clearAdvanced,
  };
}
