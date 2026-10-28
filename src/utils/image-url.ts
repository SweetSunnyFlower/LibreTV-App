export const CMS_IMAGE_HEADERS = { Referer: 'https://movie.douban.com/' };
export const DOUBAN_IMAGE_HEADERS = { Referer: 'https://movie.douban.com/' };

export function normalizeImageUrl(url?: string | null, baseUrl?: string) {
  const decoded = url?.replace(/&amp;/g, '&').trim();
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
