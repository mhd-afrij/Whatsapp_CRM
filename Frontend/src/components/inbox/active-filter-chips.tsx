import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AdvancedFilters } from "@/hooks/use-conversation-filters";

interface ActiveFilterChipsProps {
  filters: AdvancedFilters;
  onRemove: (key: keyof AdvancedFilters) => void;
  onClear: () => void;
}

export function ActiveFilterChips({ filters, onRemove, onClear }: ActiveFilterChipsProps) {
  const activeCount = Object.values(filters).filter((v) => v !== undefined).length;

  if (activeCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
      {filters.agent && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span>Agent: {filters.agent}</span>
          <button
            onClick={() => onRemove("agent")}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.team && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span>Team: {filters.team}</span>
          <button
            onClick={() => onRemove("team")}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.status && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span>Status: {filters.status}</span>
          <button
            onClick={() => onRemove("status")}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.priority && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span>Priority: {filters.priority}</span>
          <button
            onClick={() => onRemove("priority")}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.label && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span>Label: {filters.label}</span>
          <button
            onClick={() => onRemove("label")}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.dateRange && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 pr-1"
        >
          <span>
            Activity: {filters.dateRange.from.toLocaleDateString()} – {filters.dateRange.to.toLocaleDateString()}
          </span>
          <button
            onClick={() => onRemove("dateRange")}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {activeCount > 0 && (
        <button
          onClick={onClear}
          className="text-xs text-muted hover:text-text font-medium ml-auto"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
