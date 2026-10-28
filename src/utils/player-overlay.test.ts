import { describe, expect, it } from 'vitest';
import {
  formatBufferingLabel,
  PLAYER_BACK_BUTTON_ALIGNMENT,
  shouldHideControlsAfterBuffering,
  shouldMarkPlaybackResumePending,
  shouldAutoHidePlayerControls,
} from './player-overlay';

describe('player overlay', () => {
  it('hides controls automatically only during normal playback', () => {
    expect(shouldAutoHidePlayerControls({
      isPlaying: true,
      isBuffering: false,
      resolving: false,
      playerStatus: 'readyToPlay',
      hasResolveError: false,
    })).toBe(true);
    expect(shouldAutoHidePlayerControls({
      isPlaying: false,
      isBuffering: false,
      resolving: false,
      playerStatus: 'readyToPlay',
      hasResolveError: false,
    })).toBe(false);
    expect(shouldAutoHidePlayerControls({
      isPlaying: true,
      isBuffering: false,
      resolving: true,
      playerStatus: 'loading',
      hasResolveError: false,
    })).toBe(false);
    expect(shouldAutoHidePlayerControls({
      isPlaying: false,
      isBuffering: true,
      resolving: false,
      playerStatus: 'loading',
      hasResolveError: false,
    })).toBe(true);
  });

  it('shows only real buffering percentages and never uses parsing text', () => {
    expect(formatBufferingLabel(37)).toBe('正在缓冲 37%');
    expect(formatBufferingLabel(null)).toBe('正在缓冲');
    expect(formatBufferingLabel(null)).not.toContain('解析');
  });

  it('matches the detail page back button alignment', () => {
    expect(PLAYER_BACK_BUTTON_ALIGNMENT).toEqual({
      left: 12,
      topGap: 8,
      size: 40,
      iconSize: 27,
      iconStrokeWidth: 2.15,
    });
  });

  it('hides controls as soon as playback resumes after buffering', () => {
    expect(shouldHideControlsAfterBuffering({
      bufferingPending: true,
      isBuffering: false,
      isPlaying: true,
      hasError: false,
    })).toBe(true);
    expect(shouldHideControlsAfterBuffering({
      bufferingPending: true,
      isBuffering: false,
      isPlaying: false,
      hasError: false,
    })).toBe(false);
  });

  it('tracks a paused or rebuffering player even when status stays ready', () => {
    expect(shouldMarkPlaybackResumePending({
      isPlaying: false,
      hasError: false,
      resolving: false,
    })).toBe(true);
    expect(shouldMarkPlaybackResumePending({
      isPlaying: false,
      hasError: false,
      resolving: true,
    })).toBe(false);
  });
});
