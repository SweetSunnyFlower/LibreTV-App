import { DOUBAN_ENDPOINTS, DOUBAN_HEADERS, type DoubanContentType } from '@/constants/api';
import type { DoubanMovie } from '@/models/douban';
import { fetchJsonWithTimeout } from '@/services/http';

// Fallback tags in case the API is blocked
const FALLBACK_TAGS = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本'];

export async function fetchMovieTags(type: DoubanContentType = 'movie'): Promise<string[]> {
  try {
    const url = DOUBAN_ENDPOINTS.tags(type);
    console.log('[DoubanAPI] Fetching tags from:', url);
    const data = await fetchJsonWithTimeout<{ tags?: string[] }>(url, {
      headers: {
        ...DOUBAN_HEADERS,
        Referer: 'https://movie.douban.com/',
      },
    });
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
    const data = await fetchJsonWithTimeout<{ subjects?: DoubanMovie[] }>(url, {
      headers: {
        ...DOUBAN_HEADERS,
        Referer: 'https://movie.douban.com/',
      },
    });
    const subjects = data.subjects ?? [];
    console.log('[DoubanAPI] Got', subjects.length, 'movies');
    return subjects;
  } catch (err) {
    console.error('[DoubanAPI] Subjects fetch error:', err);
    throw new Error(`推荐内容加载失败：${err instanceof Error ? err.message : String(err)}`);
  }
}
