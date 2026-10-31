import { CMS_ENDPOINTS } from '@/constants/api';
import type { CmsApiResponse, VodItem, VodDetail, VodClass, Episode } from '@/models/vod';
import { fetchJsonWithTimeout, isAbortError } from '@/services/http';

function splitFirstDollar(segment: string) {
  const index = segment.indexOf('$');
  if (index < 0) return { name: segment.trim(), url: '' };
  return {
    name: segment.slice(0, index).trim(),
    url: segment.slice(index + 1).trim(),
  };
}

export function normalizePlaybackUrl(url: string, baseUrl?: string): string {
  const decoded = url.replace(/&amp;/g, '&').trim();
  if (!decoded) return '';
  if (/^https?:\/\//i.test(decoded) || /^file:\/\//i.test(decoded) || /^content:\/\//i.test(decoded)) {
    return decoded;
  }
  if (decoded.startsWith('//')) return `https:${decoded}`;
  if (!baseUrl) return decoded;
  try {
    return new URL(decoded, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return decoded;
  }
}

function isM3u8Url(url: string) {
  return /\.m3u8(?:[?#]|$)|m3u8/i.test(url);
}

export async function searchVod(
  siteUrl: string,
  keyword: string,
  signal?: AbortSignal
): Promise<CmsApiResponse<VodItem>> {
  const url = CMS_ENDPOINTS.search(siteUrl, keyword);
  try {
    console.log('[CMS API] Searching:', url);
    const data = await fetchJsonWithTimeout<CmsApiResponse<VodItem>>(url, { signal });
    console.log('[CMS API] Search results:', data.list?.length ?? 0, 'items, total:', data.total);
    return data;
  } catch (err) {
    console.error('[CMS API] Search fetch error:', err);
    if (isAbortError(err)) throw err;
    throw new Error(`搜索失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function fetchCategories(siteUrl: string, signal?: AbortSignal): Promise<VodClass[]> {
  const url = CMS_ENDPOINTS.categories(siteUrl);
  try {
    console.log('[CMS API] Fetching categories:', url);
    const data = await fetchJsonWithTimeout<{ class?: VodClass[] }>(url, { signal });
    return data.class ?? [];
  } catch (err) {
    console.error('[CMS API] Categories fetch error:', err);
    if (isAbortError(err)) throw err;
    throw new Error(`分类加载失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function fetchVodByCategory(
  siteUrl: string,
  typeId: number,
  page = 1,
  year?: string,
  signal?: AbortSignal
): Promise<CmsApiResponse<VodItem>> {
  const url = CMS_ENDPOINTS.categoryList(siteUrl, typeId, page, year);
  try {
    console.log('[CMS API] Fetching category:', url);
    return await fetchJsonWithTimeout<CmsApiResponse<VodItem>>(url, { signal });
  } catch (err) {
    console.error('[CMS API] Category fetch error:', err);
    if (isAbortError(err)) throw err;
    throw new Error(`分类内容加载失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function fetchVodDetail(
  siteUrl: string,
  id: number,
  signal?: AbortSignal
): Promise<VodDetail | null> {
  const url = CMS_ENDPOINTS.detail(siteUrl, id);
  try {
    console.log('[CMS API] Fetching detail:', url);
    const data = await fetchJsonWithTimeout<CmsApiResponse<VodDetail>>(url, { signal });
    return data.list?.[0] ?? null;
  } catch (err) {
    console.error('[CMS API] Detail fetch error:', err);
    if (isAbortError(err)) throw err;
    throw new Error(`详情加载失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Parse MacCMS vod_play_url format.
 * Supports multiple sources separated by $$$ and episodes separated by #.
 */
export function parseEpisodes(vodPlayUrl: string, vodPlayFrom?: string, baseUrl?: string): Episode[] {
  if (!vodPlayUrl) return [];

  const sourceNames = vodPlayFrom?.split('$$$').map((item) => item.trim()).filter(Boolean) ?? [];
  const groups = vodPlayUrl.split('$$$').filter(Boolean);

  return groups.flatMap((group, sourceIndex) => {
    const source = sourceNames[sourceIndex] || (groups.length > 1 ? `线路 ${sourceIndex + 1}` : undefined);
    return group
      .split(/[#\n]+/)
      .filter(Boolean)
      .map((segment) => {
        const { name, url } = splitFirstDollar(segment);
        const normalizedUrl = normalizePlaybackUrl(url, baseUrl);
        return {
          name: name || '播放',
          url: normalizedUrl,
          rawUrl: url,
          source,
          sourceIndex,
          kind: isM3u8Url(normalizedUrl) ? 'm3u8' as const : undefined,
        };
      })
      .filter((ep) => ep.url && ep.kind === 'm3u8');
  });
}
