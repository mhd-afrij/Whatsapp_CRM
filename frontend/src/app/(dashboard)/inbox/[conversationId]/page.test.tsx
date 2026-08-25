import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useParams: () => ({ conversationId: "42" }),
}));

vi.mock("@/components/inbox/chat-panel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock("@/components/inbox/contact-context-panel", () => ({
  ContactContextPanel: () => <div data-testid="contact-context-panel" />,
}));

import ConversationPage from "./page";

describe("ConversationPage", () => {
  it("uses a desktop grid that keeps the contact panel docked instead of forcing zoomed-out layout", () => {
    const { container } = render(<ConversationPage />);

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("contact-context-panel")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(
      "grid",
      "xl:grid-cols-[minmax(0,1fr)_clamp(300px,22vw,330px)]"
    );
  });
});
