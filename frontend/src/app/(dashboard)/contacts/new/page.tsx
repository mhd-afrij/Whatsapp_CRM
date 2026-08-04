"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { ContactForm } from "@/components/contacts/contact-form";
import { useCreateContact } from "@/hooks/use-contacts";
import { ApiError } from "@/lib/api-client";
import type { ContactFormValues } from "@/lib/contacts-api";

function NewContactContent() {
  const router = useRouter();
  const createMutation = useCreateContact();
  const [error, setError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const onSubmit = async (values: ContactFormValues) => {
    setError(null);
    setDuplicateNotice(null);
    try {
      const result = await createMutation.mutateAsync(values);
      if (result.duplicate_of) {
        setDuplicateNotice(
          `Heads up: this phone number matches an existing contact (#${result.duplicate_of.id}${
            result.duplicate_of.full_name ? `, ${result.duplicate_of.full_name}` : ""
          }). Both contacts were kept — merge manually if needed.`
        );
      }
      router.push(`/contacts/${result.contact.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create contact.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to contacts
      </Link>
      <h1 className="text-2xl font-semibold text-text">New contact</h1>
      {duplicateNotice && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">{duplicateNotice}</p>
      )}
      <div className="rounded-lg border border-border bg-surface p-6">
        <ContactForm onSubmit={onSubmit} submitLabel="Create contact" serverError={error} />
      </div>
    </div>
  );
}

export default function NewContactPage() {
  return (
    <RequirePermission permission="contacts.create">
      <NewContactContent />
    </RequirePermission>
  );
}
