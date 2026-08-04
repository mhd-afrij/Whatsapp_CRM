"use client";

import { useCallback, useEffect, useState } from "react";

export interface ComposerDraft {
  body: string;
  mode: "reply" | "note";
}

const EMPTY_DRAFT: ComposerDraft = { body: "", mode: "reply" };
const STORAGE_PREFIX = "crm.composer-draft.";
const DEBOUNCE_MS = 300;

function readDraft(conversationId: number): ComposerDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${conversationId}`);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<ComposerDraft>;
    return {
      body: typeof parsed.body === "string" ? parsed.body : "",
      mode: parsed.mode === "note" ? "note" : "reply",
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

/**
 * Persists an in-progress composer message per conversation so switching
 * conversations (or a page refresh) doesn't lose unsent text - mirrors how
 * WhatsApp itself never discards a drafted message. Cleared on send.
 */
export function useComposerDraft(conversationId: number | null) {
  // Reset-on-prop-change via a render-time comparison (React's endorsed pattern for
  // "adjusting state when a prop changes") rather than an effect, since setState-in-effect
  // just to re-derive from a prop causes an extra render pass for no benefit here.
  const [loadedForId, setLoadedForId] = useState<number | null>(null);
  const [draft, setDraftState] = useState<ComposerDraft>(EMPTY_DRAFT);

  if (conversationId !== loadedForId) {
    setLoadedForId(conversationId);
    setDraftState(conversationId ? readDraft(conversationId) : EMPTY_DRAFT);
  }

  useEffect(() => {
    if (!conversationId || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const key = `${STORAGE_PREFIX}${conversationId}`;
      if (!draft.body.trim()) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(draft));
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [conversationId, draft]);

  const setDraft = useCallback((next: Partial<ComposerDraft>) => {
    setDraftState((current) => ({ ...current, ...next }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraftState(EMPTY_DRAFT);
    if (conversationId && typeof window !== "undefined") {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${conversationId}`);
    }
  }, [conversationId]);

  return { draft, setDraft, clearDraft };
}
