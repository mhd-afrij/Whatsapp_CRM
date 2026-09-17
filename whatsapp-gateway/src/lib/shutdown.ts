interface ShutdownWorker {
  close(): Promise<void>;
}

interface ShutdownManager {
  stop(): Promise<void>;
}

/** Drain queue work before closing the account sockets it may still be using. */
export async function drainWorkersAndStopManagers(
  workers: readonly ShutdownWorker[],
  getManagers: () => readonly ShutdownManager[],
): Promise<void> {
  const failures: Error[] = [];
  const workerResults = await Promise.allSettled(workers.map((worker) => worker.close()));
  for (const result of workerResults) {
    if (result.status === 'rejected') failures.push(result.reason);
  }
  if (failures.length) throw new AggregateError(failures, 'Worker drain failed');

  const managerResults = await Promise.allSettled(getManagers().map((manager) => manager.stop()));
  for (const result of managerResults) {
    if (result.status === 'rejected') failures.push(result.reason);
  }
  if (failures.length) throw new AggregateError(failures, 'Account shutdown failed');
}
