"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CircleCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import { checkUsernameAvailable } from "@/lib/onboarding-api";
import { useToast } from "@/providers/toast-provider";
import {
  AuthInput,
  AuthSubmitButton,
  FieldError,
  PasswordInput,
} from "@/components/auth/auth-input";
import { AuthCard, AuthHeader, PasswordStrength } from "@/components/auth/auth-card";
import { AuthFooter } from "@/components/auth/auth-footer";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AuthLogo } from "@/components/auth/auth-logo";
import { signupSchema, type SignupSchemaValues } from "@/lib/schemas";

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

  return (
    <AuthLayout>
      {/* Mobile-only brand header (the marketing panel is hidden below lg). */}
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <AuthLogo className="h-9 w-9" />
        <span className="text-lg font-semibold tracking-tight">WhatsCRM</span>
      </div>

      <AuthCard>
        <AuthHeader
          badge="CREATE YOUR WORKSPACE"
          title="Create your workspace"
          description="Create your account and start managing WhatsApp conversations with your team."
        />

        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthInput
            id="name"
            label="Full name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            error={errors.name?.message}
            staggerIndex={0}
            {...register("name")}
          />

          <AuthInput
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            staggerIndex={1}
            {...register("email")}
          />

          <AuthInput
            id="username"
            label="Username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="your_username"
            error={errors.username?.message}
            success={availability === "available"}
            staggerIndex={2}
            hint={
              availability === "checking" ? (
                <p className="flex items-center gap-1 text-xs text-auth-muted">
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                  Checking availability…
                </p>
              ) : availability === "available" ? (
                <p className="flex items-center gap-1 text-xs text-auth-green">
                  <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Username is available.
                </p>
              ) : availability === "taken" && !errors.username ? (
                <FieldError id="username-availability-error">
                  That username is already taken.
                </FieldError>
              ) : (
                <p className="text-xs text-auth-muted">
                  Letters, numbers and underscores — used as your handle across the CRM.
                </p>
              )
            }
            {...register("username")}
          />

          <div className="space-y-2">
            <PasswordInput
              id="password"
              label="Password"
              autoComplete="new-password"
              placeholder="Create a password"
              error={errors.password?.message}
              staggerIndex={3}
              {...register("password")}
            />
            <PasswordStrength password={password} />
          </div>

          <PasswordInput
            id="password_confirmation"
            label="Confirm password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            error={errors.password_confirmation?.message}
            staggerIndex={4}
            {...register("password_confirmation")}
          />

          {formError && (
            <p
              role="alert"
              className="rounded-[10px] border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger animate-shake-in"
            >
              {formError}
            </p>
          )}

          <AuthSubmitButton
            loading={isSubmitting}
            loadingText="Creating your workspace..."
            disabled={availability === "taken"}
            staggerIndex={5}
          >
            Create workspace
          </AuthSubmitButton>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-auth-muted animate-fade-in-up" style={{ animationDelay: "480ms" }}>
            <CircleCheck aria-hidden="true" className="h-3.5 w-3.5 text-auth-green" />
            Free 14-day trial. No credit card required.
          </p>
        </form>

        <div className="mt-8 animate-fade-in-up" style={{ animationDelay: "560ms" }}>
          <AuthFooter text="Already have an account?" linkHref="/login" linkLabel="Sign in" />
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
