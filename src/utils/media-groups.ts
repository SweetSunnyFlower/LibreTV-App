import type { DownloadRecord } from '@/models/download';
import type { WatchHistoryRecord } from '@/models/user-data';

export interface DownloadFolderGroup {
  key: string;
  vodName: string;
  count: number;
  activeCount: number;
  completedCount: number;
  pausedCount: number;
  errorCount: number;
  updatedAt: number;
  records: DownloadRecord[];
}

export interface WatchHistoryFolderGroup {
  key: string;
  vodName: string;
  count: number;
  latestEpisodeName: string;
  latestSourceName: string;
  updatedAt: number;
  records: WatchHistoryRecord[];
}

function safeName(value: string) {
  return value.trim() || '未知影片';
}

export function downloadFolderKey(record: Pick<DownloadRecord, 'vodName' | 'siteUrl' | 'detailUrl'>) {
  const sourceIdentity = record.detailUrl || record.siteUrl;
  return sourceIdentity
    ? `download::${sourceIdentity}::${safeName(record.vodName)}`
    : `download::name::${safeName(record.vodName)}`;
}

export function watchHistoryFolderKey(record: Pick<WatchHistoryRecord, 'siteUrl' | 'detailUrl' | 'vodId' | 'vodName'>) {
  if (record.siteUrl && record.vodId) {
    return `watch::${record.siteUrl}::${record.vodId}`;
  }
  if (record.detailUrl) {
    return `watch::${record.detailUrl}`;
  }
  return `watch::${safeName(record.vodName)}`;
}

export function groupDownloadFolders(downloads: DownloadRecord[]) {
  const map = new Map<string, DownloadFolderGroup>();

  downloads.forEach((record) => {
    const key = downloadFolderKey(record);
    const current = map.get(key);
    if (current) {
      current.records.push(record);
      current.count += 1;
      current.activeCount += record.state === 'active' ? 1 : 0;
      current.completedCount += record.state === 'completed' ? 1 : 0;
      current.pausedCount += record.state === 'paused' ? 1 : 0;
      current.errorCount += record.state === 'error' ? 1 : 0;
      current.updatedAt = Math.max(current.updatedAt, record.updatedAt);
      return;
    }

    map.set(key, {
      key,
      vodName: safeName(record.vodName),
      count: 1,
      activeCount: record.state === 'active' ? 1 : 0,
      completedCount: record.state === 'completed' ? 1 : 0,
      pausedCount: record.state === 'paused' ? 1 : 0,
      errorCount: record.state === 'error' ? 1 : 0,
      updatedAt: record.updatedAt,
      records: [record],
    });
  });

  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function groupWatchHistoryFolders(watchHistory: WatchHistoryRecord[]) {
  const map = new Map<string, WatchHistoryFolderGroup>();

  watchHistory.forEach((record) => {
    const key = watchHistoryFolderKey(record);
    const current = map.get(key);
    if (current) {
      current.records.push(record);
      current.count += 1;
      if (record.updatedAt > current.updatedAt) {
        current.latestEpisodeName = record.episodeName;
        current.latestSourceName = record.sourceName;
        current.updatedAt = record.updatedAt;
      }
      return;
    }

    map.set(key, {
      key,
      vodName: safeName(record.vodName),
      count: 1,
      latestEpisodeName: record.episodeName,
      latestSourceName: record.sourceName,
      updatedAt: record.updatedAt,
      records: [record],
    });
  });

  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
