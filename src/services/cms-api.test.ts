import { describe, expect, it } from 'vitest';
import { parseEpisodes } from './cms-api';

describe('parseEpisodes', () => {
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
});
