import { describe, expect, it } from 'vitest';
import { aggregateSearchError, aggregateSearchStatus } from './search-status';

describe('aggregate search status', () => {
  it('reports a network error only when every site failed', () => {
    expect(aggregateSearchError(2, 2)).toBe('所有站点搜索失败，请检查网络后重试');
    expect(aggregateSearchError(1, 2)).toBe('');
    expect(aggregateSearchError(0, 0)).toBe('');
  });

  it('includes the failed-site count in the completed status', () => {
    expect(aggregateSearchStatus(2, 1, 8)).toBe('共搜索 2 个站点 · 失败 1 个 · 找到 8 个结果');
  });
});
