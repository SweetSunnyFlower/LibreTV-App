import type { VideoSource } from 'expo-video';
import type { PlaybackResolveResult } from '@/services/playback-resolver';
import {
  normalizePlaybackProgress,
  shouldRestorePlaybackProgress,
} from '@/utils/playback';

export type PlaybackStartInput = {
  url: string;
  autoPlay: boolean;
};

export type PlaybackCoordinatorResult =
  | { status: 'started'; playableUrl: string; result: PlaybackResolveResult }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

type PlaybackAdapter = {
  pause: () => void;
  replaceAndWaitReady: (
    source: VideoSource,
    signal: AbortSignal
  ) => Promise<{ duration: number }>;
  seek: (positionSeconds: number) => void;
  play: () => void;
};

type PlaybackCoordinatorDependencies = {
  resolve: (url: string, signal: AbortSignal) => Promise<PlaybackResolveResult>;
  adapter: PlaybackAdapter;
  loadProgress: (
    url: string
  ) => Promise<{ positionSeconds: number; durationSeconds: number } | null>;
  saveProgress: (url: string, positionSeconds: number, durationSeconds: number) => Promise<void>;
  recordStarted: (result: PlaybackResolveResult) => Promise<void>;
};

export class PlaybackCoordinator {
  private generation = 0;
  private controller: AbortController | null = null;
  private activeUrl = '';

  constructor(private readonly dependencies: PlaybackCoordinatorDependencies) {}

  async start(input: PlaybackStartInput): Promise<PlaybackCoordinatorResult> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.activeUrl = '';
    this.dependencies.adapter.pause();

    try {
      const result = await this.dependencies.resolve(input.url, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) {
        return { status: 'cancelled' };
      }
      if (!result.source || result.error) {
        throw new Error(result.error || '无法解析播放地址');
      }

      const ready = await this.dependencies.adapter.replaceAndWaitReady(
        result.source,
        controller.signal
      );
      if (generation !== this.generation || controller.signal.aborted) {
        return { status: 'cancelled' };
      }

      const savedProgress = await this.dependencies.loadProgress(input.url);
      if (
        savedProgress
        && shouldRestorePlaybackProgress(savedProgress.positionSeconds, ready.duration)
      ) {
        this.dependencies.adapter.seek(savedProgress.positionSeconds);
      }

      await this.dependencies.recordStarted(result);
      if (generation !== this.generation || controller.signal.aborted) {
        return { status: 'cancelled' };
      }

      this.activeUrl = input.url;
      if (input.autoPlay) {
        this.dependencies.adapter.play();
      }
      return { status: 'started', playableUrl: result.playableUrl, result };
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) {
        return { status: 'cancelled' };
      }
      return { status: 'error', error };
    } finally {
      if (this.controller === controller) {
        this.controller = null;
      }
    }
  }

  async flush(positionSeconds: number, durationSeconds: number) {
    if (!this.activeUrl) return;
    const progress = normalizePlaybackProgress(positionSeconds, durationSeconds);
    await this.dependencies.saveProgress(
      this.activeUrl,
      progress.positionSeconds,
      progress.durationSeconds
    );
  }

  cancel() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  async dispose() {
    this.cancel();
  }
}
