import { cn } from "../../utils/formatDate.js";

export function Input({ label, error, className, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm text-text-secondary">{label}</label>
      )}
      <input
        className={cn(
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary",
          error && "border-danger",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
