"use client";

import { RotateCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-text">
          <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm font-medium text-danger">Something went wrong</p>
            <h1 className="mt-2 text-2xl font-semibold">We could not load this workspace view.</h1>
            <p className="mt-3 text-sm text-muted">
              Try again. If the problem keeps happening, check the API and gateway health endpoints.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Retry
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
