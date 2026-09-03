"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  return (
    <div className="border-border bg-bg rounded-md border p-3 text-sm shadow-sm">
      <Link href={`/deals/${deal.id}`} className="text-primary font-medium hover:underline">
        {deal.title}
      </Link>
      <p className="text-muted mt-1 text-xs">{deal.contact?.full_name || "No contact"}</p>
      <p className="text-text mt-1 font-semibold">
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
          className="border-border bg-surface text-text w-full rounded-md border px-2 py-1 text-xs"
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

function SortableDealCard({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={isDragging ? "cursor-grabbing opacity-30" : "cursor-grab"}
    >
      <DealCard
        deal={deal}
        currentStageId={currentStageId}
        stages={stages}
        onMove={onMove}
        pending={pending}
      />
    </div>
  );
}

function StageDropZone({ stageId, children }: { stageId: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stageId}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 space-y-2 rounded-lg p-3 transition-colors ${
        isOver ? "bg-primary-soft/20 ring-primary/40 ring-2" : ""
      }`}
    >
      {children}
    </div>
  );
}

function PipelineBoard() {
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelineList();
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);

  const defaultPipeline =
    pipelines && pipelines.length > 0
      ? (pipelines.find((p) => p.is_default) ?? pipelines[0])
      : null;
  const pipelineId = selectedPipelineId ?? defaultPipeline?.id ?? null;

  const {
    data: board,
    isLoading: boardLoading,
    isError,
    refetch,
  } = usePipelineBoard(pipelineId ?? 0);
  const moveMutation = useMoveDealStage();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [activeDeal, setActiveDeal] = useState<BoardDeal | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const stageOptions = board?.stages.map((s) => ({ id: s.id, name: s.name })) ?? [];

  const dealStageMap = useMemo(() => {
    const map = new Map<number, number>();
    board?.stages.forEach((stage) => stage.deals.forEach((deal) => map.set(deal.id, stage.id)));
    return map;
  }, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    const deal =
      board?.stages.flatMap((stage) => stage.deals).find((d) => d.id === event.active.id) ?? null;
    setActiveDeal(deal);
  };
  const handleDragCancel = () => setActiveDeal(null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over || !board) return;
    const currentStageId = dealStageMap.get(active.id as number);
    if (currentStageId === undefined) return;
    let targetStageId: number | undefined;
    if (typeof over.id === "string" && over.id.startsWith("stage:")) {
      targetStageId = Number(over.id.slice("stage:".length));
    } else if (typeof over.id === "number") {
      targetStageId = dealStageMap.get(over.id);
    }
    if (targetStageId === undefined || targetStageId === currentStageId) return;
    moveMutation.mutate({ dealId: active.id as number, stageId: targetStageId });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-text text-2xl font-semibold">Pipeline</h1>
        <div className="flex items-center gap-3">
          {pipelines && pipelines.length > 1 && (
            <select
              value={pipelineId ?? ""}
              onChange={(e) => setSelectedPipelineId(Number(e.target.value))}
              className="border-border bg-surface text-text rounded-md border px-3 py-2 text-sm"
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
            className="bg-primary hover:bg-primary-dark inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New deal
          </button>
        </div>
      </div>

      {showNewDeal && pipelineId && (
        <NewDealModal
          pipelineId={pipelineId}
          stages={stageOptions}
          onClose={() => setShowNewDeal(false)}
        />
      )}

      {(pipelinesLoading || boardLoading) && (
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-border/60 h-64 w-64 shrink-0 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState message="Unable to load the pipeline board." onRetry={() => refetch()} />
      )}

      {board && (
        <>
          <p className="text-muted text-sm">
            Overall open value:{" "}
            <span className="text-text font-semibold">
              {formatMoney(board.overall_total, "USD")}
            </span>
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {board.stages.map((stage) => (
                <div
                  key={stage.id}
                  className="border-border bg-surface flex w-72 shrink-0 flex-col rounded-lg border"
                >
                  <div className="border-border border-b p-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-text text-sm font-semibold">{stage.name}</h2>
                      <span className="text-muted text-xs">{stage.deal_count}</span>
                    </div>
                    <p className="text-muted text-xs">{formatMoney(stage.total_value, "USD")}</p>
                  </div>
                  <StageDropZone stageId={stage.id}>
                    <SortableContext
                      items={stage.deals.map((deal) => deal.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {stage.deals.map((deal) => (
                        <SortableDealCard
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
                    </SortableContext>
                    {stage.deals.length === 0 && (
                      <p className="text-muted text-xs">No deals in this stage.</p>
                    )}
                  </StageDropZone>
                </div>
              ))}
            </div>
            <DragOverlay>
              {activeDeal ? (
                <div className="pointer-events-none cursor-grabbing">
                  <DealCard
                    deal={activeDeal}
                    currentStageId={dealStageMap.get(activeDeal.id) ?? 0}
                    stages={stageOptions}
                    pending={false}
                    onMove={() => undefined}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
