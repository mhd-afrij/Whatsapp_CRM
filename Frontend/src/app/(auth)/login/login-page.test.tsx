import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Phase 18: frontend had zero test tooling/tests before this pass. This file
 * covers the login form's client-side Zod validation and submit flow, per
 * the roadmap's explicit call for "auth forms, protected routes,
 * permission-aware UI" coverage.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const login = vi.fn();
vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ login }),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation errors and never calls login when the form is empty", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email address", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "somepassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("submits valid credentials, calls login, and redirects to /inbox", async () => {
    login.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "agent@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("agent@example.com", "Password123!"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/inbox"));
  });

  it("renders the API error message and does not redirect when login rejects", async () => {
    const { ApiError } = await import("@/lib/api-client");
    login.mockRejectedValueOnce(new ApiError("These credentials do not match our records."));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "agent@example.com");
    await user.type(screen.getByLabelText(/password/i), "WrongPassword1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/these credentials do not match our records/i)
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
