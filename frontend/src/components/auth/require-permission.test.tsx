import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Phase 18: confirms RequirePermission actually hides content for a role
 * lacking the permission, and shows it for a role that has it - mocking the
 * auth context per the roadmap's instructions, since this is a UX-layer gate
 * (the real security boundary is the backend's permission middleware, per
 * this component's own docblock).
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const can = vi.fn();
vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ can }),
}));

import { RequirePermission } from "./require-permission";

describe("RequirePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides children and redirects when the user's role lacks the permission (e.g. Agent viewing an admin-only panel)", async () => {
    can.mockReturnValue(false);

    render(
      <RequirePermission permission="workspace.settings.manage">
        <div>Workspace Settings Panel</div>
      </RequirePermission>
    );

    expect(screen.queryByText("Workspace Settings Panel")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/unauthorized"));
  });

  it("renders children and does not redirect when the user's role has the permission (e.g. Administrator)", async () => {
    can.mockReturnValue(true);

    render(
      <RequirePermission permission="workspace.settings.manage">
        <div>Workspace Settings Panel</div>
      </RequirePermission>
    );

    expect(screen.getByText("Workspace Settings Panel")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
