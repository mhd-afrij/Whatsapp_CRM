"use client";

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api-error";
import { useAuthStore } from "@/stores/auth-store";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);

  const [workspace, setWorkspace] = useState("demo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = status === "loading";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await login(workspace, email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background text-text-primary">
      <div className="hidden md:flex flex-col justify-center gap-4 p-12 bg-sidebar border-r border-border-muted">
        <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
          W
        </div>
        <h1 className="text-2xl font-semibold">WhatsApp CRM</h1>
        <p className="text-text-secondary max-w-sm">
          Turn one WhatsApp account into a shared, structured, auditable
          workspace for your team.
        </p>
      </div>
      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <h2 className="text-xl font-semibold mb-2">Sign in</h2>

          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary" htmlFor="workspace">
              Workspace
            </label>
            <input
              id="workspace"
              name="workspace"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="acme"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-text-secondary" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="••••••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary text-primary-foreground font-medium py-2 text-sm disabled:opacity-60"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-text-muted pt-2">
            Demo logins (workspace <code>demo</code>): owner@demo.test,
            admin@demo.test, lead@demo.test, agent@demo.test — password{" "}
            <code>password12345</code>
          </p>
        </form>
      </div>
    </div>
  );
}
