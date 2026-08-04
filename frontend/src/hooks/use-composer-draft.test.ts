import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useComposerDraft } from "./use-composer-draft";

describe("useComposerDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts empty for a conversation with no saved draft", () => {
    const { result } = renderHook(() => useComposerDraft(1));
    expect(result.current.draft).toEqual({ body: "", mode: "reply" });
  });

  it("persists the body to localStorage (debounced) and restores it on remount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, unmount } = renderHook(() => useComposerDraft(1));

    act(() => {
      result.current.setDraft({ body: "hello there" });
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(window.localStorage.getItem("crm.composer-draft.1")).toContain("hello there");
    unmount();
    vi.useRealTimers();

    const { result: remounted } = renderHook(() => useComposerDraft(1));
    await waitFor(() => expect(remounted.current.draft.body).toBe("hello there"));
  });

  it("keeps drafts isolated per conversation", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(({ id }) => useComposerDraft(id), {
      initialProps: { id: 1 },
    });

    act(() => result.current.setDraft({ body: "draft for convo 1" }));
    await act(async () => vi.advanceTimersByTime(400));

    rerender({ id: 2 });
    expect(result.current.draft.body).toBe("");

    act(() => result.current.setDraft({ body: "draft for convo 2" }));
    await act(async () => vi.advanceTimersByTime(400));

    rerender({ id: 1 });
    await waitFor(() => expect(result.current.draft.body).toBe("draft for convo 1"));

    vi.useRealTimers();
  });

  it("clearDraft empties state and removes the stored entry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useComposerDraft(1));

    act(() => result.current.setDraft({ body: "will be cleared" }));
    await act(async () => vi.advanceTimersByTime(400));
    expect(window.localStorage.getItem("crm.composer-draft.1")).not.toBeNull();

    act(() => result.current.clearDraft());

    expect(result.current.draft).toEqual({ body: "", mode: "reply" });
    expect(window.localStorage.getItem("crm.composer-draft.1")).toBeNull();
    vi.useRealTimers();
  });

  it("does not persist an empty/whitespace-only draft", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useComposerDraft(1));

    act(() => result.current.setDraft({ body: "   " }));
    await act(async () => vi.advanceTimersByTime(400));

    expect(window.localStorage.getItem("crm.composer-draft.1")).toBeNull();
    vi.useRealTimers();
  });
});
