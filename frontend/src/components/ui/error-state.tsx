"use client";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

/**
 * Shared error state with a retry action. Use this instead of a bare
 * <p className="text-danger"> whenever a query/mutation can fail and the
 * user has a meaningful way to recover (re-run the same fetch).
 */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center gap-2 p-6 text-center ${className ?? ""}`}>
      <p className="text-sm text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        Retry
      </button>
    </div>
  );
}
