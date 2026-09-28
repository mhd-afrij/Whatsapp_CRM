"use client";

import { useState } from "react";
import { ArrowRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/api-client";
import {
  AuthCheckbox,
  AuthInput,
  AuthSubmitButton,
  PasswordInput,
} from "@/components/auth/auth-input";
import { AuthCard, AuthHeader } from "@/components/auth/auth-card";
import { AuthFooter } from "@/components/auth/auth-footer";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AuthLogo } from "@/components/auth/auth-logo";
import { loginSchema, type LoginSchemaValues } from "@/lib/schemas";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginSchemaValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember_me: false },
  });

  const onSubmit = async (values: LoginSchemaValues) => {
    setFormError(null);
    try {
      await login(values.email, values.password, values.remember_me);
      setSuccess(true);
      router.push("/inbox");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Unable to sign in. Please try again.";
      setFormError(message);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-7 flex items-center gap-3 lg:hidden">
        <AuthLogo className="h-9 w-9" />
        <div>
          <p className="text-auth-text text-[15px] font-semibold">WhatsCRM</p>
          <p className="text-auth-subtle text-[11px]">Conversation operations</p>
        </div>
      </div>

      <AuthCard>
        <AuthHeader
          badge="WELCOME BACK"
          title="Welcome back"
          description="Sign in to continue to your WhatsCRM workspace."
        />

        <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthInput
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            error={errors.email?.message}
            staggerIndex={0}
            {...register("email")}
          />

          <PasswordInput
            id="password"
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            error={errors.password?.message}
            staggerIndex={1}
            {...register("password")}
          />

          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <AuthCheckbox label="Remember me" {...register("remember_me")} />
            <Link
              href="/forgot-password"
              className="text-auth-green focus-visible:outline-auth-green flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Forgot password?
            </Link>
          </div>

          {formError && (
            <p
              role="alert"
              className="border-auth-danger/35 bg-auth-danger/10 text-auth-danger rounded-lg border px-3 py-2.5 text-sm"
            >
              {formError}
            </p>
          )}

          <AuthSubmitButton
            loading={isSubmitting}
            loadingText="Signing in..."
            disabled={success}
            staggerIndex={3}
          >
            {success ? (
              <>
                <CircleCheck aria-hidden="true" className="h-4 w-4" />
                Signed in
              </>
            ) : (
              <>
                Sign in
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </>
            )}
          </AuthSubmitButton>
        </form>

        <div className="border-auth-border mt-7 border-t pt-6">
          <AuthFooter text="New to WhatsCRM?" linkHref="/signup" linkLabel="Create an account" />
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
