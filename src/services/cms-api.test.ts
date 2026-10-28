import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEpisodes, searchVod } from './cms-api';

describe('parseEpisodes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only m3u8 episodes and preserves source index', () => {
    const result = parseEpisodes(
      '第1集$https://cdn.example/1.m3u8#第2集$https://cdn.example/2.mp4',
      '主线',
      'https://site.example'
    );

    expect(result).toEqual([
      expect.objectContaining({
        name: '第1集',
        kind: 'm3u8',
        source: '主线',
        sourceIndex: 0,
      }),
    ]);
  });

  it('surfaces HTTP errors instead of returning an empty result list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));

    await expect(searchVod('https://site.example', '测试')).rejects.toThrow('搜索失败');
  });
});
