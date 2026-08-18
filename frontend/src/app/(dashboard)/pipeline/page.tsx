"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePipelineList } from "@/hooks/use-pipelines";
import { usePipelineBoard, useMoveDealStage } from "@/hooks/use-deals";
import type { BoardDeal } from "@/lib/pipelines-api";
import { ErrorState } from "@/components/ui/error-state";
import { NewDealModal } from "@/components/deals/new-deal-modal";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function DealCard({
  deal,
  currentStageId,
  stages,
  onMove,
  pending,
}: {
  deal: BoardDeal;
  currentStageId: number;
  stages: { id: number; name: string }[];
  onMove: (stageId: number) => void;
  pending: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(deal.id));
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      className={`cursor-grab rounded-md border border-border bg-bg p-3 text-sm shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Link href={`/deals/${deal.id}`} className="font-medium text-primary hover:underline">
        {deal.title}
      </Link>
      <p className="mt-1 text-xs text-muted">{deal.contact?.full_name || "No contact"}</p>
      <p className="mt-1 font-semibold text-text">
        {formatMoney(Number(deal.value_amount ?? 0), deal.value_currency)}
      </p>
      <div className="mt-2">
        <label className="sr-only" htmlFor={`move-${deal.id}`}>
          Move to stage
        </label>
        <select
          id={`move-${deal.id}`}
          value={currentStageId}
          disabled={pending}
          onChange={(e) => onMove(Number(e.target.value))}
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              Move to: {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PipelineBoard() {
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelineList();
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);

  const defaultPipeline = pipelines && pipelines.length > 0
    ? pipelines.find((p) => p.is_default) ?? pipelines[0]
    : null;
  const pipelineId = selectedPipelineId ?? defaultPipeline?.id ?? null;

  const { data: board, isLoading: boardLoading, isError, refetch } = usePipelineBoard(pipelineId ?? 0);
  const moveMutation = useMoveDealStage(pipelineId ?? 0);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);

  const stageOptions = board?.stages.map((s) => ({ id: s.id, name: s.name })) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Pipeline</h1>
        <div className="flex items-center gap-3">
          {pipelines && pipelines.length > 1 && (
            <select
              value={pipelineId ?? ""}
              onChange={(e) => setSelectedPipelineId(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!pipelineId || stageOptions.length === 0}
            onClick={() => setShowNewDeal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New deal
          </button>
        </div>
      </div>

      {showNewDeal && pipelineId && (
        <NewDealModal pipelineId={pipelineId} stages={stageOptions} onClose={() => setShowNewDeal(false)} />
      )}

      {(pipelinesLoading || boardLoading) && (
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 w-64 shrink-0 animate-pulse rounded-lg bg-border/60" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState message="Unable to load the pipeline board." onRetry={() => refetch()} />
      )}

      {board && (
        <>
          <p className="text-sm text-muted">
            Overall open value: <span className="font-semibold text-text">{formatMoney(board.overall_total, "USD")}</span>
          </p>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {board.stages.map((stage) => (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                }}
                onDragLeave={() => {
                  if (dragOverStageId === stage.id) setDragOverStageId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStageId(null);
                  const dealId = Number(e.dataTransfer.getData("text/plain"));
                  if (!Number.isFinite(dealId) || dealId <= 0) return;
                  const currentStage = board.stages.find((s) =>
                    s.deals.some((d) => d.id === dealId)
                  );
                  if (currentStage && currentStage.id === stage.id) return;
                  moveMutation.mutate({ dealId, stageId: stage.id });
                }}
                className={`flex w-72 shrink-0 flex-col rounded-lg border bg-surface transition-shadow ${
                  dragOverStageId === stage.id
                    ? "border-primary/60 ring-2 ring-primary/40"
                    : "border-border"
                }`}
              >
                <div className="border-b border-border p-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-text">{stage.name}</h2>
                    <span className="text-xs text-muted">{stage.deal_count}</span>
                  </div>
                  <p className="text-xs text-muted">{formatMoney(stage.total_value, "USD")}</p>
                </div>
                <div className="flex-1 space-y-2 p-3">
                  {stage.deals.length === 0 && (
                    <p className="text-xs text-muted">No deals in this stage.</p>
                  )}
                  {stage.deals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      currentStageId={stage.id}
                      stages={stageOptions}
                      pending={moveMutation.isPending}
                      onMove={(stageId) => {
                        if (stageId === stage.id) return;
                        moveMutation.mutate({ dealId: deal.id, stageId });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <RequirePermission permission="deals.manage">
      <PipelineBoard />
    </RequirePermission>
  );
}
