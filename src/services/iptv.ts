import type { IptvChannel } from '@/models/iptv';
import { fetchTextWithTimeout } from '@/services/http';
import { parseM3U } from '@/utils/iptv';
import type { SQLiteDatabase } from 'expo-sqlite';

export async function fetchIptvChannels(url: string, signal?: AbortSignal) {
  const content = await fetchTextWithTimeout(url, { signal }, 20000);
  const channels = parseM3U(content);
  if (channels.length === 0) {
    throw new Error('直播源中没有解析到任何频道');
  }
  return channels;
}

export async function probeIptvSource(url: string) {
  const content = await fetchTextWithTimeout(url, {}, 10000);
  const channels = parseM3U(content);
  return channels.length;
}

export async function probeStreamUrl(url: string, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const handleExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', handleExternalAbort, { once: true });

  const request = async (useRange: boolean) => {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: useRange ? { Range: 'bytes=0-0' } : undefined,
    });
    return response;
  };

  const isUsableResponse = (response: Response) => {
    if (!response.ok) return false;
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    return !contentType.includes('text/html');
  };

  try {
    const rangeResponse = await request(true);
    if (isUsableResponse(rangeResponse)) return true;

    if ([400, 403, 405, 416].includes(rangeResponse.status)) {
      const plainResponse = await request(false);
      return isUsableResponse(plainResponse);
    }

    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', handleExternalAbort);
    controller.abort();
  }
}

export async function getCachedIptvChannels(db: SQLiteDatabase, sourceId: number): Promise<IptvChannel[] | null> {
  const rows = await db.getAllAsync<{
    name: string;
    url: string;
    logo: string;
    groupTitle: string;
  }>(
    'SELECT name, url, logo, groupTitle FROM iptv_source_channel_cache WHERE sourceId = ? ORDER BY rowid ASC',
    [sourceId]
  );
  if (rows.length === 0) return null;
  return rows.map((row) => ({
    name: row.name,
    url: row.url,
    logo: row.logo || undefined,
    group: row.groupTitle || undefined,
  }));
}

export async function cacheIptvChannels(db: SQLiteDatabase, sourceId: number, channels: IptvChannel[]) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM iptv_source_channel_cache WHERE sourceId = ?', [sourceId]);
    const statement = await db.prepareAsync(
      'INSERT INTO iptv_source_channel_cache (sourceId, name, url, logo, groupTitle) VALUES (?, ?, ?, ?, ?)'
    );
    try {
      for (const channel of channels) {
        await statement.executeAsync(sourceId, channel.name, channel.url, channel.logo ?? '', channel.group ?? '');
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
}
