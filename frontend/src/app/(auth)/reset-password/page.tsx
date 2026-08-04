"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiClient, type ApiResponse } from "@/lib/api-client";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

type FormValues = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const emailFromQuery = searchParams.get("email") ?? "";
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: emailFromQuery, password: "", password_confirmation: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    if (!token) {
      setFormError("This reset link is missing its token. Please request a new one.");
      return;
    }
    try {
      const { data } = await apiClient.post<ApiResponse<null>>("/auth/reset-password", {
        ...values,
        token,
      });
      if (!data.success) throw data;
      toast("Password reset successfully. Please sign in.", "success");
      router.push("/login");
    } catch (error) {
      const message = applyApiErrorsToForm<FormValues>(error, setError);
      setFormError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text">Reset password</h1>
          <p className="mt-1 text-sm text-muted">Choose a new password for your account.</p>
        </div>

        {!token && (
          <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            This link is missing a reset token. Use the link from your email, or request a new
            one.
          </p>
        )}

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

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-text">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className={cn(
                "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
                errors.password && "border-danger focus:border-danger focus:ring-danger"
              )}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-danger">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="password_confirmation" className="text-sm font-medium text-text">
              Confirm new password
            </label>
            <input
              id="password_confirmation"
              type="password"
              autoComplete="new-password"
              className={cn(
                "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
                errors.password_confirmation &&
                  "border-danger focus:border-danger focus:ring-danger"
              )}
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
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Resetting..." : "Reset password"}
          </button>

          <p className="text-center text-sm text-muted">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
