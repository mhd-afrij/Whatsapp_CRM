import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageStatusTick } from "./message-status-tick";

function renderTick(props: { status: Parameters<typeof MessageStatusTick>[0]["status"]; deliveredAt?: string; readAt?: string }) {
  return render(<MessageStatusTick {...props} />);
}

describe("MessageStatusTick", () => {
  it("shows a single grey tick for sent", () => {
    const { container } = renderTick({ status: "sent" });
    const svg = container.querySelector("svg.lucide-check");
    expect(svg).not.toBeNull();
    expect(svg?.parentElement?.className).toContain("text-muted");
  });

  it("shows a double grey tick for delivered", () => {
    const { container } = renderTick({ status: "delivered" });
    const svg = container.querySelector("svg.lucide-check-check");
    expect(svg).not.toBeNull();
    expect(svg?.parentElement?.className).toContain("text-muted");
  });

  it("shows a double blue tick for read", () => {
    const { container } = renderTick({ status: "read" });
    const svg = container.querySelector("svg.lucide-check-check");
    expect(svg).not.toBeNull();
    expect(svg?.parentElement?.className).toContain("text-info");
  });

  it("labels the tooltip with the delivered time when delivered_at is present", async () => {
    const user = userEvent.setup();
    const { container } = renderTick({ status: "delivered", deliveredAt: "2026-08-13T08:10:00.000Z" });

    await user.hover(container.querySelector("svg") as Element);

    expect(await screen.findByText(/delivered at \d{1,2}:\d{2}/i)).toBeInTheDocument();
  });

  it("labels the tooltip with the read time when read_at is present", async () => {
    const user = userEvent.setup();
    const { container } = renderTick({ status: "read", readAt: "2026-08-13T08:11:00.000Z" });

    await user.hover(container.querySelector("svg") as Element);

    expect(await screen.findByText(/read at \d{1,2}:\d{2}/i)).toBeInTheDocument();
  });
});
