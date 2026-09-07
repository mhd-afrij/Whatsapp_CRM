import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncStatusCard } from "./sync-status-card";
import type { WhatsappSyncStatus } from "@/lib/whatsapp-api";

function makeSync(overrides: Partial<WhatsappSyncStatus>): WhatsappSyncStatus {
  return {
    state: "completed",
    startedAt: "2026-09-01T08:00:00.000Z",
    completedAt: "2026-09-01T08:00:05.000Z",
    updatedAt: "2026-09-01T08:00:05.000Z",
    totalMessages: 120,
    totalConversations: 14,
    processedMessages: 115,
    failedMessages: 0,
    duplicateMessages: 5,
    skippedMessages: 0,
    progress: 100,
    syncType: "0",
    error: null,
    ...overrides,
  };
}

describe("SyncStatusCard", () => {
  it("renders nothing when no sync run has ever happened", () => {
    const { container } = render(<SyncStatusCard sync={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows live progress while a sync is running", () => {
    render(
      <SyncStatusCard
        sync={makeSync({
          state: "syncing",
          totalMessages: 200,
          processedMessages: 50,
          duplicateMessages: 10,
          failedMessages: 0,
          skippedMessages: 0,
          progress: 30,
        })}
      />
    );

    expect(screen.getByText("Importing chat history")).toBeInTheDocument();
    expect(screen.getByText(/60 of 200 messages imported/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "30");
  });

  it("summarizes a completed import with duplicates skipped", () => {
    render(<SyncStatusCard sync={makeSync({})} />);

    expect(screen.getByText("History import complete")).toBeInTheDocument();
    expect(
      screen.getByText(/14 chats and 120 messages are available in the inbox/)
    ).toBeInTheDocument();
    expect(screen.getByText("115 imported")).toBeInTheDocument();
    expect(screen.getByText("5 duplicates skipped")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("surfaces failures with an error message", () => {
    render(
      <SyncStatusCard
        sync={makeSync({
          state: "failed",
          error: "WhatsApp connection lost mid-import",
          failedMessages: 3,
          processedMessages: 10,
          totalMessages: 40,
        })}
      />
    );

    expect(screen.getByText("History import failed")).toBeInTheDocument();
    expect(
      screen.getByText(/WhatsApp connection lost mid-import/)
    ).toBeInTheDocument();
    expect(screen.getByText("3 failed")).toBeInTheDocument();
  });
});
