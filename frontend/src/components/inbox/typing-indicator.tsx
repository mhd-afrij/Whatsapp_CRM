"use client";

import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  isTyping: boolean;
  name?: string;
  className?: string;
}

export function TypingIndicator({ isTyping, name, className }: TypingIndicatorProps) {
  if (!isTyping) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-xs text-muted",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={name ? `${name} is typing` : "Someone is typing"}
    >
      <div className="flex items-center gap-1">
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span>{name ? `${name} is typing...` : "Typing..."}</span>
    </div>
  );
}
