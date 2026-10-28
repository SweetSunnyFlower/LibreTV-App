export function aggregateSearchError(failedSites: number, totalSites: number) {
  return totalSites > 0 && failedSites === totalSites
    ? '所有站点搜索失败，请检查网络后重试'
    : '';
}

export function aggregateSearchStatus(totalSites: number, failedSites: number, resultCount: number) {
  return `共搜索 ${totalSites} 个站点 · 失败 ${failedSites} 个 · 找到 ${resultCount} 个结果`;
}
