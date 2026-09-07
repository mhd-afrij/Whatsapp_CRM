"use client";

import { useState } from "react";
import {
  Camera,
  Database,
  User,
  ShieldCheck,
  Calendar,
  Clock,
  IdCard,
  Save,
  X,
  Mail,
  Phone,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/providers/toast-provider";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Administrator",
  admin: "Administrator",
  user: "Team Member",
};

function roleLabel(roles: string[] = [], roleKeys: string[] = []): string {
  if (roleKeys.length > 0) {
    const shown = roleKeys.map((k) => ROLE_DISPLAY[k] ?? k).join(", ");
    if (shown) return shown;
  }
  const shown = roles.join(", ");
  return shown || "Member";
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "U";
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const role = roleLabel(user?.roles, user?.role_keys);

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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header with info banner */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your personal information and account details.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          Profile updated successfully.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Left: profile summary card ─────────────────────────── */}
        <aside className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-muted text-3xl font-bold text-accent-text shadow-md">
                  {initialOf(name)}
                </div>
                <button
                  type="button"
                  title="Update profile picture"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-accent-text shadow-sm transition-transform hover:scale-110"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-text">{user?.name || "User"}</h2>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
                <ShieldCheck className="h-3 w-3" />
                {role}
              </span>
              <p className="mt-2 text-sm text-muted">{user?.email || "—"}</p>
            </div>

            <div className="my-5 h-px bg-border" />

            <dl className="space-y-3.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <User className="h-4 w-4" /> Role
                </dt>
                <dd className="text-right font-medium text-text">{role}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <IdCard className="h-4 w-4" /> Workspace ID
                </dt>
                <dd className="font-mono text-xs text-text">{user?.workspace_id ?? "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <Calendar className="h-4 w-4" /> Member since
                </dt>
                <dd className="text-right text-text">—</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted">
                  <Clock className="h-4 w-4" /> Last login
                </dt>
                <dd className="text-right text-text">—</dd>
              </div>
            </dl>
          </div>
        </aside>

        {/* ── Right: main content ───────────────────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Personal Information */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text">Personal Information</h2>
                <p className="text-xs text-muted">
                  Update your personal details and how others see you in the system.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-medium text-muted">
                  Full name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="profile-email" className="flex items-center gap-1 text-xs font-medium text-muted">
                  <Mail className="h-3.5 w-3.5" /> Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="profile-phone" className="flex items-center gap-1 text-xs font-medium text-muted">
                  <Phone className="h-3.5 w-3.5" /> Phone number <span className="text-muted/60">(Optional)</span>
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 234 567 8900"
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label htmlFor="profile-job-title" className="flex items-center gap-1 text-xs font-medium text-muted">
                  <Briefcase className="h-3.5 w-3.5" /> Job title <span className="text-muted/60">(Optional)</span>
                </label>
                <input
                  id="profile-job-title"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Operations Manager"
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="profile-bio" className="block text-xs font-medium text-muted">
                  Bio <span className="text-muted/60">(Optional)</span>
                </label>
                <textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  placeholder="Tell us a little about yourself..."
                  rows={4}
                  className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <div className="mt-1 text-right text-xs text-muted">{bio.length}/500</div>
              </div>
            </div>
          </section>

          {/* Account Information */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text">Account Information</h2>
                <p className="text-xs text-muted">Your role and workspace details.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-muted">Role</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-muted">
                  <User className="h-4 w-4 shrink-0" /> {role}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted">Workspace ID</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-bg px-3.5 py-2.5 font-mono text-sm text-muted">
                  <IdCard className="h-4 w-4 shrink-0" /> {user?.workspace_id ?? "—"}
                </div>
              </div>
            </div>
          </section>

          {/* Action bar */}
          <div className="-mx-6 flex flex-nowrap items-center justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setName(user?.name ?? "");
                  setEmail(user?.email ?? "");
                  setPhone("");
                  setJobTitle("");
                  setBio("");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-muted/10 focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim() || !email.trim()}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-muted px-5 py-2.5 text-sm font-semibold text-accent-text shadow-md",
                  "transition-shadow duration-200 hover:shadow-lg disabled:opacity-50 disabled:shadow-none"
                )}
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save Changes"}
              </button>
          </div>

        </div>
      </div>
    </div>
  );
}

