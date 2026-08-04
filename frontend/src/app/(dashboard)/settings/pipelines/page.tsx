"use client";

import { useState } from "react";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  usePipelineList,
  useCreatePipeline,
  useCreateStage,
  useUpdateStage,
  useDeleteStage,
  useDeletePipeline,
} from "@/hooks/use-pipelines";
import { ApiError } from "@/lib/api-client";
import type { Pipeline } from "@/lib/pipelines-api";
import { ErrorState } from "@/components/ui/error-state";

function StageRow({ pipeline, stageId, name, position, isWon, isLost }: {
  pipeline: Pipeline;
  stageId: number;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}) {
  const updateStage = useUpdateStage(pipeline.id);
  const deleteStage = useDeleteStage(pipeline.id);
  const [error, setError] = useState<string | null>(null);

  const onRename = async (newName: string) => {
    if (!newName.trim() || newName === name) return;
    try {
      await updateStage.mutateAsync({ stageId, values: { name: newName.trim() } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to rename stage.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Remove stage "${name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteStage.mutateAsync(stageId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete stage.");
    }
  };

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-bg px-3 py-2">
      <span className="w-6 shrink-0 text-xs text-muted">#{position}</span>
      <input
        defaultValue={name}
        onBlur={(e) => onRename(e.target.value)}
        aria-label={`Stage name (${name})`}
        className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-text hover:border-border focus:border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      />
      {isWon && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Won</span>}
      {isLost && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Lost</span>}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteStage.isPending}
        className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
      >
        Remove
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </li>
  );
}

function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
  const createStage = useCreateStage(pipeline.id);
  const deletePipeline = useDeletePipeline();
  const [newStageName, setNewStageName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onAddStage = async () => {
    if (!newStageName.trim()) return;
    setError(null);
    try {
      await createStage.mutateAsync({ name: newStageName.trim() });
      setNewStageName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to add stage.");
    }
  };

  const onDeletePipeline = async () => {
    if (
      !window.confirm(
        `Delete pipeline "${pipeline.name}"? All of its stages will be removed. This cannot be undone.`
      )
    )
      return;
    setError(null);
    try {
      await deletePipeline.mutateAsync(pipeline.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete pipeline.");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">{pipeline.name}</h2>
          {pipeline.is_default && <p className="text-xs text-muted">Default pipeline</p>}
        </div>
        <button
          type="button"
          onClick={onDeletePipeline}
          disabled={deletePipeline.isPending}
          className="rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          Delete pipeline
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      <ul className="space-y-2">
        {[...pipeline.stages]
          .sort((a, b) => a.position - b.position)
          .map((stage) => (
            <StageRow
              key={stage.id}
              pipeline={pipeline}
              stageId={stage.id}
              name={stage.name}
              position={stage.position}
              isWon={stage.is_won_stage}
              isLost={stage.is_lost_stage}
            />
          ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <input
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          placeholder="New stage name"
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
        <button
          type="button"
          onClick={onAddStage}
          disabled={createStage.isPending}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Add stage
        </button>
      </div>
    </div>
  );
}

function PipelineSettings() {
  const { data: pipelines, isLoading, isError, refetch } = usePipelineList();
  const createPipeline = useCreatePipeline();
  const [newPipelineName, setNewPipelineName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreatePipeline = async () => {
    if (!newPipelineName.trim()) return;
    setError(null);
    try {
      await createPipeline.mutateAsync({ name: newPipelineName.trim() });
      setNewPipelineName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create pipeline.");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text">Pipelines</h1>

      <div className="flex gap-2">
        <input
          value={newPipelineName}
          onChange={(e) => setNewPipelineName(e.target.value)}
          placeholder="New pipeline name"
          className="flex-1 max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted"
        />
        <button
          type="button"
          onClick={onCreatePipeline}
          disabled={createPipeline.isPending}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          Create pipeline
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {isLoading && <p className="text-sm text-muted">Loading pipelines…</p>}
      {isError && (
        <ErrorState message="Unable to load pipelines." onRetry={() => refetch()} />
      )}

      <div className="space-y-4">
        {pipelines?.map((pipeline) => (
          <PipelineCard key={pipeline.id} pipeline={pipeline} />
        ))}
      </div>
    </div>
  );
}

export default function PipelineSettingsPage() {
  return (
    <RequirePermission permission="pipelines.manage">
      <PipelineSettings />
    </RequirePermission>
  );
}
