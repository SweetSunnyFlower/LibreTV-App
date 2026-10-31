import type { IptvSourceInput } from '@/models/iptv';

export const PREDEFINED_IPTV_SOURCES: IptvSourceInput[] = [
  { name: '中国频道', url: 'https://cdn.jsdelivr.net/gh/iptv-org/iptv@gh-pages/countries/cn.m3u' },
  { name: '中文频道', url: 'https://cdn.jsdelivr.net/gh/iptv-org/iptv@gh-pages/languages/zho.m3u' },
  { name: '新闻分类', url: 'https://cdn.jsdelivr.net/gh/iptv-org/iptv@gh-pages/categories/news.m3u' },
  { name: '全球全量', url: 'https://cdn.jsdelivr.net/gh/iptv-org/iptv@gh-pages/index.m3u' },
];
