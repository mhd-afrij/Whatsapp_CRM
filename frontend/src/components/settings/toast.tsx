"use client";

import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  onClose?: () => void;
}

export function Toast({ message, type = "info", onClose }: ToastProps) {
  const bgClass = {
    success: "bg-success text-success",
    error: "bg-danger text-danger",
    info: "bg-muted text-text",
  }[type];

  const borderClass = {
    success: "border-success/30",
    error: "border-danger/30",
    info: "border-border",
  }[type];

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all",
        bgClass,
        borderClass,
        "animate-slide-in"
      )}
      role="status"
    >
      <span className="flex-1 text-sm">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted hover:text-text"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
