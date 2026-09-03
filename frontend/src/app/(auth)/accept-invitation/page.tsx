"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/context/auth-context";
import { apiClient, ApiError, type ApiResponse } from "@/lib/api-client";
import { setToken, markAuthPresence } from "@/lib/token-store";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/context/auth-context";

const schema = z
  .object({
    name: z.string().min(1, "Name is required").max(255),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirmation: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

type FormValues = z.infer<typeof schema>;

interface AcceptInvitationResponseData {
  user: AuthUser;
  token: string;
}

function AcceptInvitationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { refresh } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "", password_confirmation: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    if (!token) {
      setFormError("This invitation link is missing its token. Ask your admin for a new invite.");
      return;
    }
    try {
      const { data } = await apiClient.post<ApiResponse<AcceptInvitationResponseData>>(
        "/auth/invitations/accept",
        { ...values, token }
      );
      if (!data.success) {
        throw new ApiError(data.message, { code: data.code ?? null, errors: data.errors ?? null });
      }
      setToken(data.data.token);
      markAuthPresence(true);
      await refresh();
      toast("Welcome! Your account is ready.", "success");
      router.push("/dashboard");
    } catch (error) {
      const message = applyApiErrorsToForm<FormValues>(error, setError);
      setFormError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text">Accept invitation</h1>
          <p className="mt-1 text-sm text-muted">Set your name and password to join the workspace.</p>
        </div>

        {!token && (
          <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            This link is missing an invitation token. Use the link from your invite email.
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium text-text">
              Full name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              className={cn(
                "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
                errors.name && "border-danger focus:border-danger focus:ring-danger"
              )}
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-text">
              Password
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
              Confirm password
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
            {isSubmitting ? "Joining..." : "Accept invitation"}
          </button>

          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
