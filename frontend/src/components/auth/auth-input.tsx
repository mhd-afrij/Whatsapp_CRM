import type { LucideIcon } from "lucide-react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Shared, themed building blocks for the auth pages (login/signup). Everything
 * here is presentational — forms keep their own react-hook-form wiring — so
 * both pages consume the exact same field styling, error treatment and
 * password UX. Palette comes from the --auth-* tokens in globals.css.
 *
 */

const fieldShell =
  "h-12 w-full rounded-[10px] border bg-auth-input pl-10 pr-3 text-[15px] text-auth-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-auth-subtle disabled:cursor-not-allowed disabled:opacity-60";

const fieldState = (invalid?: boolean) =>
  cn(
    !invalid &&
      "border-auth-border hover:border-auth-border-strong focus:border-auth-green focus:shadow-[0_0_0_3px_rgba(53,212,119,0.14)]",
    invalid &&
      "border-auth-danger focus:border-auth-danger focus:shadow-[0_0_0_3px_rgba(255,125,143,0.18)]"
  );

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Leading field icon; defaults are inferred from autoComplete for email/username. */
  icon?: LucideIcon;
  error?: string;
  /** Subtle green check rendered at the end of the field (e.g. username available). */
  success?: boolean;
  /** Trailing slot for arbitrary content (status spinners, hints). */
  trailing?: ReactNode;
  hint?: ReactNode;
  /** Animation delay index for entrance stagger (0-based). */
  staggerIndex?: number;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput(
  {
    label,
    icon: IconProp,
    error,
    success,
    trailing,
    hint,
    className,
    id,
    staggerIndex = 0,
    ...props
  },
  ref
) {
  const autoIcon: LucideIcon | null =
    props.autoComplete === "email" ? Mail : props.autoComplete === "username" ? User : null;
  const Icon = IconProp ?? autoIcon;

  return (
    <div className="space-y-1.5" data-field-order={staggerIndex}>
      <label htmlFor={id} className="text-auth-text block text-[13px] font-medium">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2",
              error ? "text-auth-danger" : "text-auth-muted"
            )}
          />
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(fieldShell, fieldState(!!error), className)}
          {...props}
        />
        {trailing}
        {!trailing && success && !error && (
          <CircleCheck
            aria-hidden="true"
            className="text-auth-green pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
          />
        )}
      </div>
      {hint}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
});

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
  hint?: ReactNode;
  staggerIndex?: number;
}

/** Password field with an accessible show/hide toggle and a Caps Lock warning. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, error, hint, className, id, staggerIndex = 0, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const [capsOn, setCapsOn] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const { onBlur, onKeyDown, onKeyUp, ...rest } = props;
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (typeof e.getModifierState === "function") setCapsOn(e.getModifierState("CapsLock"));
    };

    const describedBy = [error ? `${inputId}-error` : null, capsOn ? `${inputId}-caps` : null]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="space-y-1.5" data-field-order={staggerIndex}>
        <label htmlFor={inputId} className="text-auth-text block text-[13px] font-medium">
          {label}
        </label>
        <div className="relative">
          <LockIcon invalid={!!error} />
          <input
            id={inputId}
            type={visible ? "text" : "password"}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            {...rest}
            onKeyDown={(e) => {
              onKeyDown?.(e);
              handleKey(e);
            }}
            onKeyUp={(e) => {
              onKeyUp?.(e);
              handleKey(e);
            }}
            onBlur={(e) => {
              onBlur?.(e);
              setCapsOn(false);
            }}
            ref={ref}
            className={cn(fieldShell, "pr-11", fieldState(!!error), className)}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="text-auth-muted hover:text-auth-text focus-visible:outline-auth-green absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-3px]"
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Eye aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
        {hint}
        {capsOn && !error && (
          <p
            id={`${inputId}-caps`}
            role="alert"
            className="text-warning flex items-center gap-1 text-xs font-medium"
          >
            Caps Lock is on.
          </p>
        )}
        {error && <FieldError id={`${inputId}-error`}>{error}</FieldError>}
      </div>
    );
  }
);

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-auth-danger flex items-start gap-1 text-xs">
      <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Accessible custom checkbox (browser default hidden, styled box follows
 *  :checked and :focus-visible via Tailwind's peer variants). Wired through
 *  react-hook-form's register in the pages. */
export function AuthCheckbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="text-auth-muted hover:text-auth-text flex min-h-11 cursor-pointer items-center gap-2.5 text-sm select-none">
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className={cn(
          "border-auth-border bg-auth-input flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border peer-checked:[&_svg]:opacity-100",
          "peer-checked:border-auth-green peer-checked:bg-auth-green",
          "peer-focus-visible:outline-auth-green peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          className
        )}
      >
        <Check aria-hidden="true" className="h-3 w-3 text-[#04130a] opacity-0" strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}

function LockIcon({ invalid }: { invalid: boolean }) {
  return (
    <Lock
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2",
        invalid ? "text-auth-danger" : "text-auth-muted"
      )}
    />
  );
}

interface AuthSubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  staggerIndex?: number;
}

/** Full-width primary CTA with loading spinner and green gradient. Entrance
 *  stagger lives on a wrapper div so the button's own hover/active transforms
 *  aren't frozen by the animation's fill mode. */
export function AuthSubmitButton({
  loading,
  loadingText,
  children,
  className,
  staggerIndex = 0,
  ...props
}: AuthSubmitButtonProps) {
  return (
    <div className="w-full" data-field-order={staggerIndex}>
      <button
        type="submit"
        aria-busy={loading || undefined}
        disabled={loading || props.disabled}
        className={cn(
          "bg-auth-green hover:bg-auth-green-hover focus-visible:outline-auth-green flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold text-[#07110b] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60",
          className
        )}
        {...props}
      >
        {loading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        {loading && loadingText ? loadingText : children}
      </button>
    </div>
  );
}
