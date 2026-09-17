"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { applyApiErrorsToForm } from "@/lib/form-errors";
import {
  completeOnboarding,
  fetchOnboardingStatus,
  saveOnboardingWhatsapp,
  saveOnboardingWorkspace,
  type OnboardingStep,
} from "@/lib/onboarding-api";
import {
  onboardingWorkspaceSchema,
  onboardingWhatsappSchema,
  type OnboardingWorkspaceSchemaValues,
  type OnboardingWhatsappSchemaValues,
} from "@/lib/schemas";
import { defaultCountry, COUNTRIES, type Country } from "@/lib/countries";
import { PhoneNumberInput } from "@/components/contacts/phone-number-input";
import { formatWhatsAppNumber } from "@/lib/phone";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  useConnectWhatsappAccount,
  useWhatsappAccountConnectionStatus,
  useWhatsappAccountQr,
  useWhatsappAccounts,
  whatsappAccountErrorMessage,
} from "@/hooks/use-whatsapp-accounts";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import {
  resolveWhatsappQrState,
  whatsappQrStateHint,
  type WhatsappQrState,
} from "@/lib/whatsapp-qr-state";
import { input, primary, secondary } from "@/components/settings/styles";

/**
 * Post-signup onboarding wizard (Steps 2-6; Step 1 is the signup page).
 *
 *   Step 2  Workspace identity: name, the creator's position, WhatsApp
 *           display name            -> POST /auth/onboarding/workspace
 *   Step 3  The real WhatsApp number-> POST /auth/onboarding/whatsapp
 *           (provisions the managed whatsapp_accounts slot, always
 *           disconnected/inactive - nothing is faked)
 *   Steps 4-5  Connect via the REAL gateway: QR scan or Baileys pairing
 *           code (both genuinely supported - never fabricated here)
 *   Step 6  Success - shown ONLY when the gateway reports a connected
 *           session; "Connect Later" completes honestly disconnected.
 *
 * The backend owns the state machine; this page is purely a renderer of
 * `onboarding_step` and its resume point after a refresh.
 */

type WizardStep = "workspace" | "whatsapp" | "qr" | "success";

const STEP_LABELS = [
  "Account",
  "Workspace",
  "WhatsApp",
  "Connect",
  "Done",
];

function stepIndex(step: WizardStep): number {
  switch (step) {
    case "workspace":
      return 1;
    case "whatsapp":
      return 2;
    case "qr":
      return 3;
    case "success":
      return 4;
  }
}

