export class LatestRequest {
  private current = 0;

  next() {
    this.current += 1;
    return this.current;
  }

  isCurrent(id: number) {
    return id === this.current;
  }

  invalidate() {
    this.current += 1;
  }
}

export function nextPageStartAfterLoad(currentStart: number, loadedCount: number) {
  return loadedCount > 0 ? currentStart + loadedCount : currentStart;
}
