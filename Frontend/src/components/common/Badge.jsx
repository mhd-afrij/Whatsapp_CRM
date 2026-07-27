import { cn } from "../../utils/formatDate.js";

const toneClasses = {
  primary: "bg-primary-soft text-primary",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-surface-raised text-text-muted",
};

export function Badge({ label, tone = "neutral", className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        toneClasses[tone] ?? toneClasses.neutral,
        className
      )}
    >
      {label}
    </span>
  );
}
