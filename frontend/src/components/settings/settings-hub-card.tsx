"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsCardProps {
  icon: LucideIcon;
  name: string;
  description: string;
  href: string;
  className?: string;
}

export function SettingsCard({ icon: Icon, name, description, href, className }: SettingsCardProps) {
  return (
    <a
      href={href}
      className={cn(
        "group flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-primary/40 hover:bg-bg/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-bg transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
          <Icon className="h-4 w-4 text-muted group-hover:text-primary transition-colors" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-text group-hover:text-primary transition-colors">{name}</h3>
          <p className="mt-0.5 text-sm text-muted line-clamp-2">{description}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border/70 px-2 py-1 transition-colors group-hover:border-primary/40 group-hover:bg-primary/5">
        <PathArrow className="h-4 w-4 text-muted group-hover:text-primary transition-colors" aria-hidden />
      </div>
    </a>
  );
}

export function SettingsSection({
  title,
  description,
  cards,
}: {
  title: string;
  description: string;
  cards: Array<{ icon: LucideIcon; name: string; description: string; href: string }>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <Settings2Icon className="h-5 w-5 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <SettingsCard key={card.href + card.name} {...card} />
        ))}
      </div>
    </section>
  );
}

export function PathArrow() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: "translateX(2px)" }}
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function Settings2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .36 1.05l.04.06a2 2 0 0 1 0 2.9l-.04.06a2 2 0 0 1-2.9 0l-.04-.06a2 2 0 0 1 0-2.9l.04-.06A1.65 1.65 0 0 0 19.4 9h-2.1c-2.3 0-4.5.8-6.3 2.1l-.7 1.1" />
      <path d="M4.6 15a1.65 1.65 0 0 0-.36 1.05l-.04.06a2 2 0 0 0 0 2.9l.04.06a2 2 0 0 0 2.9 0l.04-.06a2 2 0 0 0 0-2.9l-.04-.06A1.65 1.65 0 0 0 4.6 9h2.1c2.3 0 4.5.8 6.3 2.1l.7 1.1" />
    </svg>
  );
}
