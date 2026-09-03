"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGlobalKeyboardShortcuts, registerShortcut } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardHelpModal } from "@/components/common/keyboard-help-modal";

interface KeyboardShortcutsContextValue {
  openHelp: () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | undefined>(undefined);

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Register default navigation shortcuts
  useMemo(() => {
    registerShortcut({
      id: "nav-dashboard",
      keys: ["g", "D"],
      label: "Go to Dashboard",
      category: "Navigation",
      action: () => router.push("/dashboard"),
    });
    registerShortcut({
      id: "nav-inbox",
      keys: ["g", "I"],
      label: "Go to Inbox",
      category: "Navigation",
      action: () => router.push("/inbox"),
    });
    registerShortcut({
      id: "nav-contacts",
      keys: ["g", "C"],
      label: "Go to Contacts",
      category: "Navigation",
      action: () => router.push("/contacts"),
    });
    registerShortcut({
      id: "nav-settings",
      keys: ["g", "S"],
      label: "Go to Settings",
      category: "Navigation",
      action: () => router.push("/settings"),
    });
    registerShortcut({
      id: "nav-tasks",
      keys: ["g", "T"],
      label: "Go to Tasks",
      category: "Navigation",
      action: () => router.push("/tasks"),
    });
    registerShortcut({
      id: "search-global",
      keys: ["/"],
      label: "Focus search",
      category: "Actions",
      action: () => {
        const searchInput = document.querySelector<HTMLInputElement>('[aria-label="Global search"]');
        searchInput?.focus();
      },
    });
  }, [router]);

  useGlobalKeyboardShortcuts(openHelp);

  const value = useMemo(() => ({ openHelp }), [openHelp]);

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
      <KeyboardHelpModal open={helpOpen} onClose={closeHelp} />
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts() {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error("useKeyboardShortcuts must be used within a KeyboardShortcutsProvider");
  }
  return ctx;
}
