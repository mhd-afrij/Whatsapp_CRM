"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type InputType = "text" | "number" | "email" | "password" | "tel" | "url" | "search" | "date" | "datetime-local" | "time" | "week" | "month";

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  type?: InputType;
  label?: string;
  description?: string;
  error?: string;
  className?: string;
  icon?: React.ReactNode;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ type = "text", label, description, error, className, icon, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={props.id} className="block text-sm font-medium text-text">
            {label}
          </label>
        )}
        {description && <p className="text-xs text-muted">{description}</p>}
        <div className="relative">
          {icon && <div className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">{icon}</div>}
          <input
            ref={ref}
            type={type}
            className={cn(
              "h-8 w-full rounded-lg border border-border bg-surface px-2.5 py-1 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
              icon && "pl-8",
              error && "border-danger",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
TextInput.displayName = "TextInput";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
  error?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ label, description, error, className, min, max, step, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={props.id} className="block text-sm font-medium text-text">
            {label}
          </label>
        )}
        {description && <p className="text-xs text-muted">{description}</p>}
        <input
          ref={ref}
          type="number"
          min={min}
          max={max}
          step={step}
          className={cn(
            "h-8 w-full rounded-lg border border-border bg-surface px-2.5 py-1 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
NumberInput.displayName = "NumberInput";
