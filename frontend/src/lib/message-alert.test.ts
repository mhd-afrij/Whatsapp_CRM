import { describe, expect, it } from "vitest";
import type { Conversation } from "./conversations-api";
import {
  NEW_MESSAGE_ALERT_THROTTLE_MS,
  contactNameFor,
  conversationIdOf,
  decideAlert,
  resolveActiveConversationId,
  type MessageAlertInput,
} from "./message-alert";

function makeMessage(overrides: Partial<MessageAlertInput["message"]> = {}): MessageAlertInput["message"] {
  return {
    id: 1,
    conversationId: 42,
    conversation_id: undefined,
    direction: "inbound",
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 42,
    workspace_id: 1,
    status: "open",
    priority: "normal",
    unread_count: 0,
    last_message_at: null,
    last_message_preview: null,
    assigned_user_id: 7,
    assigned_team_id: null,
    archived_at: null,
    pinned_at: null,
    muted_until: null,
    starred_at: null,
    blocked_at: null,
    reported_at: null,
    whatsapp_contact: {
      id: 1,
      wa_jid: "15550000000@s.whatsapp.net",
      push_name: "Push Name",
      contact_name: null,
      phone_number: "15550000000",
      profile_picture_url: null,
    },
    contact: null,
    assigned_user: null,
    assigned_team: null,
    labels: [],
    deal: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<MessageAlertInput> = {}): MessageAlertInput {
  return {
    message: makeMessage(),
    conversation: makeConversation(),
    currentUserId: 7,
    inAppEnabled: true,
    activeConversationId: null,
    ...overrides,
  };
}

describe("conversationIdOf", () => {
  it("reads the camelCase conversationId", () => {
    expect(conversationIdOf(makeMessage({ conversationId: 5 }))).toBe(5);
  });

  it("falls back to the snake_case conversation_id", () => {
    expect(
      conversationIdOf(makeMessage({ conversationId: undefined, conversation_id: 9 }))
    ).toBe(9);
  });

  it("returns undefined when neither field is set", () => {
    expect(
      conversationIdOf(makeMessage({ conversationId: undefined, conversation_id: undefined }))
    ).toBeUndefined();
  });
});

describe("decideAlert", () => {
  it("never alerts for outgoing messages", () => {
    const decision = decideAlert(makeInput({ message: makeMessage({ direction: "outbound" }) }));
    expect(decision).toEqual({ alert: false, reason: "not_inbound" });
  });

  it("skips the conversation currently being viewed", () => {
    const decision = decideAlert(
      makeInput({
        activeConversationId: 42,
        conversation: makeConversation({ id: 42 }),
      })
    );
    expect(decision).toEqual({ alert: false, reason: "active_conversation" });
  });

  it("skips when the in-app preference is disabled", () => {
    const decision = decideAlert(makeInput({ inAppEnabled: false }));
    expect(decision).toEqual({ alert: false, reason: "preference_disabled" });
  });

  it("skips when the conversation could not be resolved", () => {
    const decision = decideAlert(makeInput({ conversation: undefined }));
    expect(decision).toEqual({ alert: false, reason: "unknown_conversation" });
  });

  it("skips when the conversation is assigned to someone else", () => {
    const decision = decideAlert(
      makeInput({
        currentUserId: 1,
        conversation: makeConversation({ assigned_user_id: 99 }),
      })
    );
    expect(decision).toEqual({ alert: false, reason: "not_assigned_to_me" });
  });

  it("skips unassigned conversations", () => {
    const decision = decideAlert(
      makeInput({ conversation: makeConversation({ assigned_user_id: null }) })
    );
    expect(decision).toEqual({ alert: false, reason: "not_assigned_to_me" });
  });

  it("skips muted conversations while muted_until is in the future", () => {
    const decision = decideAlert(
      makeInput({
        conversation: makeConversation({ muted_until: new Date(Date.now() + 60_000).toISOString() }),
      })
    );
    expect(decision).toEqual({ alert: false, reason: "muted" });
  });

  it("alerts once the mute has expired", () => {
    const decision = decideAlert(
      makeInput({
        conversation: makeConversation({ muted_until: new Date(Date.now() - 60_000).toISOString() }),
      })
    );
    expect(decision).toEqual({ alert: true });
  });

  it("alerts for an inbound message assigned to me in a conversation I am not viewing", () => {
    const decision = decideAlert(makeInput());
    expect(decision).toEqual({ alert: true });
  });

  it("alerts even when the message carries no conversation id", () => {
    const decision = decideAlert(
      makeInput({
        message: makeMessage({ conversationId: undefined, conversation_id: undefined }),
        activeConversationId: null,
      })
    );
    expect(decision).toEqual({ alert: true });
  });
});

describe("resolveActiveConversationId", () => {
  it("returns null for the inbox list view", () => {
    expect(resolveActiveConversationId("/inbox")).toBeNull();
    expect(resolveActiveConversationId("/inbox/")).toBeNull();
  });

  it("extracts the id from a conversation route", () => {
    expect(resolveActiveConversationId("/inbox/123")).toBe(123);
    expect(resolveActiveConversationId("/inbox/1234/messages")).toBe(1234);
  });

  it("returns null for unrelated routes", () => {
    expect(resolveActiveConversationId("/dashboard")).toBeNull();
    expect(resolveActiveConversationId("/inbox-archive/5")).toBeNull();
  });
});

describe("contactNameFor", () => {
  it("prefers the saved contact name over the push name", () => {
    const conversation = makeConversation({
      whatsapp_contact: { ...makeConversation().whatsapp_contact!, contact_name: "Saved Name" },
    });
    expect(contactNameFor(conversation)).toBe("Saved Name");
  });

  it("falls back to the push name when no saved name exists", () => {
    const conversation = makeConversation({
      whatsapp_contact: { ...makeConversation().whatsapp_contact!, contact_name: null },
    });
    expect(contactNameFor(conversation)).toBe("Push Name");
  });

  it("falls back to the CRM contact full name", () => {
    const conversation = makeConversation({
      whatsapp_contact: null,
      contact: { id: 1, full_name: "Jane Doe", email: null, phone_number: null },
    });
    expect(contactNameFor(conversation)).toBe("Jane Doe");
  });

  it("returns a generic label when no name is available", () => {
    expect(contactNameFor(undefined)).toBe("New WhatsApp message");
    expect(contactNameFor(makeConversation({ whatsapp_contact: null, contact: null }))).toBe(
      "New WhatsApp message"
    );
  });
});

describe("NEW_MESSAGE_ALERT_THROTTLE_MS", () => {
  it("throttles alerts to once per 10 seconds per conversation", () => {
    expect(NEW_MESSAGE_ALERT_THROTTLE_MS).toBe(10_000);
  });
});