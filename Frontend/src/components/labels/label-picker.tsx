"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { useLabelList, useEntityLabels } from "@/hooks/use-labels";
import type { LabelEntityType } from "@/lib/labels-api";
import type { LabelSummary } from "@/lib/conversations-api";
import { LabelBadge } from "@/components/labels/label-badge";

/**
 * Attach/detach control for a single record (contact/lead/deal/conversation).
 * Shows the record's current labels as removable badges plus a dropdown of the
 * remaining workspace labels to attach.
 */
export function LabelPicker({
  entity,
  entityId,
  currentLabels = [],
  canEdit,
}: {
  entity: LabelEntityType;
  entityId: number;
  currentLabels?: LabelSummary[];
  canEdit: boolean;
}) {
  const { data: allLabels } = useLabelList();
  const { attach, detach } = useEntityLabels(entity, entityId);
  const [open, setOpen] = useState(false);

  const currentIds = new Set(currentLabels.map((l) => l.id));
  const available = (allLabels ?? []).filter((l) => !currentIds.has(l.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {currentLabels.length === 0 && <span className="text-xs text-muted">No labels</span>}
        {currentLabels.map((label) => (
          <LabelBadge
            key={label.id}
            label={label}
            onRemove={canEdit ? () => detach.mutate(label.id) : undefined}
          />
        ))}
      </div>

      {canEdit && (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-primary-soft/50 hover:text-text"
          >
            <Tag className="h-3.5 w-3.5" />
            Add label
          </button>

          {open && (
            <div className="absolute z-10 mt-1 w-48 rounded-md border border-border bg-surface p-1 shadow-lg">
              {available.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted">No more labels to add.</p>
              )}
              {available.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => {
                    attach.mutate(label.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-primary-soft/50"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: label.color_hex || "#6366F1" }}
                  />
                  {label.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
