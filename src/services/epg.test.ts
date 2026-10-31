import { describe, expect, it } from 'vitest';
import { parseXmltv } from './epg';

describe('parseXmltv', () => {
  it('parses programme attributes and child fields', () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<tv>',
      '<programme start="20261031060000 +0800" stop="20261031063000 +0800" channel="CCTV1.cn">',
      '<title>新闻联播</title>',
      '<desc>News &amp; more</desc>',
      '<category>News</category>',
      '</programme>',
      '</tv>',
    ].join('');

    const programmes = parseXmltv(xml);

    expect(programmes).toHaveLength(1);
    expect(programmes[0].channel).toBe('CCTV1.cn');
    expect(programmes[0].title).toBe('新闻联播');
    expect(programmes[0].description).toBe('News & more');
    expect(programmes[0].category).toBe('News');
    expect(programmes[0].start).toBeGreaterThan(0);
    expect(programmes[0].stop).toBeGreaterThan(programmes[0].start);
  });
});
