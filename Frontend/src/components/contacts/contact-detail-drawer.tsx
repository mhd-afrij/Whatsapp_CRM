"use client";

import Link from "next/link";
import { Building2, CalendarDays, ExternalLink, Mail, MapPin, Phone, Tag, UserRound, X } from "lucide-react";
import { useContact } from "@/hooks/use-contacts";
import { Avatar } from "@/components/ui/avatar";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface ContactDetailDrawerProps {
  contactId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-muted" /><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-0.5 break-words text-sm text-text">{value}</p></div></div>;
}

export function ContactDetailDrawer({ contactId, open, onOpenChange }: ContactDetailDrawerProps) {
  const { data: contact, isLoading, isError } = useContact(contactId ?? 0);
  const name = contact?.full_name || contact?.phone_number || (contactId ? `Contact #${contactId}` : "Contact details");

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto border-l border-border bg-surface p-0 sm:max-w-md">
      <SheetHeader className="border-b border-border bg-surface px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div><SheetTitle className="text-left text-lg">Contact details</SheetTitle><p className="mt-1 text-xs text-muted">Review the CRM profile without leaving this workspace.</p></div>
          <SheetClose className="rounded-lg p-2 text-muted hover:bg-bg hover:text-text"><X className="size-4" /></SheetClose>
        </div>
      </SheetHeader>
      {isLoading && <div className="space-y-3 p-5"><div className="h-24 animate-pulse rounded-2xl bg-border/60" /><div className="h-36 animate-pulse rounded-2xl bg-border/60" /><div className="h-36 animate-pulse rounded-2xl bg-border/60" /></div>}
      {isError && <div className="p-5 text-sm text-danger">Unable to load this contact&apos;s details.</div>}
      {!isLoading && !isError && contact && <div className="space-y-4 p-5">
        <section className="rounded-2xl border border-border bg-bg p-4"><div className="flex items-center gap-3"><Avatar name={name} size="lg" /><div className="min-w-0"><h2 className="truncate text-base font-semibold text-text">{name}</h2><p className="mt-0.5 text-xs text-muted">{contact.source || "CRM contact"}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${contact.status === "active" ? "bg-success/10 text-success" : "bg-muted/10 text-muted"}`}>{contact.status}</span><span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold capitalize text-primary-dark">{contact.priority} priority</span></div></section>
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Profile</h3><div className="grid gap-4">{contact.phone_number && <DetailRow icon={Phone} label="Phone" value={contact.phone_number} />}{contact.email && <DetailRow icon={Mail} label="Email" value={contact.email} />}{contact.company && <DetailRow icon={Building2} label="Company" value={contact.job_title ? `${contact.job_title}, ${contact.company}` : contact.company} />}{(contact.city || contact.country) && <DetailRow icon={MapPin} label="Location" value={[contact.city, contact.country].filter(Boolean).join(", ")} />}<DetailRow icon={CalendarDays} label="Added" value={new Date(contact.created_at).toLocaleDateString()} />{contact.owner && <DetailRow icon={UserRound} label="Owner" value={contact.owner.name} />}</div></section>
        <section className="rounded-2xl border border-border bg-surface p-4"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Tag className="size-3.5" /> Labels</h3><div className="mt-3 flex flex-wrap gap-2">{contact.labels.length > 0 ? contact.labels.map((label) => <span key={label.id} className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-text">{label.name}</span>) : <p className="text-sm text-muted">No labels assigned.</p>}</div></section>
        <section className="rounded-2xl border border-border bg-surface p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Activity snapshot</h3><div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-bg p-3"><p className="text-xl font-semibold text-text">{contact.conversations?.length ?? 0}</p><p className="text-[11px] text-muted">Conversations</p></div><div className="rounded-xl bg-bg p-3"><p className="text-xl font-semibold text-text">{contact.deals?.length ?? 0}</p><p className="text-[11px] text-muted">Deals</p></div></div></section>
        <div className="flex gap-2"><Link href={`/contacts/${contact.id}`} onClick={() => onOpenChange(false)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"><ExternalLink className="size-4" />Open full profile</Link>{contact.conversations?.[0] && <Link href={`/inbox/${contact.conversations[0].id}`} onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-text hover:bg-bg" aria-label="Open latest conversation"><Phone className="size-4" /></Link>}</div>
      </div>}
    </SheetContent>
  </Sheet>;
}
