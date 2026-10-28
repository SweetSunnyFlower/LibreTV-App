export const CMS_ENDPOINTS = {
  search: (siteUrl: string, keyword: string) =>
    `${siteUrl}/api.php/provide/vod/?ac=detail&wd=${encodeURIComponent(keyword)}`,
  categories: (siteUrl: string) =>
    `${siteUrl}/api.php/provide/vod/?ac=list`,
  categoryList: (siteUrl: string, typeId: number, page = 1, year?: string) => {
    const params = new URLSearchParams({ ac: 'detail', t: String(typeId), pg: String(page) });
    if (year) params.set('year', year);
    return `${siteUrl}/api.php/provide/vod/?${params.toString()}`;
  },
  detail: (siteUrl: string, id: number) =>
    `${siteUrl}/api.php/provide/vod/?ac=detail&ids=${id}`,
} as const;

export const DOUBAN_BASE_URL = 'https://movie.douban.com';

export const APP_VERSION_ENDPOINTS = {
  latest: process.env.EXPO_PUBLIC_APP_VERSION_API_URL ?? 'http://10.0.2.2:8080/api/app/version',
} as const;

export type DoubanContentType = 'movie' | 'tv';

export const DOUBAN_ENDPOINTS = {
  tags: (type: DoubanContentType) => `${DOUBAN_BASE_URL}/j/search_tags?type=${type}`,
  subjects: (type: DoubanContentType, tag: string, start: number) =>
    `${DOUBAN_BASE_URL}/j/search_subjects?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=20&page_start=${start}`,
} as const;

export const DOUBAN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'text/plain',
  'Content-Type': 'application/text',
} as const;
