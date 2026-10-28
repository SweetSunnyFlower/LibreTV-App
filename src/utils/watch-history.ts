export function canonicalEpisodeUrl(episodeUrl: string) {
  try {
    const url = new URL(episodeUrl);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return episodeUrl.split(/[?#]/)[0] ?? episodeUrl;
  }
}

export function stableWatchHistoryId(input: {
  siteUrl?: string;
  vodId?: number | null;
  sourceIndex?: number | null;
  sourceName?: string;
  episodeName?: string;
  episodeUrl: string;
}) {
  const canonicalUrl = canonicalEpisodeUrl(input.episodeUrl);
  if (input.siteUrl && input.vodId) {
    return [
      input.siteUrl,
      input.vodId,
      input.sourceIndex ?? '',
      input.sourceName ?? '',
      input.episodeName ?? '',
      canonicalUrl,
    ].join('::');
  }
  return `local::${canonicalUrl}`;
}
