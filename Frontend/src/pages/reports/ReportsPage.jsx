import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { authFetch } from "../../store/index.js";
import { EmptyState } from "../../components/common/EmptyState.jsx";

export default function ReportsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports"],
    queryFn: () => authFetch("/reports"),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>
        <p className="text-sm text-text-muted mt-1">Analytics and insights for your workspace.</p>
      </div>

      {isLoading && <div className="h-64 rounded-[10px] bg-surface border border-border-muted animate-pulse" />}
      {isError && <EmptyState icon={BarChart3} title="Couldn't load reports" description="You may not have the analytics.view permission." />}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">Total Conversations</p>
            <p className="text-2xl font-semibold text-text-primary">{data.conversations?.total ?? 0}</p>
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">Open Conversations</p>
            <p className="text-2xl font-semibold text-text-primary">{data.conversations?.open ?? 0}</p>
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">Total Messages</p>
            <p className="text-2xl font-semibold text-text-primary">{data.messages?.total ?? 0}</p>
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <p className="text-xs text-text-muted mb-2">Resolution Rate</p>
            <p className="text-2xl font-semibold text-text-primary">{data.conversations?.resolution_rate ?? 0}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
