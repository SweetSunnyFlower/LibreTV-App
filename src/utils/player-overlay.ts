export const PLAYER_CONTROLS_HIDE_MS = 3200;

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
