"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface GatedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  reason?: ReactNode;
}

export function GatedButton({ reason, className, disabled, children, ...props }: GatedButtonProps) {
  if (!disabled || !reason) {
    return <button {...props} disabled={disabled} className={className}>{children}</button>;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />} />
      <button {...props} type={props.type ?? "button"} disabled className={cn("pointer-events-none", className)}>
        {children}
      </button>
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  );
}