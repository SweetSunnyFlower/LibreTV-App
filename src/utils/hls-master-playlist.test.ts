import { describe, expect, it } from 'vitest';
import { parseHlsAttributes, selectHlsMasterVariant } from './hls-master-playlist';

describe('selectHlsMasterVariant', () => {
  it('returns null for media playlists', () => {
    expect(selectHlsMasterVariant(['#EXTM3U', '#EXTINF:10,', 'seg1.ts'])).toBeNull();
  });

  it('keeps highest bandwidth variant with its audio/subtitle groups and drops i-frame streams', () => {
    const lines = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-lo",NAME="lo",URI="audio_lo.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-hi",NAME="hi",URI="audio_hi.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="zh",URI="subs.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.4d401e,mp4a.40.2",AUDIO="aud-lo"',
      'low.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud-hi",SUBTITLES="subs"',
      'high.m3u8',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="iframe.m3u8"',
    ];
    expect(selectHlsMasterVariant(lines)).toEqual([
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-hi",NAME="hi",URI="audio_hi.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="zh",URI="subs.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud-hi",SUBTITLES="subs"',
      'high.m3u8',
    ]);
  });

  it('parses quoted attributes containing commas', () => {
    expect(parseHlsAttributes('#EXT-X-STREAM-INF:CODECS="a,b",BANDWIDTH=5')).toEqual({ CODECS: 'a,b', BANDWIDTH: '5' });
  });
});
