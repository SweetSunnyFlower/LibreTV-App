import { DOUBAN_ENDPOINTS, DOUBAN_HEADERS, type DoubanContentType } from '@/constants/api';
import type { DoubanMovie } from '@/models/douban';

// Fallback tags in case the API is blocked
const FALLBACK_TAGS = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本'];

export async function fetchMovieTags(type: DoubanContentType = 'movie'): Promise<string[]> {
  try {
    const url = DOUBAN_ENDPOINTS.tags(type);
    console.log('[DoubanAPI] Fetching tags from:', url);
    const res = await fetch(url, {
      headers: {
        ...DOUBAN_HEADERS,
        Referer: 'https://movie.douban.com/',
      },
    });
    console.log('[DoubanAPI] Tags response status:', res.status);
    if (!res.ok) {
      console.warn('[DoubanAPI] Tags request not ok, using fallback');
      return FALLBACK_TAGS;
    }
    const text = await res.text();
    console.log('[DoubanAPI] Tags response body:', text.substring(0, 200));
    const data = JSON.parse(text);
    if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
      return data.tags;
    }
    return FALLBACK_TAGS;
  } catch (err) {
    console.error('[DoubanAPI] Tags fetch error:', err);
    return FALLBACK_TAGS;
  }
}

export async function fetchRecommendedMovies(
  tag: string,
  start = 0,
  type: DoubanContentType = 'movie'
): Promise<DoubanMovie[]> {
  try {
    const url = DOUBAN_ENDPOINTS.subjects(type, tag, start);
    console.log('[DoubanAPI] Fetching subjects from:', url);
    const res = await fetch(url, {
      headers: {
        ...DOUBAN_HEADERS,
        Referer: 'https://movie.douban.com/',
      },
    });
    console.log('[DoubanAPI] Subjects response status:', res.status);
    if (!res.ok) {
      console.warn('[DoubanAPI] Subjects request not ok:', res.status);
      return [];
    }
    const text = await res.text();
    console.log('[DoubanAPI] Subjects response length:', text.length);
    const data = JSON.parse(text);
    const subjects = data.subjects ?? [];
    console.log('[DoubanAPI] Got', subjects.length, 'movies');
    return subjects;
  } catch (err) {
    console.error('[DoubanAPI] Subjects fetch error:', err);
    return [];
  }
}
