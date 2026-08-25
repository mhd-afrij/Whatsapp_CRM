'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFailedJobs,
  retryFailedJob,
  retryAllFailedJobs,
  deleteFailedJob,
  type FailedJob,
} from '@/lib/failed-jobs-api';

export default function FailedJobsPage() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['failed-jobs', page],
    queryFn: () => fetchFailedJobs(page, 20),
    refetchInterval: 10000,
  });

  const retryMutation = useMutation({
    mutationFn: retryFailedJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
    },
  });

  const retryAllMutation = useMutation({
    mutationFn: retryAllFailedJobs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFailedJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
    },
  });

  const items = data?.items ?? [];
  const totalPages = data?.last_page ?? 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Failed Jobs</h1>
          <p className="text-sm text-muted">Manage dead letter queue entries</p>
        </div>
        <button
          onClick={() => retryAllMutation.mutate()}
          disabled={retryAllMutation.isPending || items.length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          Retry All ({items.length})
        </button>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-2 text-lg font-semibold">Dead Letter Queue</h2>
        <p className="mb-4 text-sm text-muted">Failed jobs that need attention. Retry to re-dispatch or delete to remove.</p>

        {isLoading ? (
          <div className="py-8 text-center text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-muted">No failed jobs. All clear!</div>
        ) : (
          <div className="space-y-3">
            {items.map((job) => (
              <div key={job.id} className="rounded-lg border p-4 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">#{job.id}</span>
                      <span className="truncate font-medium">{job.job_class}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted">
                      <span>{job.connection}</span>
                      <span>{new Date(job.failed_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="ml-2 flex gap-1">
                    <button
                      onClick={() => retryMutation.mutate(job.id)}
                      disabled={retryMutation.isPending}
                      className="rounded p-1.5 text-muted hover:bg-muted hover:text-text"
                      title="Retry"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
                      className="rounded p-1.5 text-muted hover:bg-muted hover:text-text"
                      title="Details"
                    >
                      <svg className={`h-4 w-4 transition-transform ${expandedId === job.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(job.id)}
                      disabled={deleteMutation.isPending}
                      className="rounded p-1.5 text-muted hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                {expandedId === job.id && (
                  <div className="mt-3 max-h-60 overflow-auto rounded bg-muted p-3 font-mono text-sm">
                    <div className="mb-2">
                      <strong>Exception:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-destructive">{job.exception}</pre>
                    </div>
                    <div>
                      <strong>Payload:</strong>
                      <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(job.payload, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted">
              Page {page} of {totalPages} ({data?.total ?? 0} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
