import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/auth/require-permission", () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/inbox/inbox-shell", () => ({
  InboxShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="inbox-shell">{children}</div>
  ),
}));

import { ThemeProvider } from "@/context/theme-context";
import InboxLayout from "./layout";

describe("InboxLayout", () => {
  it("removes the dashboard padding so the inbox can use the full available width", () => {
    const { container } = render(
      <ThemeProvider>
        <InboxLayout>
          <div data-testid="inbox-child" />
        </InboxLayout>
      </ThemeProvider>
    );

    expect(screen.getByTestId("inbox-shell")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-child")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(
      "relative",
      "flex",
      "h-[calc(100%+2rem)]",
      "min-h-0",
      "w-full",
      "-m-4",
      "sm:-m-6"
    );
  });
});
