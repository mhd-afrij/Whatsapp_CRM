import { apiClient } from './api-client';

export interface FailedJob {
  id: number;
  connection: string;
  queue: string;
  job_class: string;
  payload: Record<string, unknown>;
  exception: string;
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
  return response.data.data;
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
