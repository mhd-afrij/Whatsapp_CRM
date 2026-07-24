import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-dashed border-border rounded-[10px]">
      <div className="h-10 w-10 rounded-full bg-surface-raised flex items-center justify-center mb-3 text-text-muted">
        <Icon size={18} />
      </div>
      <p className="text-sm font-medium text-text-primary mb-1">{title}</p>
      {description && <p className="text-xs text-text-muted max-w-sm">{description}</p>}
    </div>
  );
}
