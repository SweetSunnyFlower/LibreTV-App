import type { IptvChannel } from '@/models/iptv';
import { fetchTextWithTimeout } from '@/services/http';
import { parseM3U } from '@/utils/iptv';

export async function fetchIptvChannels(url: string, signal?: AbortSignal) {
  const content = await fetchTextWithTimeout(url, { signal }, 20000);
  const channels = parseM3U(content);
  if (channels.length === 0) {
    throw new Error('直播源中没有解析到任何频道');
  }
  return channels;
}
