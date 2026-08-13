"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/providers/toast-provider";
import { apiClient, ApiError } from "@/lib/api-client";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await apiClient.patch("/auth/profile", { name: name.trim(), email: email.trim() });
      await refresh();
      setSaved(true);
      toast("Profile updated.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Profile</h1>
        <p className="text-sm text-muted">
          Manage your personal information and account details.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Profile updated successfully.
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text">Personal Information</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-medium text-muted">
              Full name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="profile-email" className="block text-xs font-medium text-muted">
              Email address
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Roles</dt>
            <dd className="text-text">{user?.roles?.join(", ") || "None"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Workspace ID</dt>
            <dd className="text-text font-mono text-xs">{user?.workspace_id ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim() || !email.trim()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
