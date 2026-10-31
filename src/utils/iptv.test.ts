import { describe, expect, it } from 'vitest';
import { groupIptvChannels, parseM3U } from './iptv';

const SAMPLE = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="cctv1.cn" tvg-logo="https://example.com/cctv1.png" group-title="央视",CCTV-1 综合',
  'https://example.com/cctv1.m3u8',
  '#EXTINF:-1 group-title="地方",湖南卫视',
  'https://example.com/hunan.m3u8',
].join('\n');

describe('parseM3U', () => {
  it('parses channel names, urls, logos and groups', () => {
    const channels = parseM3U(SAMPLE);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toEqual({
      name: 'CCTV-1 综合',
      url: 'https://example.com/cctv1.m3u8',
      logo: 'https://example.com/cctv1.png',
      group: '央视',
    });
    expect(channels[1]).toEqual({
      name: '湖南卫视',
      url: 'https://example.com/hunan.m3u8',
      logo: undefined,
      group: '地方',
    });
  });

  it('returns an empty array for empty content', () => {
    expect(parseM3U('#EXTM3U')).toEqual([]);
  });
});

describe('groupIptvChannels', () => {
  it('groups channels by group title and preserves order', () => {
    const groups = groupIptvChannels(parseM3U(SAMPLE));
    expect(groups.map((item) => item.name)).toEqual(['央视', '地方']);
    expect(groups[0].channels).toHaveLength(1);
    expect(groups[1].channels[0].name).toBe('湖南卫视');
  });

  it('puts channels without a group into 未分组', () => {
    const groups = groupIptvChannels([{ name: 'A', url: 'https://a.example' }]);
    expect(groups[0].name).toBe('未分组');
  });
});
