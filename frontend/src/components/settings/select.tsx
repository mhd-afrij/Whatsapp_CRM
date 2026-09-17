"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useRef, useState } from "react";

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

interface SelectFieldProps extends Omit<SelectProps, "onChange"> {
  onChange?: (value: string) => void;
  placeholder?: string;
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
}: SelectFieldProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [selectValue, setSelectValue] = useState(value ?? "");

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
