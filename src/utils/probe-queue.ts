export function createProbeQueue(limit = 4) {
  let active = 0;
  const queue: Array<() => void> = [];

  function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            const next = queue.shift();
            if (!next) return;
            active += 1;
            next();
          });
      };

      if (active < limit) {
        active += 1;
        start();
      } else {
        queue.push(start);
      }
    });
  }

  return {
    run,
    pendingCount: () => active + queue.length,
  };
}
