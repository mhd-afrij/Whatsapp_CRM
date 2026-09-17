import { apiClient, unwrap } from "@/lib/api-client";

/**
 * Frontend API layer for the post-signup onboarding wizard
 * (backend: AuthController onboarding endpoints, routes /auth/onboarding/*).
 *
 * The signup flow splits into two stages: Step 1 (account + username) happens
 * at `/auth/signup`; Steps 2-6 (workspace identity, WhatsApp number, real
 * gateway connection, Connect-Later skip) live here. The backend owns the
 * state machine (`account_created → workspace_pending →
 * whatsapp_connection_pending → completed`); this layer only submits each step
 * and reflects the current stage back to the wizard.
 */

export type OnboardingStep = "account_created" | "workspace_pending" | "whatsapp_connection_pending" | "completed";

export interface OnboardingStatus {
  onboarding_step: OnboardingStep;
  workspace: {
    name: string;
    country: string | null;
    whatsapp_number: string | null;
    whatsapp_display_name: string | null;
  } | null;
  user: {
    name: string;
    email: string;
    username: string | null;
    position: string | null;
  };
}

export interface OnboardingWorkspaceValues {
  workspace_name: string;
  position?: string;
  whatsapp_display_name: string;
}

export interface OnboardingWhatsappValues {
  country: string;
  country_code: string;
  mobile_number: string;
}

export interface UsernameAvailability {
  username: string;
  available: boolean;
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return unwrap(apiClient.get("/auth/onboarding"));
}

export async function saveOnboardingWorkspace(values: OnboardingWorkspaceValues): Promise<OnboardingStatus> {
  return unwrap(apiClient.post("/auth/onboarding/workspace", values));
}

export async function saveOnboardingWhatsapp(values: OnboardingWhatsappValues): Promise<OnboardingStatus> {
  return unwrap(apiClient.post("/auth/onboarding/whatsapp", values));
}

/** Completes onboarding; skip=true keeps the WhatsApp account disconnected. */
export async function completeOnboarding(skip: boolean): Promise<{ onboarding_step: OnboardingStep }> {
  return unwrap(apiClient.post("/auth/onboarding/complete", { skip }));
}

/** Public, rate-limited (30/min/IP) username availability probe. */
export async function checkUsernameAvailable(username: string): Promise<UsernameAvailability> {
  return unwrap(apiClient.get("/auth/username-available", { params: { username } }));
}