"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
  value?: string;
  label?: string;
  description?: string;
  error?: string;
  className?: string;
  disabled?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, value, label, description, error, className, disabled, onChange, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={props.id} className="block text-sm font-medium text-text">
            {label}
          </label>
        )}
        {description && <p className="text-xs text-muted">{description}</p>}
        <select
          ref={ref}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "h-8 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-danger",
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";

interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  options,
  value,
  onChange,
  label,
  description,
  error,
  className,
  disabled,
  placeholder,
  ...props
}: SelectProps & { placeholder?: string }) {
  const selectRef = React_UseRef<HTMLSelectElement>(null);
  const [selectValue, setSelectValue] = React_UseState(value ?? "");

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setSelectValue(newVal);
    onChange?.(newVal);
  };

  const mergedOptions = [
    ...(placeholder ? [{ value: "", label: placeholder }] : []),
    ...options,
  ];

  return (
    <Select
      ref={selectRef}
      options={mergedOptions}
      value={selectValue}
      onChange={handleChange}
      label={label}
      description={description}
      error={error}
      className={className}
      disabled={disabled}
      {...props}
    />
  );
}

// Re-export React hook functions
const React_UseRef: <T>(initialValue: T) => React.RefObject<T> = React.useRef as any;
const React_UseState: <T>(initialState: T | (() => T)) => [T, React.Dispatch<React.SetStateAction<T>>] = React.useState as any;
