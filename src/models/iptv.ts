export interface IptvSource {
  id: number;
  url: string;
  name: string;
  isActive: boolean;
  createdAt: number;
}

export type IptvSourceInput = Omit<IptvSource, 'id' | 'isActive' | 'createdAt'>;

export interface IptvChannel {
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

export interface IptvLibraryChannel {
  id: string;
  name: string;
  country: string;
  languages: string[];
  categories: string[];
  isNsfw: boolean;
  altNames: string[];
}

export interface IptvLibraryStream {
  channel: string;
  feed: string;
  title: string;
  url: string;
  referrer?: string;
  userAgent?: string;
  quality?: string;
  labels: string[];
}

export interface IptvLibraryFilter {
  country?: string;
  language?: string;
  category?: string;
  includeNsfw?: boolean;
}
