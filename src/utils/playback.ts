import type { BufferOptions } from 'expo-video';

const END_GUARD_SECONDS = 10;

export function shouldRestorePlaybackProgress(positionSeconds: number, durationSeconds: number) {
  return Number.isFinite(positionSeconds)
    && Number.isFinite(durationSeconds)
    && durationSeconds > 0
    && positionSeconds > 3
    && positionSeconds < durationSeconds - END_GUARD_SECONDS;
}

export function normalizePlaybackProgress(positionSeconds: number, durationSeconds: number) {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  const safePosition = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
  return {
    positionSeconds: safeDuration > 0 ? Math.min(safePosition, safeDuration) : safePosition,
    durationSeconds: safeDuration,
  };
}

export function buildBufferOptions(platform: 'android' | 'ios' | 'web'): BufferOptions {
  if (platform === 'android') {
    return {
      minBufferForPlayback: 2,
      preferredForwardBufferDuration: 30,
      maxBufferBytes: 64 * 1024 * 1024,
    };
  }
  if (platform === 'ios') {
    return { preferredForwardBufferDuration: 0 };
  }
  return {};
}

export function bufferPercentFor(bufferedPosition: number, duration: number) {
  if (!Number.isFinite(bufferedPosition) || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((bufferedPosition / duration) * 100)));
}
