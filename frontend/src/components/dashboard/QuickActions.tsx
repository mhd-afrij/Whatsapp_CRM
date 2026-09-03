"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, MessageCircle, Megaphone, Plus, Users, X } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

const ACTION_COLORS = [
  "bg-[var(--chart-series-1)]",
  "bg-[var(--chart-series-2)]",
  "bg-[var(--chart-series-3)]",
  "bg-[var(--chart-series-4)]",
  "bg-[var(--chart-series-6)]",
];

export function QuickActions() {
  const [open, setOpen] = useState(false);
  const canReply = usePermission("conversations.reply");
  const canCreateContacts = usePermission("contacts.create");
  const canManageLeads = usePermission("leads.manage");
  const canViewCampaigns = usePermission("campaigns.view");
  const canUseTemplates = usePermission("templates.use");

  const actions = [
    canReply ? { href: "/inbox", label: "New Chat", icon: MessageCircle } : null,
    canCreateContacts ? { href: "/contacts/new", label: "Add Contact", icon: Users } : null,
    canManageLeads ? { href: "/leads", label: "Create Deal", icon: Megaphone } : null,
    canViewCampaigns ? { href: "/campaigns", label: "Send Campaign", icon: Plus } : null,
    canUseTemplates ? { href: "/settings/templates", label: "Create Template", icon: FileText } : null,
  ].filter((action): action is { href: string; label: string; icon: typeof MessageCircle } => action != null);

  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
      {open && (
        <div className="flex flex-col items-end gap-2 animate-fade-up">
          {actions.map(({ href, label, icon: Icon }, index) => (
            <Link
              key={`${href}-${label}`}
              href={href}
              onClick={() => setOpen(false)}
              className="group flex items-center gap-2.5 rounded-full border border-border bg-surface py-2 pr-4 pl-2 shadow-xl transition hover:border-primary/40 hover:bg-card-2"
            >
              <span className="text-sm font-semibold text-text">{label}</span>
              <span className={cn("flex size-8 items-center justify-center rounded-full text-white", ACTION_COLORS[index % ACTION_COLORS.length])}>
                <Icon className="size-4" />
              </span>
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl text-white shadow-2xl transition-all duration-300 hover:scale-105",
          "bg-gradient-to-br from-primary to-emerald-500"
        )}
      >
        <Plus className={cn("size-6 transition-transform duration-300", open && "rotate-45")} />
      </button>

      {open && (
        <button
          type="button"
          aria-label="Close quick actions"
          onClick={() => setOpen(false)}
          className="fixed inset-0 -z-10 cursor-default bg-black/20 backdrop-blur-[1px]"
        >
          <X className="sr-only" />
        </button>
      )}
    </div>
  );
}