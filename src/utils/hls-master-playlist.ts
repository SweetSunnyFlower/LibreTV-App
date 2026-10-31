const HLS_ATTR_RE = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;

export function parseHlsAttributes(line: string) {
  const attrs: Record<string, string> = {};
  const colon = line.indexOf(':');
  if (colon < 0) return attrs;
  for (const match of line.slice(colon + 1).matchAll(HLS_ATTR_RE)) {
    const key = match[1];
    const raw = match[2] ?? '';
    if (key) attrs[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
  return attrs;
}

function isUriLine(line: string) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#');
}

/**
 * Master playlist 只保留一个变体（BANDWIDTH 最高）及其引用的 AUDIO/SUBTITLES/VIDEO 分组，
 * 丢弃 I-frame 流和其他变体。非 master playlist 返回 null，调用方按原样处理。
 */
export function selectHlsMasterVariant(lines: string[]): string[] | null {
  const variants: Array<{ index: number; uriIndex: number; bandwidth: number; attrs: Record<string, string> }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? '';
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    let uriIndex = i + 1;
    while (uriIndex < lines.length && !isUriLine(lines[uriIndex] ?? '')) uriIndex += 1;
    if (uriIndex >= lines.length) continue;
    const attrs = parseHlsAttributes(line);
    const bandwidth = Number(attrs.BANDWIDTH ?? attrs['AVERAGE-BANDWIDTH'] ?? 0);
    variants.push({ index: i, uriIndex, bandwidth: Number.isFinite(bandwidth) ? bandwidth : 0, attrs });
  }
  if (variants.length === 0) return null;

  const best = variants.reduce((acc, item) => (item.bandwidth > acc.bandwidth ? item : acc));
  const wantedGroups: Record<string, string | undefined> = {
    AUDIO: best.attrs.AUDIO,
    SUBTITLES: best.attrs.SUBTITLES,
    VIDEO: best.attrs.VIDEO,
  };
  const droppedIndexes = new Set<number>();
  for (const variant of variants) {
    if (variant === best) continue;
    droppedIndexes.add(variant.index);
    droppedIndexes.add(variant.uriIndex);
  }

  const result: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (droppedIndexes.has(i)) continue;
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF')) continue;
    if (trimmed.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseHlsAttributes(trimmed);
      const type = attrs.TYPE ?? '';
      if (type in wantedGroups && attrs['GROUP-ID'] !== wantedGroups[type]) continue;
    }
    result.push(line);
  }
  return result;
}