function initialStepFor(onboardingStep: OnboardingStep): WizardStep {
  switch (onboardingStep) {
    case "account_created":
      return "workspace";
    case "workspace_pending":
      return "whatsapp";
    default:
      // whatsapp_connection_pending (and any future state) resumes at QR.
      return "qr";
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>("workspace");
  const [booted, setBooted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-hydrate the wizard from the backend's source-of-truth step once, and
  // bounce straight out when onboarding is already done.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchOnboardingStatus();
        if (cancelled) return;
        if (status.onboarding_step === "completed") {
          router.replace("/dashboard");
          return;
        }
        setStep(initialStepFor(status.onboarding_step));
      } catch (err) {
        if (!cancelled && err instanceof ApiError) {
          setFormError(err.message);
        }
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ---------------------------------------------------------------- Step 2
  const workspaceForm = useForm<OnboardingWorkspaceSchemaValues>({
    resolver: zodResolver(onboardingWorkspaceSchema),
    defaultValues: {
      workspace_name: "",
      position: "",
      whatsapp_display_name: "",
    },
  });

  // ---------------------------------------------------------------- Step 3
  const [country, setCountry] = useState<Country>(() => defaultCountry());
  const [national, setNational] = useState("");
  const whatsappForm = useForm<OnboardingWhatsappSchemaValues>({
    resolver: zodResolver(onboardingWhatsappSchema),
    defaultValues: { country: defaultCountry().name, country_code: defaultCountry().dial, mobile_number: "" },
  });

  // ------------------------------------------------------- Steps 4-6: link
  const accountsQuery = useWhatsappAccounts({ enabled: booted && step !== "success" });
  const account = useMemo(() => {
    const list = accountsQuery.data ?? [];
    return list[0] ?? null;
  }, [accountsQuery.data]);

  const connectAccount = useConnectWhatsappAccount();
  const qrMutation = useWhatsappAccountQr();
  const statusQuery = useWhatsappStatus({ enabled: account !== null && step !== "success" });
  const connectionStatusQuery = useWhatsappAccountConnectionStatus(account?.id ?? null, {
    enabled: account !== null && step === "qr",
  });

  const live = statusQuery.data;
  const polled = connectionStatusQuery.data;

  // Kick off one real pairing round the first time we reach the QR step
  // for an account (mirrors AddAccountDialog; keyed to the account id).
  const kickoffRef = useRef<number | null>(null);
  useEffect(() => {
    if (!account || step !== "qr") return;
    if (kickoffRef.current === account.id) return;
    kickoffRef.current = account.id;
    setError(null);
    connectAccount.mutate(account.id, {
      onError: (err) => setError(whatsappAccountErrorMessage(err, "Unable to start WhatsApp connection.")),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, step]);

  // Success is driven ONLY by real gateway state: the moment the gateway
  // reports a connected session the wizard shows success wherever the user is
  // located (derived, not a state write — no effect, no cascading render).
  const gatewayConnected =
    live?.status === "connected" || (polled?.status === "connected" && polled?.connected === true);
  const effectiveStep: WizardStep = gatewayConnected && step !== "success" ? "success" : step;

  const qrState: WhatsappQrState = resolveWhatsappQrState({
    status: live?.status ?? polled?.status ?? null,
    qrCode: live?.qrCode ?? polled?.qrCode ?? null,
    qrExpiresAt: live?.qrExpiresAt ?? polled?.qrExpiresAt ?? null,
    error: error ?? (statusQuery.isError && !statusQuery.gatewayUnavailable ? "failed" : null),
  });
  const qrCode = live?.qrCode ?? polled?.qrCode ?? null;
  const connecting = connectAccount.isPending || qrMutation.isPending;

  const submitWorkspace = async (values: OnboardingWorkspaceSchemaValues) => {
    setFormError(null);
    try {
      await saveOnboardingWorkspace(values);
      await refresh();
      setStep("whatsapp");
    } catch (err) {
      const message = applyApiErrorsToForm<OnboardingWorkspaceSchemaValues>(err, workspaceForm.setError);
      setFormError(message);
    }
  };

  const submitWhatsapp = async (values: OnboardingWhatsappSchemaValues) => {
    setFormError(null);
    try {
      await saveOnboardingWhatsapp(values);
      await refresh();
      // Step 3 creates the managed account slot server-side; refetch so the
      // connect step sees it immediately instead of waiting on cache staleness.
      await accountsQuery.refetch();
      setStep("qr");
    } catch (err) {
      const message = applyApiErrorsToForm<OnboardingWhatsappSchemaValues>(err, whatsappForm.setError);
      setFormError(message);
    }
  };

  const refreshQr = () => {
    if (!account) return;
    setError(null);
    qrMutation.mutate(account.id, {
      onSuccess: () => toast("A new QR code has been generated.", "success"),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Unable to refresh the QR code."),
    });
  };

  const retryConnection = () => {
    if (!account) return;
    setError(null);
    connectAccount.mutate(account.id, {
      onError: (err) => setError(whatsappAccountErrorMessage(err, "WhatsApp connection failed.")),
    });
  };

  const finishConnectLater = async () => {
    setFormError(null);
    try {
      await completeOnboarding(true);
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to finish setup right now.");
    }
  };

  const finishConnected = async () => {
    setFormError(null);
    try {
      await completeOnboarding(false);
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      toast(whatsappAccountErrorMessage(err, "Unable to finish setup right now."), "error");
    }
  };

  const stepNames: Record<WizardStep, string> = {
    workspace: "Name your workspace",
    whatsapp: "Your WhatsApp number",
    success: "You're all set",
    qr: "Scan the QR code",
  };

  const displayNumber = useMemo(() => formatWhatsAppNumber(account?.phone_number ?? null), [account?.phone_number]);

  const inputClass = (invalid: boolean) =>
    cn(
      input,
      invalid && "border-danger focus:border-danger focus:ring-danger"
    );

  // Boot gate: wait for the status fetch + show a simple loading state.
  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <p className="ml-2 text-sm text-muted">Loading your workspace...</p>
      </div>
    );
  }

  const idx = stepIndex(effectiveStep);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Brand bar */}
      <header className="flex items-center gap-2 px-6 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold text-text">WhatsCRM</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-lg">
          {/* Stepper */}
          <ol className="mb-8 flex items-center gap-2" aria-label="Setup progress">
            {STEP_LABELS.map((label, i) => (
              <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    i < idx && "bg-success text-white",
                    i === idx && "bg-primary text-white",
                    i > idx && "bg-border text-muted"
                  )}
                  aria-current={i === idx ? "step" : undefined}
                >
                  {i < idx ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className={cn("text-[11px] font-medium", i === idx ? "text-text" : "text-muted")}>
                  {label}
                </span>
              </li>
            ))}
          </ol>

          <div className="rounded-lg border border-border bg-surface p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-text">{stepNames[effectiveStep]}</h1>
            <p className="mt-1 text-sm text-muted">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}! A few quick steps to set up your workspace.
            </p>

            {formError && (
              <p className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {formError}
              </p>
            )}

            {/* ------------------------------------------------ Step 2 */}
            {effectiveStep === "workspace" && (
              <form className="mt-6 space-y-4" onSubmit={workspaceForm.handleSubmit(submitWorkspace)} noValidate>
                <div className="space-y-1">
                  <label htmlFor="workspace_name" className="text-sm font-medium text-text">
                    Workspace name
                  </label>
                  <input
                    id="workspace_name"
                    type="text"
                    autoComplete="organization"
                    className={inputClass(!!workspaceForm.formState.errors.workspace_name)}
                    {...workspaceForm.register("workspace_name")}
                  />
                  {workspaceForm.formState.errors.workspace_name && (
                    <p className="text-xs text-danger">{workspaceForm.formState.errors.workspace_name.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="position" className="text-sm font-medium text-text">
                    Your role / position
                  </label>
                  <input
                    id="position"
                    type="text"
                    autoComplete="organization-title"
                    placeholder="e.g. Sales Manager"
                    className={inputClass(!!workspaceForm.formState.errors.position)}
                    {...workspaceForm.register("position")}
                  />
                  {workspaceForm.formState.errors.position && (
                    <p className="text-xs text-danger">{workspaceForm.formState.errors.position.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="whatsapp_display_name" className="text-sm font-medium text-text">
                    WhatsApp display name
                  </label>
                  <input
                    id="whatsapp_display_name"
                    type="text"
                    placeholder="Customer Support"
                    className={inputClass(!!workspaceForm.formState.errors.whatsapp_display_name)}
                    {...workspaceForm.register("whatsapp_display_name")}
                  />
                  <p className="text-xs text-muted">Shown on the phone you&apos;ll link WhatsApp from.</p>
                  {workspaceForm.formState.errors.whatsapp_display_name && (
                    <p className="text-xs text-danger">{workspaceForm.formState.errors.whatsapp_display_name.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={workspaceForm.formState.isSubmitting}
                  className={cn(primary, "w-full")}
                >
                  {workspaceForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              </form>
            )}

            {/* ------------------------------------------------ Step 3 */}
            {effectiveStep === "whatsapp" && (
              <form className="mt-6 space-y-4" onSubmit={whatsappForm.handleSubmit(submitWhatsapp)} noValidate>
                <div className="space-y-1">
                  <label htmlFor="wa-onboarding" className="text-sm font-medium text-text">
                    Mobile Number
                  </label>
                  <PhoneNumberInput
                    id="wa-onboarding"
                    value={national}
                    dialCode={country.dial}
                    onDialCodeChange={(dial) => {
                      const next = COUNTRIES.find((c) => c.dial === dial) ?? defaultCountry(dial);
                      setCountry(next);
                      whatsappForm.setValue("country", next.name, { shouldValidate: true });
                      whatsappForm.setValue("country_code", next.dial, { shouldValidate: true });
                    }}
                    onChange={(n) => {
                      setNational(n);
                      whatsappForm.setValue("mobile_number", n, { shouldValidate: true });
                    }}
                    hasError={Boolean(whatsappForm.formState.errors.mobile_number)}
                  />
                  <p className="text-xs text-muted">
                    The WhatsApp number you&apos;ll connect, e.g. 77 123 4567 for Sri Lanka (+94).
                  </p>
                  {whatsappForm.formState.errors.mobile_number && (
                    <p className="text-xs text-danger">{whatsappForm.formState.errors.mobile_number.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={whatsappForm.formState.isSubmitting}
                  className={cn(primary, "w-full")}
                >
                  {whatsappForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              </form>
            )}

            {/* --------------------------------------------- Step 4: QR */}
            {effectiveStep === "qr" && (
              <div className="mt-6 space-y-4">
                {qrState === "generating" && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-text">Generating QR...</p>
                    <p className="mt-1 text-xs text-muted">The gateway is preparing your pairing code.</p>
                  </div>
                )}

                {(qrState === "waiting" || qrState === "expired") && qrCode && (
                  <div className="flex flex-col items-center rounded-xl border border-border bg-bg p-6">
                    <img
                      src={qrCode}
                      alt="Scan this QR code to connect WhatsApp"
                      className="h-56 w-56 rounded-lg bg-white p-2"
                    />
                    <p className="mt-3 text-sm font-medium text-text">{whatsappQrStateHint(qrState)}</p>
                    {qrState === "waiting" && (
                      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-left text-xs text-muted">
                        <li>Open WhatsApp on your phone.</li>
                        <li>Go to Settings &rarr; Linked Devices.</li>
                        <li>Tap &ldquo;Link a device&rdquo;.</li>
                        <li>Scan this QR code.</li>
                      </ol>
                    )}
                    {qrState === "expired" && (
                      <button type="button" className={`${secondary} mt-3`} onClick={refreshQr} disabled={qrMutation.isPending}>
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Refresh QR
                      </button>
                    )}
                  </div>
                )}

                {qrState === "connecting" && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-warning" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-text">Connecting...</p>
                    <p className="mt-1 text-xs text-muted">Finishing the WhatsApp handshake.</p>
                  </div>
                )}

                {qrState === "error" && (
                  <div className="flex flex-col items-center rounded-xl border border-danger/40 bg-danger/10 p-6">
                    <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-text">Connection failed</p>
                    <p className="mt-1 text-xs text-muted">{error ?? "An unexpected error occurred."}</p>
                    <button type="button" className={`${secondary} mt-3`} onClick={retryConnection} disabled={connecting}>
                      {connecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      Try Again
                    </button>
                  </div>
                )}

                <button type="button" className={cn(secondary, "w-full")} onClick={() => void finishConnectLater()}>
                  Connect Later
                </button>
              </div>
            )}

            {/* ------------------------------------------------ Step 5 */}
            {effectiveStep === "success" && (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col items-center rounded-xl border border-success/40 bg-success/10 p-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-text">WhatsApp connected successfully.</p>
                  {displayNumber && <p className="mt-0.5 text-sm text-muted">{displayNumber}</p>}
                  <span className="mt-3 rounded-full bg-success/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success">
                    Connected
                  </span>
                  <p className="mt-3 text-xs text-muted">You&apos;re ready to receive and reply to messages.</p>
                </div>
                {formError && (
                  <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                    {formError}
                  </p>
                )}
                <button type="button" className={cn(primary, "w-full")} onClick={() => void finishConnected()}>
                  {statusQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Enter Workspace"}
                </button>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            Need help?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            or{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => void finishConnectLater()}
            >
              set this up later
            </button>
            .
          </p>
        </div>
      </main>
    </div>
  );
}