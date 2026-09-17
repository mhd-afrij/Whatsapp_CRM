"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  pending: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  pendingLabel?: string;
  type?: "submit" | "button";
}

export function SaveButton({
  pending,
  onClick,
  disabled,
  className,
  label = "Save Changes",
  pendingLabel = "Saving…",
  type = "button",
}: SaveButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || pending}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}