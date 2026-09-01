export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="mb-4 h-12 w-12 rounded-full bg-surface-raised flex items-center justify-center">
          <Icon size={24} className="text-text-muted" />
        </div>
      )}
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-muted max-w-sm">{description}</p>
      )}
    </div>
  );
}
