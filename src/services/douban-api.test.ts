import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRecommendedMovies } from './douban-api';

describe('fetchRecommendedMovies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces network errors instead of reporting an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));

    await expect(fetchRecommendedMovies('热门')).rejects.toThrow('推荐内容加载失败');
  });
});
