"use client";

import { cn } from "@/lib/utils";

export interface SettingsTabDef {
  key: string;
  label: string;
}

export function SettingsTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SettingsTabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted hover:bg-bg hover:text-text"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
