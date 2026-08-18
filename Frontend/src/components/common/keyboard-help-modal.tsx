"use client";

import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRegisteredShortcuts, type KeyboardShortcut } from "@/hooks/use-keyboard-shortcuts";

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-border bg-bg px-1.5",
        "font-mono text-[11px] font-medium text-muted"
      )}
    >
      {children}
    </kbd>
  );
}

function groupByCategory(shortcuts: KeyboardShortcut[]): Record<string, KeyboardShortcut[]> {
  const groups: Record<string, KeyboardShortcut[]> = {};
  for (const s of shortcuts) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }
  return groups;
}

export function KeyboardHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  // Read shortcuts at render time — the registry is a stable module-level array
  const shortcuts = getRegisteredShortcuts();
  const groups = groupByCategory(shortcuts);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-text">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted hover:bg-bg hover:text-text"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {Object.entries(groups).length === 0 ? (
            <p className="text-sm text-muted">No keyboard shortcuts registered.</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(groups).map(([category, items]) => (
                <div key={category}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {items.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5"
                      >
                        <span className="text-sm text-text">{shortcut.label}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-[10px] text-muted">+</span>}
                              <Kbd>{key}</Kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border px-5 py-3 text-center">
          <p className="text-xs text-muted">
            Press <Kbd>?</Kbd> anywhere to open this panel
          </p>
        </div>
      </div>
    </div>
  );
}
