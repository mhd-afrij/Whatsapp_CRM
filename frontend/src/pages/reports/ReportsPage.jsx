import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download } from "lucide-react";
import { reportService } from "../../services/reportService.js";
import { DateRangePicker } from "../../components/common/DateRangePicker.jsx";
import { EmptyState } from "../../components/common/EmptyState.jsx";
import { Button } from "../../components/common/Button.jsx";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const STAGE_COLORS = { new: "#25d366", contacted: "#0ea5e9", qualified: "#8b5cf6", proposal: "#f59e0b", won: "#10b981", lost: "#ef4444" };

export default function ReportsPage() {
  const [tab, setTab] = useState("overview");
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const overviewQuery = useQuery({
    queryKey: ["reports", "overview", dateRange],
    queryFn: () => reportService.getOverview(dateRange.from, dateRange.to),
  });

  const agentQuery = useQuery({
    queryKey: ["reports", "agents", dateRange],
    queryFn: () => reportService.getAgentReport(dateRange.from, dateRange.to),
    enabled: tab === "agents",
  });

  const contactQuery = useQuery({
    queryKey: ["reports", "contacts", dateRange],
    queryFn: () => reportService.getContactGrowth(dateRange.from, dateRange.to),
    enabled: tab === "contacts",
  });

  const leadQuery = useQuery({
    queryKey: ["reports", "leads", dateRange],
    queryFn: () => reportService.getLeadConversion(dateRange.from, dateRange.to),
    enabled: tab === "leads",
  });

  const messageQuery = useQuery({
    queryKey: ["reports", "messages", dateRange],
    queryFn: () => reportService.getMessageAnalytics(dateRange.from, dateRange.to),
    enabled: tab === "messages",
  });

  const overview = overviewQuery.data;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "agents", label: "Agents" },
    { id: "contacts", label: "Contacts" },
    { id: "leads", label: "Leads" },
    { id: "messages", label: "Messages" },
  ];

  const tabContent = {
    overview: (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Conversations", value: overview?.conversations?.total ?? 0 },
            { label: "Open", value: overview?.conversations?.open ?? 0 },
            { label: "Resolution Rate", value: `${overview?.conversations?.resolution_rate ?? 0}%` },
            { label: "Total Messages", value: overview?.messages?.total ?? 0 },
            { label: "Leads Won", value: overview?.leads?.won ?? 0 },
            { label: "Win Rate", value: `${overview?.leads?.win_rate ?? 0}%` },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-4">
              <p className="text-xs text-text-muted mb-1">{kpi.label}</p>
              <p className="text-xl font-semibold text-text-primary">{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>
    ),

    agents: (
      <div className="rounded-[10px] border border-border overflow-hidden">
        {agentQuery.isLoading ? (
          <div className="h-48 animate-pulse bg-surface" />
        ) : agentQuery.data && agentQuery.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Agent</th>
                <th className="text-right font-medium px-4 py-3">Conversations</th>
                <th className="text-right font-medium px-4 py-3">Resolved</th>
                <th className="text-right font-medium px-4 py-3">Messages Sent</th>
                <th className="text-right font-medium px-4 py-3">Tasks Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {agentQuery.data.map((a) => (
                <tr key={a.agent_id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium text-text-primary">{a.name}</td>
                  <td className="px-4 py-3 text-right">{a.conversations_handled}</td>
                  <td className="px-4 py-3 text-right">{a.conversations_resolved}</td>
                  <td className="px-4 py-3 text-right">{a.messages_sent}</td>
                  <td className="px-4 py-3 text-right">{a.tasks_completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No agent data" description="No agent performance data available for this period." />
        )}
      </div>
    ),

    contacts: (
      <div className="space-y-4">
        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-4">Contact Growth</p>
          {contactQuery.isLoading ? (
            <div className="h-48 animate-pulse bg-surface-raised rounded" />
          ) : contactQuery.data?.daily?.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={contactQuery.data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" name="New contacts" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No data" description="No contact growth data available." />
          )}
          <p className="text-xs text-text-muted mt-2">Total contacts: {contactQuery.data?.total ?? 0}</p>
        </div>
      </div>
    ),

    leads: (
      <div className="space-y-4">
        {leadQuery.data && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Leads", value: leadQuery.data.summary?.total ?? 0 },
              { label: "Active", value: leadQuery.data.summary?.active ?? 0 },
              { label: "Won", value: leadQuery.data.summary?.won ?? 0 },
              { label: "Win Rate", value: `${leadQuery.data.summary?.win_rate ?? 0}%` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-[10px] border border-border bg-surface p-4">
                <p className="text-xs text-text-muted mb-1">{kpi.label}</p>
                <p className="text-xl font-semibold text-text-primary">{kpi.value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-[10px] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text-primary mb-4">Lead Conversion by Stage</p>
          {leadQuery.isLoading ? (
            <div className="h-48 animate-pulse bg-surface-raised rounded" />
          ) : leadQuery.data?.stages?.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadQuery.data.stages}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {leadQuery.data.stages.map((s) => (
                      <Cell key={s.stage} fill={STAGE_COLORS[s.stage] ?? "#718087"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No leads" description="No lead data available." />
          )}
        </div>
      </div>
    ),

    messages: (
      <div className="space-y-4">
        {messageQuery.data && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-[10px] border border-border bg-surface p-4">
              <p className="text-xs text-text-muted mb-1">Incoming</p>
              <p className="text-xl font-semibold text-green-600">{messageQuery.data.incoming}</p>
            </div>
            <div className="rounded-[10px] border border-border bg-surface p-4">
              <p className="text-xs text-text-muted mb-1">Outgoing</p>
              <p className="text-xl font-semibold text-blue-600">{messageQuery.data.outgoing}</p>
            </div>
            <div className="rounded-[10px] border border-border bg-surface p-4">
              <p className="text-xs text-text-muted mb-1">Total</p>
              <p className="text-xl font-semibold text-text-primary">{messageQuery.data.total}</p>
            </div>
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-sm font-medium text-text-primary mb-4">By Hour of Day</p>
            {messageQuery.isLoading ? (
              <div className="h-48 animate-pulse bg-surface-raised rounded" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={messageQuery.data?.by_hour ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-sm font-medium text-text-primary mb-4">By Day of Week</p>
            {messageQuery.isLoading ? (
              <div className="h-48 animate-pulse bg-surface-raised rounded" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={messageQuery.data?.by_day_of_week ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>
          <p className="text-sm text-text-muted mt-1">Analytics and insights for your workspace.</p>
        </div>
        <Button variant="secondary" onClick={() => reportService.exportCsv(tab, dateRange.from, dateRange.to)}>
          <Download size={15} className="mr-1.5" /> Export CSV
        </Button>
      </div>

      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} className="mb-4" />

      <div className="flex gap-0 border-b border-border mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overviewQuery.isLoading ? (
        <div className="h-64 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
      ) : overviewQuery.isError ? (
        <EmptyState icon={BarChart3} title="Couldn't load reports" description="You may not have the analytics.view permission." />
      ) : (
        tabContent[tab]
      )}
    </div>
  );
}
