"use client";

import { useCallback, useEffect, useRef } from "react";

export interface KeyboardShortcut {
  id: string;
  keys: string[];
  label: string;
  category: string;
  action: () => void;
  /** When true, the shortcut is disabled (e.g. while typing in an input). */
  enabled?: boolean;
}

const shortcutsRef: KeyboardShortcut[] = [];

export function registerShortcut(shortcut: KeyboardShortcut) {
  const existing = shortcutsRef.find((s) => s.id === shortcut.id);
  if (existing) {
    Object.assign(existing, shortcut);
  } else {
    shortcutsRef.push(shortcut);
  }
}

export function unregisterShortcut(id: string) {
  const index = shortcutsRef.findIndex((s) => s.id === id);
  if (index >= 0) {
    shortcutsRef.splice(index, 1);
  }
}

export function getRegisteredShortcuts(): KeyboardShortcut[] {
  return shortcutsRef.filter((s) => s.enabled !== false);
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}

function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (e.key && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  }
  return parts.join("+");
}

/**
 * Global keyboard shortcut listener. Mount once at the app root.
 * Calls `onHelp` when the user presses "?" to open the help modal.
 */
export function useGlobalKeyboardShortcuts(onHelp?: () => void) {
  const onHelpRef = useRef(onHelp);

  // Update ref in effect to avoid ref mutation during render
  useEffect(() => {
    onHelpRef.current = onHelp;
  }, [onHelp]);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      // "?" opens help — always allowed
      if (e.key === "?" && !isInputFocused()) {
        e.preventDefault();
        onHelpRef.current?.();
        return;
      }

      // Don't intercept when typing in form fields
      if (isInputFocused()) return;

      const normalized = normalizeKey(e);

      for (const shortcut of shortcutsRef) {
        if (shortcut.enabled === false) continue;
        const shortcutKey = shortcut.keys.join("+");
        if (shortcutKey === normalized) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);
}
