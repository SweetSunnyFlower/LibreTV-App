import { describe, expect, it } from 'vitest';
import { formatCntvDate, parseXmltv } from './epg';

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

describe('parseXmltv timezone', () => {
  it('applies the XMLTV timezone offset', () => {
    const xml = [
      '<programme start="20261031200000 +0800" stop="20261031203000 -0130" channel="A">',
      '<title>T</title>',
      '</programme>',
    ].join('');
    const [programme] = parseXmltv(xml);
    expect(programme.start).toBe(Date.UTC(2026, 9, 31, 12, 0, 0) / 1000);
    expect(programme.stop).toBe(Date.UTC(2026, 9, 31, 22, 0, 0) / 1000);
  });

  it('treats timestamps without offset as UTC', () => {
    const [programme] = parseXmltv('<programme start="20261031200000" stop="20261031210000" channel="A"><title>T</title></programme>');
    expect(programme.start).toBe(Date.UTC(2026, 9, 31, 20, 0, 0) / 1000);
  });
});

describe('formatCntvDate', () => {
  it('formats dates in Beijing time', () => {
    expect(formatCntvDate(new Date(Date.UTC(2026, 9, 31, 15, 59, 59)))).toBe('20261031');
    expect(formatCntvDate(new Date(Date.UTC(2026, 9, 31, 16, 0, 0)))).toBe('20261101');
    expect(formatCntvDate(new Date(Date.UTC(2026, 11, 31, 20, 0, 0)))).toBe('20270101');
  });
});
