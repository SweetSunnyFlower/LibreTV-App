export interface FavoriteRecord {
  id: string;
  siteUrl: string;
  detailUrl: string;
  vodId: number;
  vodName: string;
  vodPic: string;
  vodYear: string;
  vodArea: string;
  vodRemarks: string;
  typeName: string;
  createdAt: number;
  updatedAt: number;
}

export type FavoriteInput = Omit<FavoriteRecord, 'id' | 'createdAt' | 'updatedAt'>;

export interface SearchHistoryRecord {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  siteUrl: string;
  siteName: string;
  resultCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface WatchHistoryRecord {
  id: string;
  siteUrl: string;
  detailUrl: string;
  vodId: number | null;
  vodName: string;
  vodPic: string;
  episodeName: string;
  sourceName: string;
  sourceIndex: number | null;
  episodeUrl: string;
  playableUrl: string;
  positionMillis: number;
  durationMillis: number;
  createdAt: number;
  updatedAt: number;
}

export type WatchHistoryInput = Omit<WatchHistoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'positionMillis' | 'durationMillis'> & {
  positionMillis?: number;
  durationMillis?: number;
};

export interface LiveFavoriteRecord {
  id: string;
  kind: 'm3u' | 'library';
  channelId: string | null;
  channelName: string;
  channelUrl: string;
  sourceId: number | null;
  sourceName: string;
  logo: string;
  createdAt: number;
  updatedAt: number;
}

export type LiveFavoriteInput = Omit<LiveFavoriteRecord, 'id' | 'createdAt' | 'updatedAt'>;

export interface LiveWatchHistoryRecord {
  id: string;
  kind: 'm3u' | 'library';
  channelId: string | null;
  channelName: string;
  channelUrl: string;
  sourceId: number | null;
  sourceName: string;
  logo: string;
  createdAt: number;
  updatedAt: number;
}

export type LiveWatchHistoryInput = Omit<LiveWatchHistoryRecord, 'id' | 'createdAt' | 'updatedAt'>;
