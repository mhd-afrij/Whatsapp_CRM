import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageReactions, summarizeReactions } from "./message-reactions";

describe("summarizeReactions", () => {
  it("groups identical emojis and sorts by count first", () => {
    const summary = summarizeReactions([
      { id: 1, message_id: 10, whatsapp_contact_id: null, user_id: 4, emoji: "👍", reacted_at: "2026-08-05T00:00:00Z" },
      { id: 2, message_id: 10, whatsapp_contact_id: null, user_id: 5, emoji: "😂", reacted_at: "2026-08-05T00:01:00Z" },
      { id: 3, message_id: 10, whatsapp_contact_id: null, user_id: 6, emoji: "👍", reacted_at: "2026-08-05T00:02:00Z" },
    ]);

    expect(summary).toEqual([
      { emoji: "👍", count: 2 },
      { emoji: "😂", count: 1 },
    ]);
  });
});

describe("MessageReactions", () => {
  it("renders reaction chips for a message", () => {
    render(
      <MessageReactions
        reactions={[
          { id: 1, message_id: 10, whatsapp_contact_id: null, user_id: 4, emoji: "🔥", reacted_at: "2026-08-05T00:00:00Z" },
          { id: 2, message_id: 10, whatsapp_contact_id: null, user_id: 5, emoji: "🔥", reacted_at: "2026-08-05T00:01:00Z" },
        ]}
      />
    );

    expect(screen.getByText("🔥")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
