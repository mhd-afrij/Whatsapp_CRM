import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Covers the redesigned signup form's client-side Zod validation, password
 * visibility toggle, submit flow (including username normalization) and
 * server-error mapping — mirroring login-page.test.tsx coverage for the other
 * half of the auth experience.
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const signup = vi.fn();
const toast = vi.fn();
vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ signup }),
}));

vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/lib/onboarding-api", () => ({
  checkUsernameAvailable: vi.fn().mockResolvedValue({ username: "", available: true }),
}));

import SignupPage from "./page";

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation errors and never calls signup when the form is empty", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByText(/please enter your full name/i)).toBeInTheDocument();
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it("rejects mismatched password confirmation", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/full name/i), "Test User");
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.type(screen.getByLabelText(/^username$/i), "test_user");
    await user.type(screen.getByLabelText(/^Password$/i), "Password123!");
    await user.type(screen.getByLabelText(/confirm password/i), "Different123!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it("toggles password visibility via the show/hide button", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    const password = screen.getByLabelText(/^Password$/i);
    expect(password).toHaveAttribute("type", "password");

    // Both password fields have a toggle; target the first (the Password field).
    const [toggle] = screen.getAllByRole("button", { name: /show password/i });
    await user.click(toggle!);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getAllByRole("button", { name: /hide password/i })[0]).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /hide password/i })[0]);
    expect(password).toHaveAttribute("type", "password");
  });

  it("submits valid values with a normalized username and routes to onboarding", async () => {
    signup.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/full name/i), "Test User");
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.type(screen.getByLabelText(/^username$/i), "Test_User");
    await user.type(screen.getByLabelText(/^Password$/i), "Password123!");
    await user.type(screen.getByLabelText(/confirm password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    await waitFor(() =>
      expect(signup).toHaveBeenCalledWith({
        name: "Test User",
        email: "test@example.com",
        username: "test_user",
        password: "Password123!",
        password_confirmation: "Password123!",
      })
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining("Account created"), "success"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("renders a server validation error next to the form", async () => {
    const { ApiError } = await import("@/lib/api-client");
    signup.mockRejectedValueOnce(
      new ApiError("That username is already taken.", {
        code: null,
        errors: { username: ["That username is already taken."] },
      })
    );
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/full name/i), "Test User");
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.type(screen.getByLabelText(/^username$/i), "taken_name");
    await user.type(screen.getByLabelText(/^Password$/i), "Password123!");
    await user.type(screen.getByLabelText(/confirm password/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    expect(await screen.findAllByText(/that username is already taken/i)).not.toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
  });
});
