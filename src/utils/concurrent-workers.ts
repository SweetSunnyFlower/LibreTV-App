export type WorkerControl = {
  fail: (error: unknown) => void;
  failed: () => boolean;
};

export async function runConcurrentWorkers(
  concurrency: number,
  worker: (control: WorkerControl) => Promise<void>
) {
  let failure: unknown = null;
  const control: WorkerControl = {
    fail: (error) => {
      if (!failure) failure = error;
    },
    failed: () => Boolean(failure),
  };

  await Promise.allSettled(
    Array.from({ length: Math.max(0, concurrency) }, () => worker(control))
  );
  if (failure) throw failure;
}
