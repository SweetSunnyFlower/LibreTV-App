import { describe, expect, it, vi } from 'vitest';
import { createProbeQueue } from './probe-queue';

describe('createProbeQueue', () => {
  it('keeps at most the configured number of tasks running', async () => {
    const queue = createProbeQueue(2);
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 5 }, () => queue.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    }));

    await Promise.all(tasks);

    expect(peak).toBe(2);
    expect(queue.pendingCount()).toBe(0);
  });

  it('propagates task failures and keeps draining the queue', async () => {
    const queue = createProbeQueue(1);
    const order: number[] = [];
    const failing = queue.run(async () => {
      order.push(1);
      throw new Error('boom');
    });
    const next = queue.run(async () => {
      order.push(2);
    });

    await expect(failing).rejects.toThrow('boom');
    await next;
    expect(order).toEqual([1, 2]);
  });
});
