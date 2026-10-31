import { describe, expect, it } from 'vitest';
import { liveFavoriteChannelKey } from './live-favorite';

describe('liveFavoriteChannelKey', () => {
  it('uses the channel id for online-library favorites', () => {
    expect(liveFavoriteChannelKey('library', 'CCTV1-CN', 'https://example.com/live.m3u8'))
      .toBe('CCTV1-CN');
  });

  it('uses the stream URL for M3U favorites', () => {
    expect(liveFavoriteChannelKey('m3u', null, 'https://example.com/live.m3u8'))
      .toBe('https://example.com/live.m3u8');
  });

  it('uses an empty key for an invalid online-library favorite', () => {
    expect(liveFavoriteChannelKey('library', null, 'https://example.com/live.m3u8'))
      .toBe('');
  });
});
