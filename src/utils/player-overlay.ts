export const PLAYER_CONTROLS_HIDE_MS = 3200;

export const PLAYER_BACK_BUTTON_ALIGNMENT = {
  left: 12,
  topGap: 8,
  size: 40,
  iconSize: 27,
  iconStrokeWidth: 2.15,
} as const;

export function shouldAutoHidePlayerControls({
  isPlaying,
  isBuffering,
  resolving,
  playerStatus,
  hasResolveError,
}: {
  isPlaying: boolean;
  isBuffering: boolean;
  resolving: boolean;
  playerStatus: string;
  hasResolveError: boolean;
}) {
  return (isPlaying || isBuffering)
    && !resolving
    && !hasResolveError
    && playerStatus !== 'error';
}

export function formatBufferingLabel(percent: number | null) {
  return percent === null ? '正在缓冲' : `正在缓冲 ${percent}%`;
}
