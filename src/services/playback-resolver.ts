import type { VideoSource } from 'expo-video';
import { requestWithTimeout } from '@/services/http';

export type PlaybackKind = 'hls' | 'mp4' | 'flv' | 'direct' | 'unsupported';

export interface PlaybackResolveResult {
  originalUrl: string;
  normalizedUrl: string;
  playableUrl: string;
  kind: PlaybackKind;
  source: VideoSource;
  headers?: Record<string, string>;
  error?: string;
  diagnostics: {
    status?: number;
    contentType?: string | null;
    finalUrl?: string;
    reason?: string;
  };
}

interface ResolvePlaybackUrlOptions {
  url: string;
  siteUrl?: string;
  detailUrl?: string;
  sourceName?: string;
  title?: string;
  signal?: AbortSignal;
}

const DIRECT_MEDIA_RE = /\.(m3u8|mp4|m4v|mov|webm|flv|ts)(?:[?#]|$)/i;
const HLS_RE = /m3u8|application\/vnd\.apple\.mpegurl|application\/x-mpegurl/i;
const PLAYBACK_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const VIDEO_RE = /\.(mp4|m4v|mov|webm|flv|ts)(?:[?#]|$)/i;
const MEDIA_URL_RE = /https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:m3u8|mp4|m4v|mov|webm|flv|ts)(?:\?[^\s"'<>\\]*)?/gi;
const RELATIVE_MEDIA_URL_RE = /(?:["'=:]\s*)((?:\/|\.{1,2}\/)?[^"'<>\\\s]+?\.(?:m3u8|mp4|m4v|mov|webm|flv|ts)(?:\?[^"'<>\\\s]*)?)/gi;
const MAX_PAGE_BYTES = 1024 * 1024;

export function normalizePlaybackUri(url: string, baseUrl?: string): string {
  const decoded = decodeHtml(url).trim();
  if (!decoded) return '';
  if (/^https?:\/\//i.test(decoded) || /^file:\/\//i.test(decoded) || /^content:\/\//i.test(decoded)) return decoded;
  if (decoded.startsWith('//')) return `https:${decoded}`;
  if (!baseUrl) return decoded;
  try {
    return new URL(decoded, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return decoded;
  }
}

export function isHlsPlaybackUrl(url: string) {
  return HLS_RE.test(url.toLowerCase());
}

export function isDirectMediaUrl(url: string) {
  return DIRECT_MEDIA_RE.test(url.toLowerCase()) || /^file:\/\//i.test(url) || /^content:\/\//i.test(url);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\\//g, '/');
}

function tryDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mediaKind(url: string): PlaybackKind {
  const lower = url.toLowerCase();
  if (isHlsPlaybackUrl(lower)) return 'hls';
  if (/\.flv(?:[?#]|$)/i.test(lower)) return 'flv';
  if (VIDEO_RE.test(lower) || /^file:\/\//i.test(lower) || /^content:\/\//i.test(lower)) return 'mp4';
  return 'direct';
}

function originOf(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/$/, '');
  }
}

function buildPlaybackHeaders(referer?: string) {
  if (!referer) return undefined;
  return {
    Referer: referer,
    Origin: originOf(referer),
    'User-Agent': PLAYBACK_USER_AGENT,
    Accept: '*/*',
  };
}

function buildSource(uri: string, kind: PlaybackKind, headers?: Record<string, string>, title?: string): VideoSource {
  return {
    uri,
    ...(headers ? { headers } : {}),
    ...(kind === 'hls' ? { contentType: 'hls' as const } : {}),
    metadata: title ? { title } : undefined,
  };
}

function extractNestedUrl(url: string, baseUrl?: string) {
  try {
    const parsed = new URL(url);
    for (const key of ['url', 'play', 'src', 'video', 'v']) {
      const value = parsed.searchParams.get(key);
      if (value) {
        const decoded = normalizePlaybackUri(tryDecodeURIComponent(value), baseUrl);
        if (isDirectMediaUrl(decoded)) return decoded;
      }
    }
  } catch {
    // ignore invalid URL
  }
  return '';
}

function extractMediaFromText(text: string, baseUrl?: string) {
  const decoded = decodeHtml(tryDecodeURIComponent(text));
  const absoluteMatches = decoded.match(MEDIA_URL_RE) ?? [];
  const relativeMatches = Array.from(decoded.matchAll(RELATIVE_MEDIA_URL_RE))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value) && !/^https?:\/\//i.test(value));
  const cleaned = [...absoluteMatches, ...relativeMatches]
    .map((item) => normalizePlaybackUri(item.replace(/\\/g, ''), baseUrl))
    .filter(Boolean);
  const hls = cleaned.find((item) => isHlsPlaybackUrl(item));
  return hls || cleaned[0] || '';
}

async function readTextWithLimit(response: Response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PAGE_BYTES) {
    throw new Error('播放页内容过大，已停止解析');
  }

  const reader = response.body?.getReader();
  if (!reader || typeof TextDecoder === 'undefined') {
    return response.text();
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new Error('播放页内容过大，已停止解析');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchPageForMedia(
  url: string,
  headers?: Record<string, string>,
  baseUrl?: string,
  signal?: AbortSignal
) {
  return requestWithTimeout(url, { headers, signal }, async (res) => {
    const contentType = res.headers.get('content-type');
    const lowerContentType = contentType?.toLowerCase() ?? '';
    if (/^(video|audio)\//.test(lowerContentType)) {
      await res.body?.cancel();
      return {
        status: res.status,
        contentType,
        finalUrl: res.url,
        extracted: '',
        directMediaKind: (
          lowerContentType.includes('mpegurl')
            ? 'hls'
            : lowerContentType.includes('mp4')
              ? 'mp4'
              : 'direct'
        ) as PlaybackKind,
        isPlaylist: false,
      };
    }

    const text = await readTextWithLimit(res);
    const extracted = extractMediaFromText(text, res.url || baseUrl);
    return {
      status: res.status,
      contentType,
      finalUrl: res.url,
      extracted,
      directMediaKind: undefined,
      isPlaylist: text.trimStart().startsWith('#EXTM3U'),
    };
  });
}

export async function resolvePlaybackUrl({
  url,
  siteUrl,
  detailUrl,
  title,
  signal,
}: ResolvePlaybackUrlOptions): Promise<PlaybackResolveResult> {
  const referer = detailUrl || siteUrl;
  const baseUrl = detailUrl || siteUrl;
  const originalUrl = url;
  const normalizedUrl = normalizePlaybackUri(url, baseUrl);
  const headers = buildPlaybackHeaders(referer);

  if (!normalizedUrl) {
    return {
      originalUrl,
      normalizedUrl,
      playableUrl: '',
      kind: 'unsupported',
      source: null,
      headers,
      error: '播放地址为空',
      diagnostics: { reason: 'empty-url' },
    };
  }

  const nestedUrl = extractNestedUrl(normalizedUrl, baseUrl);
  const candidate = nestedUrl || normalizedUrl;

  if (isDirectMediaUrl(candidate)) {
    const kind = mediaKind(candidate);
    return {
      originalUrl,
      normalizedUrl,
      playableUrl: candidate,
      kind,
      source: buildSource(candidate, kind, headers, title),
      headers,
      diagnostics: { reason: nestedUrl ? 'nested-direct-media' : 'direct-media' },
    };
  }

  try {
    const page = await fetchPageForMedia(candidate, headers, baseUrl, signal);
    if (page.directMediaKind) {
      return {
        originalUrl,
        normalizedUrl,
        playableUrl: candidate,
        kind: page.directMediaKind,
        source: buildSource(candidate, page.directMediaKind, headers, title),
        headers,
        diagnostics: {
          status: page.status,
          contentType: page.contentType,
          finalUrl: page.finalUrl,
          reason: 'direct-media-response',
        },
      };
    }
    if (page.isPlaylist) {
      return {
        originalUrl,
        normalizedUrl,
        playableUrl: candidate,
        kind: 'hls',
        source: buildSource(candidate, 'hls', headers, title),
        headers,
        diagnostics: {
          status: page.status,
          contentType: page.contentType,
          finalUrl: page.finalUrl,
          reason: 'playlist-body',
        },
      };
    }

    if (page.extracted) {
      const playableUrl = normalizePlaybackUri(page.extracted, page.finalUrl || baseUrl);
      const kind = mediaKind(playableUrl);
      return {
        originalUrl,
        normalizedUrl,
        playableUrl,
        kind,
        source: buildSource(playableUrl, kind, headers, title),
        headers,
        diagnostics: {
          status: page.status,
          contentType: page.contentType,
          finalUrl: page.finalUrl,
          reason: 'extracted-from-page',
        },
      };
    }

    return {
      originalUrl,
      normalizedUrl,
      playableUrl: '',
      kind: 'unsupported',
      source: null,
      headers,
      error: page.contentType?.includes('text/html') ? '这是网页播放页，未能解析出真实视频地址' : '未能解析出可播放地址',
      diagnostics: {
        status: page.status,
        contentType: page.contentType,
        finalUrl: page.finalUrl,
        reason: 'no-media-found',
      },
    };
  } catch (err) {
    return {
      originalUrl,
      normalizedUrl,
      playableUrl: '',
      kind: 'unsupported',
      source: null,
      headers,
      error: `解析播放地址失败：${String(err)}`,
      diagnostics: { reason: 'resolver-fetch-error' },
    };
  }
}
