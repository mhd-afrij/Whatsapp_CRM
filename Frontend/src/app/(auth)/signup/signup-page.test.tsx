import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Covers the signup form's client-side Zod validation, the happy path that
 * stores the issued access token and redirects into the new workspace, and
 * server-side validation error mapping.
 */

const { push, refresh, toast, post, setToken, markAuthPresence } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  post: vi.fn(),
  setToken: vi.fn(),
  markAuthPresence: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ refresh }),
}));
vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: { post },
  };
});
vi.mock("@/lib/token-store", () => ({
  setToken,
  getToken: vi.fn(),
  clearToken: vi.fn(),
  markAuthPresence,
}));

import { ApiError } from "@/lib/api-client";
import SignupPage from "./page";

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation errors and never calls the API when the form is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByText(/your name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/workspace name is required/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("submits valid details, stores the access token, and redirects to /dashboard", async () => {
    post.mockResolvedValueOnce({
      data: { data: { access_token: "token-123", user: { id: "1", name: "Dana" } } },
    });
    refresh.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/^full name$/i), "Dana Owner");
    await user.type(screen.getByLabelText(/^work email$/i), "dana@example.test");
    await user.type(screen.getByLabelText(/^workspace name$/i), "Acme Realty");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.type(screen.getByLabelText(/^confirm password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/auth/register", {
        name: "Dana Owner",
        email: "dana@example.test",
        password: "Password123!",
        password_confirmation: "Password123!",
        workspace_name: "Acme Realty",
      })
    );
    expect(setToken).toHaveBeenCalledWith("token-123");
    expect(markAuthPresence).toHaveBeenCalledWith(true);
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("renders server-side validation errors without redirecting", async () => {
    post.mockRejectedValueOnce(
      new ApiError("The email has already been taken.", {
        status: 422,
        errors: { email: ["The email has already been taken."] },
      })
    );
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/^full name$/i), "Dana Owner");
    await user.type(screen.getByLabelText(/^work email$/i), "taken@example.test");
    await user.type(screen.getByLabelText(/^workspace name$/i), "Taken Co");
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.type(screen.getByLabelText(/^confirm password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    // The message renders twice: inline under the email field and in the
    // form-level banner (applyApiErrorsToForm returns it as well).
    const messages = await screen.findAllByText(/already been taken/i);
    expect(messages.length).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalled();
  });
});
