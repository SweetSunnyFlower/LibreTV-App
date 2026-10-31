import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  IptvLibraryChannel,
  IptvLibraryFilter,
  IptvLibraryStream,
} from '@/models/iptv';
import { fetchJsonWithTimeout } from '@/services/http';

const API_BASES = [
  'https://cdn.jsdelivr.net/gh/iptv-org/api@gh-pages/',
  'https://iptv-org.github.io/api/',
];

type RawChannel = {
  id: string;
  name?: string;
  alt_names?: string[];
  country?: string;
  categories?: string[];
  is_nsfw?: boolean;
};

type RawFeed = {
  channel: string;
  languages?: string[];
};

type RawStream = {
  channel?: string | null;
  feed?: string | null;
  title?: string;
  url: string;
  referrer?: string | null;
  user_agent?: string | null;
  quality?: string | null;
  labels?: string[];
};

type RawCountry = {
  name: string;
  code: string;
  flag?: string;
};

type RawLanguage = {
  name: string;
  code: string;
};

type RawCategory = {
  id: string;
  name: string;
};

type ChannelRow = {
  id: string;
  name: string;
  country: string;
  languages: string;
  categories: string;
  isNsfw: number;
  altNames: string;
};

type StreamRow = {
  channel: string;
  feed: string;
  title: string;
  url: string;
  referrer: string;
  userAgent: string;
  quality: string;
  labels: string;
};

async function fetchLibraryJson<T>(path: string, timeoutMs = 120000) {
  let lastError: unknown = null;
  for (const base of API_BASES) {
    try {
      return await fetchJsonWithTimeout<T>(`${base}${path}`, {}, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  console.warn(`[IPTV Library] ${path} fetch failed`, lastError);
  throw lastError ?? new Error('直播库请求失败');
}

function parseChannel(row: ChannelRow): IptvLibraryChannel {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    languages: safeParseArray(row.languages),
    categories: safeParseArray(row.categories),
    isNsfw: row.isNsfw === 1,
    altNames: safeParseArray(row.altNames),
  };
}

function parseStream(row: StreamRow): IptvLibraryStream {
  return {
    channel: row.channel,
    feed: row.feed,
    title: row.title,
    url: row.url,
    referrer: row.referrer || undefined,
    userAgent: row.userAgent || undefined,
    quality: row.quality || undefined,
    labels: safeParseArray(row.labels),
  };
}

function safeParseArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function qualityRank(quality?: string) {
  const match = /(\d{3,4})/.exec(quality ?? '');
  return match ? Number(match[1]) : 0;
}

export function pickBestStream(streams: IptvLibraryStream[]) {
  const candidates = streams.filter((stream) => stream.url);
  if (candidates.length === 0) return null;

  return candidates
    .map((stream) => ({
      stream,
      blocked: stream.labels.some((label) => /geo-blocked/i.test(label)),
      rank: qualityRank(stream.quality),
    }))
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return Number(a.blocked) - Number(b.blocked);
    })[0].stream;
}

export type IptvLibrarySyncProgress = {
  label: string;
  percent: number;
};

function createProgressTracker(
  onProgress: ((progress: IptvLibrarySyncProgress) => void) | undefined,
  total: number,
  label: string
) {
  let completed = 0;
  return <T,>(promise: Promise<T>) => promise.then((result) => {
    completed += 1;
    onProgress?.({
      label,
      percent: Math.min(100, Math.round((completed / total) * 70)),
    });
    return result;
  });
}

export async function syncIptvLibraryChannels(
  db: SQLiteDatabase,
  onProgress?: (progress: IptvLibrarySyncProgress) => void
) {
  onProgress?.({ label: '正在下载频道数据', percent: 0 });
  const track = createProgressTracker(onProgress, 4, '正在下载频道数据');

  const [channels, countries, languages, categories] = await Promise.all([
    track(fetchLibraryJson<RawChannel[]>('channels.json', 120000)),
    track(fetchLibraryJson<RawCountry[]>('countries.json', 25000)),
    track(fetchLibraryJson<RawLanguage[]>('languages.json', 25000)),
    track(fetchLibraryJson<RawCategory[]>('categories.json', 25000)),
  ]);

  onProgress?.({ label: '正在写入数据库', percent: 78 });

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM iptv_library_channels');

    const insertChannel = await db.prepareAsync(
      'INSERT INTO iptv_library_channels (id, name, country, languages, categories, isNsfw, altNames) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    try {
      for (const channel of channels) {
        await insertChannel.executeAsync(
          channel.id,
          channel.name ?? channel.id,
          channel.country ?? '',
          JSON.stringify([]),
          JSON.stringify(channel.categories ?? []),
          channel.is_nsfw ? 1 : 0,
          JSON.stringify(channel.alt_names ?? [])
        );
      }
    } finally {
      await insertChannel.finalizeAsync();
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO iptv_library_filters (kind, itemsJson) VALUES (?, ?)',
      ['countries', JSON.stringify(countries.map((item) => ({ code: item.code, name: item.name, flag: item.flag ?? '' })))]
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO iptv_library_filters (kind, itemsJson) VALUES (?, ?)',
      ['languages', JSON.stringify(languages.map((item) => ({ code: item.code, name: item.name })))]
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO iptv_library_filters (kind, itemsJson) VALUES (?, ?)',
      ['categories', JSON.stringify(categories.map((item) => ({ id: item.id, name: item.name })))]
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO iptv_library_meta (id, syncedAt) VALUES (1, ?)',
      [Math.floor(Date.now() / 1000)]
    );
  });

  onProgress?.({ label: '频道数据同步完成', percent: 100 });
}

