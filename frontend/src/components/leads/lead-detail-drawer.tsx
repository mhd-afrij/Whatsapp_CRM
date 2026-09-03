"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BedDouble,
  Bath,
  CalendarDays,
  ExternalLink,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  Ruler,
  Tag,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useLead } from "@/hooks/use-leads";
import { Avatar } from "@/components/ui/avatar";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  formatLastContact,
  KANBAN_PRIORITY_META,
  KANBAN_STATUS_META,
  serviceAccentTone,
} from "@/components/leads/kanban/lead-kanban-types";
import {
  leadDisplayName,
  leadLocation,
  leadRequirementText,
  leadRequirementVisual,
  leadScorePriority,
  leadStageStatus,
} from "@/lib/lead-mapping";
import type { Lead } from "@/lib/leads-api";

interface LeadDetailDrawerProps {
  leadId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-0.5 break-words text-sm text-text">{value}</p>
      </div>
    </div>
  );
}

function budgetLabel(lead: Lead): string | null {
  const min = lead.budget_min;
  const max = lead.budget_max;
  if (min === null && max === null) return null;
  if (min !== null && max !== null && String(min) === String(max)) return String(min);
  return [min, max].filter((value) => value !== null && String(value) !== "").join(" – ");
}

export function LeadDetailDrawer({ leadId, open, onOpenChange }: LeadDetailDrawerProps) {
  const { data: lead, isLoading, isError } = useLead(leadId ?? 0);
  const name = lead ? leadDisplayName(lead) : leadId ? `Lead #${leadId}` : "Lead details";
  const status = lead ? leadStageStatus(lead.stage) : null;
  const statusMeta = status ? KANBAN_STATUS_META[status] : null;
  const priority = lead ? leadScorePriority(lead.score) : null;
  const priorityMeta = priority ? KANBAN_PRIORITY_META[priority] : null;
  const visual = lead ? leadRequirementVisual(lead) : null;
  const accent = lead && visual ? serviceAccentTone(visual.accent) : null;
  const RequirementIcon = visual?.icon ?? Home;
  const lastContact = lead
    ? lead.conversation?.last_message_at ?? lead.contact?.last_contacted_at ?? null
    : null;
  const conversationHref = lead
    ? lead.conversation
      ? `/inbox/${lead.conversation.id}`
      : `/inbox?contact=${lead.contact_id}`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full overflow-y-auto border-l border-border bg-surface p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border bg-surface px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-left text-lg">Lead details</SheetTitle>
              <p className="mt-1 text-xs text-muted">
                Review the pipeline record without leaving this workspace.
              </p>
            </div>
            <SheetClose className="rounded-lg p-2 text-muted hover:bg-bg hover:text-text">
              <X className="size-4" />
            </SheetClose>
          </div>
        </SheetHeader>

        {isLoading && (
          <div className="space-y-3 p-5">
            <div className="h-24 animate-pulse rounded-2xl bg-border/60" />
            <div className="h-36 animate-pulse rounded-2xl bg-border/60" />
            <div className="h-36 animate-pulse rounded-2xl bg-border/60" />
          </div>
        )}

        {isError && (
          <div className="p-5 text-sm text-danger">Unable to load this lead&apos;s details.</div>
        )}

        {!isLoading && !isError && lead && (
          <div className="space-y-4 p-5">
            {/* identity */}
            <section className="rounded-2xl border border-border bg-bg p-4">
              <div className="flex items-center gap-3">
                <Avatar name={name} size="lg" />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-text">{name}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {lead.source ? `Source · ${lead.source}` : "CRM lead"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {statusMeta && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                      statusMeta.pill
                    )}
                  >
                    {statusMeta.label}
                  </span>
                )}
                {priorityMeta && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      priorityMeta.chip
                    )}
                  >
                    <priorityMeta.icon className="size-3" />
                    {priorityMeta.label}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted">
                  Score {lead.score}
                </span>
              </div>
            </section>

            {/* requirement */}
            {accent && (
              <section
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3",
                  accent.panel
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    accent.box
                  )}
                >
                  <RequirementIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                    Requirement
                  </p>
                  <p className="truncate text-sm font-semibold text-text">
                    {leadRequirementText(lead)}
                  </p>
                </div>
              </section>
            )}

            {/* details */}
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Details</h3>
              <div className="grid gap-4">
                {lead.contact?.phone_number && (
                  <DetailRow icon={Phone} label="Phone" value={lead.contact.phone_number} />
                )}
                {leadLocation(lead) && (
                  <DetailRow icon={MapPin} label="Location" value={leadLocation(lead) ?? ""} />
                )}
                {lead.property_type && (
                  <DetailRow
                    icon={Ruler}
                    label="Property type"
                    value={String(lead.property_type)}
                  />
                )}
                {budgetLabel(lead) && (
                  <DetailRow icon={Wallet} label="Budget" value={budgetLabel(lead) ?? ""} />
                )}
                {(lead.bedrooms !== null || lead.bathrooms !== null) && (
                  <div className="flex items-start gap-3">
                    <Home className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                        Specs
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5 text-sm text-text">
                        {lead.bedrooms !== null && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-bg px-2 py-0.5">
                            <BedDouble className="size-3.5 text-muted" />
                            {lead.bedrooms} bed
                          </span>
                        )}
                        {lead.bathrooms !== null && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-bg px-2 py-0.5">
                            <Bath className="size-3.5 text-muted" />
                            {lead.bathrooms} bath
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
                {lead.owner && <DetailRow icon={UserRound} label="Assigned" value={lead.owner.name} />}
                {lastContact && (
                  <DetailRow
                    icon={CalendarDays}
                    label="Last contacted"
                    value={formatLastContact(lastContact) ?? ""}
                  />
                )}
                <DetailRow
                  icon={CalendarDays}
                  label="Added"
                  value={new Date(lead.created_at).toLocaleDateString()}
                />
              </div>
            </section>

            {/* WhatsApp conversation */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
                <MessageCircle className="size-3.5" /> WhatsApp
              </h3>
              <p className="mt-2 line-clamp-2 text-sm text-text">
                {lead.conversation?.last_message_preview ||
                  lead.contact?.phone_number ||
                  "No conversation on record."}
              </p>
              {lead.conversation && lead.conversation.unread_count > 0 && (
                <p className="mt-1.5 text-xs font-semibold text-success">
                  {lead.conversation.unread_count} unread message
                  {lead.conversation.unread_count === 1 ? "" : "s"}
                </p>
              )}
            </section>

            {/* notes */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Notes</h3>
              <p className="mt-2 text-sm whitespace-pre-wrap text-text">
                {lead.notes || "No notes added yet."}
              </p>
            </section>

            {/* labels */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
                <Tag className="size-3.5" /> Labels
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {lead.labels.length > 0 ? (
                  lead.labels.map((label) => (
                    <span
                      key={label.id}
                      className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-text"
                    >
                      {label.name}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-muted">No labels assigned.</p>
                )}
              </div>
            </section>

            {/* actions */}
            <div className="flex gap-2">
              <Link
                href={`/leads/${lead.id}`}
                onClick={() => onOpenChange(false)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                <ExternalLink className="size-4" />
                Open lead page
              </Link>
              {conversationHref && (
                <Link
                  href={conversationHref}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-text hover:bg-bg"
                >
                  <MessageCircle className="size-4" />
                  Open chat
                </Link>
              )}
              {lead.contact && (
                <Link
                  href={`/contacts/${lead.contact_id}`}
                  onClick={() => onOpenChange(false)}
                  aria-label="Open contact profile"
                  className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2.5 text-muted hover:bg-bg hover:text-text"
                >
                  <ArrowUpRight className="size-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
