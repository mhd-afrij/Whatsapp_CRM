"use client";

import React from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

/** Minimal shape of the optional `window.Sentry` global the host page may set. */
interface SentryGlobal {
  captureException?: (
    error: Error,
    options?: { contexts?: Record<string, unknown> }
  ) => void;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);

    // Relay the error to Sentry when the host page has initialized it
    // (the global is optional so the boundary stays a no-op otherwise).
    if (typeof window !== "undefined" && "Sentry" in window) {
      const Sentry = (window as unknown as { Sentry?: SentryGlobal }).Sentry;
      if (Sentry && typeof Sentry.captureException === "function") {
        Sentry.captureException(error, {
          contexts: { react: { componentStack: info.componentStack } },
        });
      }
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center h-screen flex-col gap-4">
          <h2 className="text-2xl font-semibold text-text">Something went wrong</h2>
          <p className="text-muted">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}