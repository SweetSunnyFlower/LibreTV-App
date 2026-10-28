import { describe, expect, it } from 'vitest';
import { runConcurrentWorkers } from './concurrent-workers';

describe('runConcurrentWorkers', () => {
  it('stops other workers from claiming new items after one fails', async () => {
    const pending = [1, 2, 3, 4];
    let nextIndex = 0;
    const claimed: number[] = [];

    await expect(runConcurrentWorkers(2, async (control) => {
      while (!control.failed()) {
        const index = nextIndex++;
        const item = pending[index];
        if (!item) return;
        claimed.push(item);
        if (item === 1) {
          control.fail(new Error('segment failed'));
          return;
        }
        await Promise.resolve();
      }
    })).rejects.toThrow('segment failed');

    expect(claimed).not.toContain(3);
    expect(claimed).not.toContain(4);
  });
});
