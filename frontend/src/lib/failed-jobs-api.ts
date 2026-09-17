import { apiClient } from './api-client';

export interface FailedJob {
  id: number;
  connection: string;
  queue: string;
  job_class: string;
  command_name: string | null;
  exception_preview: string | null;
  failed_at: string;
}

export interface FailedJobsResponse {
  items: FailedJob[];
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export async function fetchFailedJobs(page = 1, perPage = 20): Promise<FailedJobsResponse> {
  const response = await apiClient.get('/failed-jobs', {
    params: { page, per_page: perPage },
  });
  const envelope = response.data as {
    success?: boolean;
    message?: string;
    data?: { items: FailedJob[] };
    meta?: Omit<FailedJobsResponse, 'items'>;
  };
  if (envelope.success === false || !envelope.data) {
    throw new Error(envelope.message ?? 'Failed to load failed jobs');
  }
  return {
    items: envelope.data.items ?? [],
    page: envelope.meta?.page ?? page,
    per_page: envelope.meta?.per_page ?? perPage,
    total: envelope.meta?.total ?? 0,
    last_page: envelope.meta?.last_page ?? 1,
  };
}

export async function retryFailedJob(id: number): Promise<void> {
  await apiClient.post(`/failed-jobs/${id}/retry`);
}

export async function retryAllFailedJobs(): Promise<void> {
  await apiClient.post('/failed-jobs/retry-all');
}

export async function deleteFailedJob(id: number): Promise<void> {
  await apiClient.delete(`/failed-jobs/${id}`);
}
