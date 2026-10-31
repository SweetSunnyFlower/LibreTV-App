import type { IptvSourceInput } from '@/models/iptv';

export const PREDEFINED_IPTV_SOURCES: IptvSourceInput[] = [
  { name: '中国频道', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u' },
  { name: '中文频道', url: 'https://iptv-org.github.io/iptv/languages/zho.m3u' },
  { name: '新闻分类', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { name: '全球全量', url: 'https://iptv-org.github.io/iptv/index.m3u' },
];
