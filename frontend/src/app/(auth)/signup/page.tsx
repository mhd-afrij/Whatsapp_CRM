"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useAuth } from "@/context/auth-context";
import { apiClient, ApiError } from "@/lib/api-client";
import { setToken, markAuthPresence } from "@/lib/token-store";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";
import { signupSchema, type SignupSchemaValues } from "@/lib/schemas";

const inputClassName = (hasError?: boolean) =>
  cn(
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary",
    hasError && "border-danger focus:border-danger focus:ring-danger"
  );

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupSchemaValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      workspace_name: "",
      password: "",
      password_confirmation: "",
    },
  });

  const onSubmit = async (values: SignupSchemaValues) => {
    setFormError(null);
    try {
      const { data } = await apiClient.post<{ data?: { access_token?: string } }>("/auth/register", {
        name: values.name,
        email: values.email,
        password: values.password,
        password_confirmation: values.password_confirmation,
        workspace_name: values.workspace_name,
      });

      // The backend returns a bare `{data: {...}}` body on success.
      const accessToken = data.data?.access_token;
      if (!accessToken) {
        throw new ApiError("Unable to create your account. Please try again.");
      }

      setToken(accessToken);
      markAuthPresence(true);
      await refresh();
      toast("Welcome! Your workspace is ready.", "success");
      router.push("/dashboard");
    } catch (error) {
      const message = applyApiErrorsToForm<SignupSchemaValues>(error, setError);
      setFormError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-text">Create your account</h1>
          <p className="mt-1 text-sm text-muted">
            Set up a new WhatsApp CRM workspace in seconds.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium text-text">
              Full name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              className={inputClassName(Boolean(errors.name))}
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-text">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClassName(Boolean(errors.email))}
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="workspace_name" className="text-sm font-medium text-text">
              Workspace name
            </label>
            <input
              id="workspace_name"
              type="text"
              autoComplete="organization"
              placeholder="e.g. Acme Realty"
              className={inputClassName(Boolean(errors.workspace_name))}
              {...register("workspace_name")}
            />
            {errors.workspace_name && (
              <p className="text-xs text-danger">{errors.workspace_name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-text">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className={cn(inputClassName(Boolean(errors.password)), "pr-10")}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition-colors hover:text-text"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="password_confirmation" className="text-sm font-medium text-text">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="password_confirmation"
                type={showConfirmation ? "text" : "password"}
                autoComplete="new-password"
                className={cn(inputClassName(Boolean(errors.password_confirmation)), "pr-10")}
                {...register("password_confirmation")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmation((value) => !value)}
                aria-label={showConfirmation ? "Hide password confirmation" : "Show password confirmation"}
                aria-pressed={showConfirmation}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition-colors hover:text-text"
              >
                {showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
            {isSubmitting ? "Creating workspace..." : "Create workspace"}
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
