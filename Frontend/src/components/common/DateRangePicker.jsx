import { cn } from "../../utils/formatDate.js";

const presets = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function DateRangePicker({ from, to, onChange, className }) {
  const handlePreset = (days) => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    onChange({ from, to });
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">From</span>
        <input
          type="date"
          value={from ?? ""}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">To</span>
        <input
          type="date"
          value={to ?? ""}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="flex gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p.days)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted hover:bg-surface-hover"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
