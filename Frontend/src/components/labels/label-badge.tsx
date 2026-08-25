import type { LabelSummary } from "@/lib/conversations-api";

/** Renders a color-hex-tinted pill. Falls back to the theme's primary-soft look if unset. */
export function LabelBadge({
  label,
  onRemove,
}: {
  label: LabelSummary;
  onRemove?: () => void;
}) {
  const color = label.color_hex || "#6366F1";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label.name} label`}
          className="ml-0.5 rounded-full hover:opacity-70"
        >
          ×
        </button>
      )}
    </span>
  );
}
