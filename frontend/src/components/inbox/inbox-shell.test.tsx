import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/inbox";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/components/inbox/conversation-list-panel", () => ({
  ConversationListPanel: () => <div data-testid="conversation-list-panel" />,
}));

import { InboxShell } from "./inbox-shell";

describe("InboxShell", () => {
  it("keeps the desktop split narrow enough for the inbox to fit at normal zoom", () => {
    pathname = "/inbox";
    const { container } = render(
      <InboxShell>
        <div data-testid="thread-panel" />
      </InboxShell>
    );

    expect(screen.getByTestId("conversation-list-panel")).toBeInTheDocument();
    expect(screen.getByTestId("thread-panel")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("flex", "h-full", "overflow-hidden");
  });

  it("keeps the conversation list visible on desktop even when a thread is open", () => {
    pathname = "/inbox/1";
    render(
      <InboxShell>
        <div data-testid="thread-panel" />
      </InboxShell>
    );

    expect(screen.getByTestId("conversation-list-panel")).toBeInTheDocument();
    expect(screen.getByTestId("thread-panel")).toBeInTheDocument();
  });
});
