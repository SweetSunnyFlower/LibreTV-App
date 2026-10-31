import type { LiveFavoriteInput } from '@/models/user-data';

export function liveFavoriteChannelKey(
  kind: LiveFavoriteInput['kind'],
  channelId: string | null,
  channelUrl: string
) {
  return kind === 'library' ? (channelId ?? '') : channelUrl;
}
