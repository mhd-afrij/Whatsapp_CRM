export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-text">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="h-2 w-24 rounded-full bg-primary" />
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-border" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-border" />
        </div>
        <p className="text-sm text-muted">Loading workspace data...</p>
      </div>
    </main>
  );
}
