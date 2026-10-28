import { describe, expect, it } from 'vitest';
import { stableWatchHistoryId } from './watch-history';

describe('stableWatchHistoryId', () => {
  it('ignores temporary query tokens in episode URLs', () => {
    const base = {
      siteUrl: 'https://site.example',
      vodId: 7,
      sourceIndex: 1,
      sourceName: '线路 A',
      episodeName: '第1集',
    };

    expect(stableWatchHistoryId({
      ...base,
      episodeUrl: 'https://cdn.example/1.m3u8?token=a',
    })).toBe(stableWatchHistoryId({
      ...base,
      episodeUrl: 'https://cdn.example/1.m3u8?token=b#fragment',
    }));
  });

  it('keeps local URIs stable without requiring VOD metadata', () => {
    expect(stableWatchHistoryId({
      episodeUrl: 'file:///downloads/episode.m3u8',
    })).toBe('local::file:///downloads/episode.m3u8');
  });
});
