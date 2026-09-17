"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { CheckCircle2, MessageCircle, ShieldCheck, Users, Zap } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import { checkUsernameAvailable } from "@/lib/onboarding-api";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { signupSchema, type SignupSchemaValues } from "@/lib/schemas";

function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score: password ? score : 0, label: labels[score] };
}

const features = [
  {
    icon: Users,
    title: "Your own workspace",
    description: "Create a private workspace and invite your team as you grow.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp-first inbox",
    description: "Every contact, conversation and lead in one unified place.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in role controls",
    description: "You're signed up as Owner — fine-grained permissions for every member.",
  },
  {
    icon: Zap,
    title: "Ready in minutes",
    description: "Set up your workspace and connect WhatsApp in a quick guided flow.",
  },
];

const strengths = ["bg-danger", "bg-warning", "bg-primary", "bg-success"];

type Availability = "idle" | "checking" | "available" | "taken";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>("idle");

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupSchemaValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", username: "", password: "", password_confirmation: "" },
  });

  const password = watch("password") ?? "";
  const strength = passwordStrength(password);

  // Debounced username availability probe. Only fires once the value passes
  // the schema's shape rules; the backend re-checks on submit regardless, so
  // this is purely a UX nicety (and stays well under the 30/min rate limit).
  const username = watch("username")?.trim().toLowerCase() ?? "";
  const usernameShapeValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);
  useEffect(() => {
    if (!usernameShapeValid || !username) {
      setAvailability("idle");
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setAvailability("checking");
      try {
        const { available } = await checkUsernameAvailable(username);
        if (!cancelled) setAvailability(available ? "available" : "taken");
      } catch {
        // Fail open: the backend validates on submit; an unreachable check
        // must not block signup.
        if (!cancelled) setAvailability("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username, usernameShapeValid]);

  const onSubmit = async (values: SignupSchemaValues) => {
    setFormError(null);
    try {
      await signup({ ...values, username: values.username.trim().toLowerCase() });
      toast("Account created. Let's set up your workspace.", "success");
      router.replace("/onboarding");
    } catch (error) {
      const message = applyApiErrorsToForm<SignupSchemaValues>(error, setError);
      setFormError(message);
    }
  };

  const inputClass = (invalid: boolean) =>
    cn(
      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
      invalid && "border-danger focus:border-danger focus:ring-danger"
    );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-dark via-primary to-primary-dark p-12 text-white lg:flex">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">WhatsCRM</span>
          </div>

          <h1 className="mt-12 max-w-md text-3xl font-semibold leading-tight">
            Run your customer conversations on WhatsApp, at scale.
          </h1>

          <ul className="mt-10 space-y-6">
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-white/10 p-2">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-sm text-white/70">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-sm text-white/60">
          Trusted by high-performing support and sales teams.
        </p>
      </aside>

      <main className="flex h-screen w-full overflow-y-auto px-4 py-10 lg:w-1/2">
        <div className="m-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
                <MessageCircle className="h-5 w-5" />
              </span>
              <span className="text-lg font-semibold text-text">WhatsCRM</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-text">Create your account</h2>
            <p className="mt-1 text-sm text-muted">
              Start your workspace — you&apos;ll be its Owner.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm font-medium text-text">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  className={inputClass(!!errors.name)}
                  {...register("name")}
                />
                {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
              </div>

              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium text-text">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={inputClass(!!errors.email)}
                  {...register("email")}
                />
                {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
              </div>

              <div className="space-y-1">
                <label htmlFor="username" className="text-sm font-medium text-text">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="your_username"
                  className={inputClass(!!errors.username || availability === "taken")}
                  {...register("username")}
                />
                <p className="text-xs text-muted">
                  Letters, numbers and underscores — used as your handle across the CRM.
                </p>
                {availability === "checking" && (
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Checking availability…
                  </p>
                )}
                {availability === "available" && (
                  <p className="text-xs text-success">Username is available.</p>
                )}
                {availability === "taken" && (
                  <p className="text-xs text-danger">That username is already taken.</p>
                )}
                {errors.username && <p className="text-xs text-danger">{errors.username.message}</p>}
              </div>

              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium text-text">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className={inputClass(!!errors.password)}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-xs text-danger">{errors.password.message}</p>
                )}
                {password && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1 w-6 rounded-full",
                            i < strength.score
                              ? strengths[strength.score - 1]
                              : "bg-border"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted">{strength.label}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="password_confirmation" className="text-sm font-medium text-text">
                  Confirm password
                </label>
                <input
                  id="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  className={inputClass(!!errors.password_confirmation)}
                  {...register("password_confirmation")}
                />
                {errors.password_confirmation && (
                  <p className="text-xs text-danger">{errors.password_confirmation.message}</p>
                )}
              </div>

              {formError && (
                <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || availability === "taken"}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Creating your account..." : "Create account"}
              </button>

              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                Free 14-day trial. No credit card required.
              </p>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}