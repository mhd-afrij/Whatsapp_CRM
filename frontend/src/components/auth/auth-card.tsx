import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Elevated surface container for the auth forms. Dark card with a thin neutral
 * border, soft drop shadow, a subtle green radial glow behind the card, and
 * restrained backdrop blur. Defaults to the brief's 36-40px card padding on
 * desktop; callers may still pass p-* overrides (tw-merge keeps the lg step).
 */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "border-auth-border bg-auth-surface rounded-2xl border p-6 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.9)] sm:p-10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AuthHeader({
  badge,
  title,
  description,
}: {
  badge: string;
  title: ReactNode;
  description: string;
}) {
  return (
    <div>
      <span className="border-auth-green text-auth-green inline-flex items-center border-l-2 pl-2 text-[11px] font-semibold uppercase">
        {badge}
      </span>
      <h1 className="text-auth-text mt-4 text-[28px] leading-tight font-semibold sm:text-[30px]">
        {title}
      </h1>
      <p className="text-auth-muted mt-2 text-sm leading-6">{description}</p>
    </div>
  );
}

/**
 * Password requirement checklist + strength meter. Display-only, derives color
 * steps from the same 4-point score. Updated for glass surface.
 */
const REQUIREMENTS = [
  { key: "length", label: "8+ characters", test: (v: string) => v.length >= 8 },
  { key: "case", label: "Uppercase", test: (v: string) => /[A-Z]/.test(v) },
  { key: "number", label: "Number", test: (v: string) => /\d/.test(v) },
  { key: "special", label: "Special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

const STRENGTH_STEPS = [
  { min: 1, label: "Weak", bar: "bg-auth-danger", width: "25%" },
  { min: 2, label: "Fair", bar: "bg-warning", width: "50%" },
  { min: 3, label: "Good", bar: "bg-primary", width: "75%" },
  { min: 4, label: "Strong", bar: "bg-success", width: "100%" },
] as const;

export function PasswordStrength({ password }: { password: string }) {
  const passed = REQUIREMENTS.map((r) => ({ ...r, ok: r.test(password) }));
  const score = passed.filter((r) => r.ok).length;
  const step = STRENGTH_STEPS.find((s) => s.min >= score && score > 0);

  if (!password) return null;

  return (
    <div className="border-auth-border bg-auth-elevated space-y-2.5 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-1 flex-1 gap-1" role="presentation">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("h-full flex-1 rounded-full", i < score ? step?.bar : "bg-auth-border")}
            />
          ))}
        </div>
        <span className="text-auth-muted text-xs font-medium">{step?.label}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {passed.map(({ key, label, ok }) => (
          <li
            key={key}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              ok ? "text-auth-green" : "text-auth-muted"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors duration-150",
                ok ? "border-auth-green/40 bg-auth-green/15" : "border-auth-border"
              )}
            >
              {ok && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
