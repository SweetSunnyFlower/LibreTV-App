import { describe, expect, it, vi } from 'vitest';
import type { PlaybackResolveResult } from './playback-resolver';
import { PlaybackCoordinator } from './playback-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function source(url: string): PlaybackResolveResult {
  return {
    originalUrl: url,
    normalizedUrl: url,
    playableUrl: url,
    kind: 'hls',
    source: { uri: url },
    diagnostics: {},
  };
}

describe('PlaybackCoordinator', () => {
  it('pauses the old player and ignores a stale resolve result', async () => {
    const first = deferred<PlaybackResolveResult>();
    const second = deferred<PlaybackResolveResult>();
    const adapter = {
      pause: vi.fn(),
      replaceAndWaitReady: vi.fn(async () => ({ duration: 100 })),
      seek: vi.fn(),
      play: vi.fn(),
    };
    const coordinator = new PlaybackCoordinator({
      resolve: (_url, _signal) => (_url.endsWith('/1.m3u8') ? first.promise : second.promise),
      adapter,
      loadProgress: async () => null,
      saveProgress: async () => {},
      recordStarted: async () => {},
    });

    const firstRun = coordinator.start({ url: 'https://a/1.m3u8', autoPlay: true });
    const secondRun = coordinator.start({ url: 'https://b/2.m3u8', autoPlay: true });
    first.resolve(source('https://a/1.m3u8'));
    second.resolve(source('https://b/2.m3u8'));

    await Promise.all([firstRun, secondRun]);

    expect(adapter.pause).toHaveBeenCalledTimes(2);
    expect(adapter.replaceAndWaitReady).toHaveBeenCalledTimes(1);
    expect(adapter.replaceAndWaitReady).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'https://b/2.m3u8' }),
      expect.any(AbortSignal)
    );
  });

  it('does not restore progress within ten seconds of the end', async () => {
    const adapter = {
      pause: vi.fn(),
      replaceAndWaitReady: vi.fn(async () => ({ duration: 100 })),
      seek: vi.fn(),
      play: vi.fn(),
    };
    const coordinator = new PlaybackCoordinator({
      resolve: async () => source('https://a/1.m3u8'),
      adapter,
      loadProgress: async () => ({ positionSeconds: 95, durationSeconds: 100 }),
      saveProgress: async () => {},
      recordStarted: async () => {},
    });

    const result = await coordinator.start({ url: 'https://a/1.m3u8', autoPlay: true });

    expect(result.status).toBe('started');
    expect(adapter.seek).not.toHaveBeenCalled();
    expect(adapter.play).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight request without replacing the source', async () => {
    const pending = deferred<PlaybackResolveResult>();
    const adapter = {
      pause: vi.fn(),
      replaceAndWaitReady: vi.fn(async () => ({ duration: 100 })),
      seek: vi.fn(),
      play: vi.fn(),
    };
    const coordinator = new PlaybackCoordinator({
      resolve: (_url, signal) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        void pending.promise.then(resolve);
      }),
      adapter,
      loadProgress: async () => null,
      saveProgress: async () => {},
      recordStarted: async () => {},
    });

    const run = coordinator.start({ url: 'https://a/1.m3u8', autoPlay: true });
    coordinator.cancel();

    expect(await run).toEqual({ status: 'cancelled' });
    expect(adapter.replaceAndWaitReady).not.toHaveBeenCalled();
  });
});
