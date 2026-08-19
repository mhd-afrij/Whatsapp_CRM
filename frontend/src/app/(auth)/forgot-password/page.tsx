"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { apiClient, type ApiResponse } from "@/lib/api-client";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import { cn } from "@/lib/utils";
import { forgotPasswordSchema, type ForgotPasswordSchemaValues } from "@/lib/schemas";

export default function ForgotPasswordPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordSchemaValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordSchemaValues) => {
    setFormError(null);
    try {
      const { data } = await apiClient.post<ApiResponse<null>>("/auth/forgot-password", values);
      if (!data.success) throw data;
      setSubmitted(true);
    } catch (error) {
      const message = applyApiErrorsToForm<ForgotPasswordSchemaValues>(error, setError);
      setFormError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text">Forgot password</h1>
          <p className="mt-1 text-sm text-muted">
            We&apos;ll email you a link to reset your password.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              If that email address is in our system, a password reset link has been sent.
            </p>
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-text">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
                  errors.email && "border-danger focus:border-danger focus:ring-danger"
                )}
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>

            {formError && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>

            <p className="text-center text-sm text-muted">
              <Link href="/login" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
