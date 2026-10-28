import { describe, expect, it } from 'vitest';
import {
  bufferPercentFor,
  buildBufferOptions,
  normalizePlaybackProgress,
  shouldRestorePlaybackProgress,
} from './playback';

describe('playback utilities', () => {
  it('does not restore progress near the end', () => {
    expect(shouldRestorePlaybackProgress(5995, 6000)).toBe(false);
    expect(shouldRestorePlaybackProgress(5989, 6000)).toBe(true);
  });

  it('normalizes invalid progress into the media range', () => {
    expect(normalizePlaybackProgress(-2, 120)).toEqual({
      positionSeconds: 0,
      durationSeconds: 120,
    });
    expect(normalizePlaybackProgress(200, 120)).toEqual({
      positionSeconds: 120,
      durationSeconds: 120,
    });
  });

  it('uses moderate Android buffering and native iOS defaults', () => {
    expect(buildBufferOptions('android')).toMatchObject({
      minBufferForPlayback: 2,
      preferredForwardBufferDuration: 30,
      maxBufferBytes: 64 * 1024 * 1024,
    });
    expect(buildBufferOptions('ios')).toEqual({ preferredForwardBufferDuration: 0 });
  });

  it('returns a real buffer percentage when duration is known', () => {
    expect(bufferPercentFor(25, 100)).toBe(25);
    expect(bufferPercentFor(25, 0)).toBeNull();
  });
});
