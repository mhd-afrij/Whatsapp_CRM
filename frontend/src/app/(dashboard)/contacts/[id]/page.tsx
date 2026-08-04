"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, RotateCcw } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/context/auth-context";
import { useContact, useUpdateContact, useArchiveContact, useRestoreContact } from "@/hooks/use-contacts";
import { useConvertContactToLead } from "@/hooks/use-leads";
import { ContactForm } from "@/components/contacts/contact-form";
import { LabelPicker } from "@/components/labels/label-picker";
import { ApiError } from "@/lib/api-client";
import type { ContactFormValues } from "@/lib/contacts-api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function ContactProfile({ id }: { id: number }) {
  const router = useRouter();
  const { data: contact, isLoading, isError } = useContact(id);
  const updateMutation = useUpdateContact(id);
  const archiveMutation = useArchiveContact();
  const restoreMutation = useRestoreContact();
  const convertMutation = useConvertContactToLead();

  const { user } = useAuth();
  const hasBlanketEdit = usePermission("contacts.edit");
  const canCreate = usePermission("contacts.create");
  const isOwner = !!contact && contact.owner_user_id != null && Number(user?.id) === contact.owner_user_id;
  const canEdit = hasBlanketEdit || (isOwner && canCreate);
  const canDelete = usePermission("contacts.delete");
  const canManageLeads = usePermission("leads.manage");

  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (isError || !contact) {
    return <p className="text-sm text-danger">Unable to load this contact. It may not exist or you may lack access.</p>;
  }

  const onSubmit = async (values: ContactFormValues) => {
    setFormError(null);
    try {
      await updateMutation.mutateAsync(values);
      setEditing(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to update contact.");
    }
  };

  const onArchive = async () => {
    if (!window.confirm("Archive this contact? You can restore it later from the archived state.")) return;
    setActionError(null);
    try {
      await archiveMutation.mutateAsync(contact.id);
      router.push("/contacts");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to archive contact.");
    }
  };

  const onRestore = async () => {
    setActionError(null);
    try {
      await restoreMutation.mutateAsync(contact.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to restore contact.");
    }
  };

  const onConvertToLead = async () => {
    setActionError(null);
    try {
      const lead = await convertMutation.mutateAsync(contact.id);
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to convert contact to a lead.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to contacts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">{contact.full_name || "(no name)"}</h1>
          {contact.deleted_at && (
            <p className="mt-1 text-xs font-medium text-warning">Archived on {formatDate(contact.deleted_at)}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canManageLeads && !contact.deleted_at && (
            <button
              type="button"
              onClick={onConvertToLead}
              disabled={convertMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-primary-soft/40 disabled:opacity-60"
            >
              {convertMutation.isPending ? "Converting…" : "Convert to lead"}
            </button>
          )}
          {canDelete && !contact.deleted_at && (
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
          )}
          {canDelete && contact.deleted_at && (
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-success hover:bg-success/10"
            >
              <RotateCcw className="h-4 w-4" /> Restore
            </button>
          )}
          {canEdit && !editing && !contact.deleted_at && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Labels</h2>
        <LabelPicker
          entity="contacts"
          entityId={contact.id}
          currentLabels={contact.labels}
          canEdit={canEdit}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text">CRM details</h2>
          {editing ? (
            <ContactForm
              defaultValues={{
                full_name: contact.full_name ?? "",
                email: contact.email ?? "",
                company: contact.company ?? "",
                job_title: contact.job_title ?? "",
                phone_number: contact.phone_number ?? "",
              }}
              onSubmit={onSubmit}
              submitLabel="Save changes"
              serverError={formError}
            />
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="text-text">{contact.email || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Phone</dt><dd className="text-text">{contact.phone_number || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Company</dt><dd className="text-text">{contact.company || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Job title</dt><dd className="text-text">{contact.job_title || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Owner</dt><dd className="text-text">{contact.owner?.name || "Unassigned"}</dd></div>
            </dl>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text">WhatsApp profile</h2>
          {contact.whatsapp_contact ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Display name</dt><dd className="text-text">{contact.whatsapp_contact.push_name || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Number</dt><dd className="text-text">{contact.whatsapp_contact.phone_number || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Business account</dt><dd className="text-text">{contact.whatsapp_contact.is_business ? "Yes" : "No"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Last seen</dt><dd className="text-text">{formatDate(contact.whatsapp_contact.last_seen_at)}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-muted">Not linked to a WhatsApp contact yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text">Conversation history</h2>
          {contact.conversations && contact.conversations.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {contact.conversations.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <Link href={`/inbox/${c.id}`} className="truncate text-primary hover:underline">
                    {c.last_message_preview || `Conversation #${c.id}`}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{c.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No conversations yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold text-text">Activity timeline</h2>
          {contact.activities && contact.activities.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {contact.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-primary-soft pl-3">
                  <p className="text-text">{a.description || a.activity_type}</p>
                  <p className="text-xs text-muted">{formatDate(a.occurred_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No activity recorded yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-text">Leads &amp; deals</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted">Leads</p>
              {contact.leads && contact.leads.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {contact.leads.map((l) => (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className="text-primary hover:underline">
                        #{l.id}
                      </Link>{" "}
                      — {l.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No leads yet.
                  {canManageLeads && !contact.deleted_at && (
                    <>
                      {" "}
                      <button type="button" onClick={onConvertToLead} className="text-primary hover:underline">
                        Convert this contact now
                      </button>
                      .
                    </>
                  )}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted">Deals</p>
              {contact.deals && contact.deals.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {contact.deals.map((d) => (
                    <li key={d.id}>
                      <Link href={`/deals/${d.id}`} className="text-primary hover:underline">
                        {d.title}
                      </Link>{" "}
                      — {d.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No deals yet.{" "}
                  <Link href="/pipeline" className="text-primary hover:underline">
                    Create one from the pipeline board
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  return (
    <RequirePermission permission="contacts.view">
      <ContactProfile id={id} />
    </RequirePermission>
  );
}