export async function syncIptvLibraryStreams(
  db: SQLiteDatabase,
  onProgress?: (progress: IptvLibrarySyncProgress) => void
) {
  onProgress?.({ label: '正在后台同步流数据', percent: 0 });
  const track = createProgressTracker(onProgress, 2, '正在后台同步流数据');

  const [feeds, streams] = await Promise.all([
    track(fetchLibraryJson<RawFeed[]>('feeds.json', 120000)),
    track(fetchLibraryJson<RawStream[]>('streams.json', 120000)),
  ]);

  onProgress?.({ label: '正在写入流数据', percent: 78 });

  const languagesByChannel = new Map<string, string[]>();
  for (const feed of feeds) {
    if (!feed.channel || !feed.languages?.length) continue;
    const current = languagesByChannel.get(feed.channel) ?? [];
    for (const language of feed.languages) {
      if (!current.includes(language)) current.push(language);
    }
    languagesByChannel.set(feed.channel, current);
  }

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM iptv_library_streams');

    const updateChannelLanguage = await db.prepareAsync(
      'UPDATE iptv_library_channels SET languages = ? WHERE id = ?'
    );
    try {
      for (const [channelId, languages] of languagesByChannel) {
        await updateChannelLanguage.executeAsync(JSON.stringify(languages), channelId);
      }
    } finally {
      await updateChannelLanguage.finalizeAsync();
    }

    const insertStream = await db.prepareAsync(
      'INSERT OR REPLACE INTO iptv_library_streams (channel, feed, title, url, referrer, userAgent, quality, labels) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    try {
      for (const stream of streams) {
        await insertStream.executeAsync(
          stream.channel ?? '',
          stream.feed ?? '',
          stream.title ?? '',
          stream.url,
          stream.referrer ?? '',
          stream.user_agent ?? '',
          stream.quality ?? '',
          JSON.stringify(stream.labels ?? [])
        );
      }
    } finally {
      await insertStream.finalizeAsync();
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO iptv_library_meta (id, syncedAt) VALUES (1, ?)',
      [Math.floor(Date.now() / 1000)]
    );
  });

  onProgress?.({ label: '流数据同步完成', percent: 100 });
}

export async function getIptvLibrarySyncedAt(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ syncedAt: number }>('SELECT syncedAt FROM iptv_library_meta WHERE id = 1 LIMIT 1');
  return row?.syncedAt ?? 0;
}

export async function getIptvLibraryFilterOptions(db: SQLiteDatabase, kind: string) {
  const row = await db.getFirstAsync<{ itemsJson: string }>(
    'SELECT itemsJson FROM iptv_library_filters WHERE kind = ? LIMIT 1',
    [kind]
  );
  if (!row) return [];
  try {
    return JSON.parse(row.itemsJson) as Array<Record<string, string>>;
  } catch {
    return [];
  }
}

export async function getIptvLibraryChannels(db: SQLiteDatabase, filter: IptvLibraryFilter) {
  const clauses: string[] = [];
  const params: string[] = [];

  if (!filter.includeNsfw) {
    clauses.push('isNsfw = 0');
  }

  if (filter.country) {
    clauses.push('country = ?');
    params.push(filter.country);
  }

  const limit = filter.country ? '' : ' LIMIT 400';
  const rows = await db.getAllAsync<ChannelRow>(
    `SELECT * FROM iptv_library_channels WHERE ${clauses.join(' AND ')} ORDER BY name ASC${limit}`,
    ...params
  );

  let channels = rows.map(parseChannel);
  if (filter.language) {
    channels = channels.filter((channel) => channel.languages.includes(filter.language!));
  }
  if (filter.category) {
    channels = channels.filter((channel) => channel.categories.includes(filter.category!));
  }
  return channels;
}

export async function getIptvLibraryStreams(db: SQLiteDatabase, channelId: string) {
  const rows = await db.getAllAsync<StreamRow>(
    'SELECT * FROM iptv_library_streams WHERE channel = ?',
    [channelId]
  );
  return rows.map(parseStream);
}
