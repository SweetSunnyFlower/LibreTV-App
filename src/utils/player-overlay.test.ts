import { describe, expect, it } from 'vitest';
import {
  formatBufferingLabel,
  shouldAutoHidePlayerControls,
} from './player-overlay';

describe('player overlay', () => {
  it('hides controls automatically only during normal playback', () => {
    expect(shouldAutoHidePlayerControls({
      isPlaying: true,
      resolving: false,
      playerStatus: 'readyToPlay',
      hasResolveError: false,
    })).toBe(true);
    expect(shouldAutoHidePlayerControls({
      isPlaying: false,
      resolving: false,
      playerStatus: 'readyToPlay',
      hasResolveError: false,
    })).toBe(false);
    expect(shouldAutoHidePlayerControls({
      isPlaying: true,
      resolving: true,
      playerStatus: 'loading',
      hasResolveError: false,
    })).toBe(false);
  });

  it('shows only real buffering percentages and never uses parsing text', () => {
    expect(formatBufferingLabel(37)).toBe('正在缓冲 37%');
    expect(formatBufferingLabel(null)).toBe('正在缓冲');
    expect(formatBufferingLabel(null)).not.toContain('解析');
  });
});
