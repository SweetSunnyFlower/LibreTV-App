import { describe, expect, it } from 'vitest';
import { LatestRequest, nextPageStartAfterLoad } from './latest-request';

describe('LatestRequest', () => {
  it('only accepts the newest request', () => {
    const request = new LatestRequest();
    const first = request.next();
    const second = request.next();

    expect(request.isCurrent(first)).toBe(false);
    expect(request.isCurrent(second)).toBe(true);
    request.invalidate();
    expect(request.isCurrent(second)).toBe(false);
  });

  it('does not advance the page after a failed load', () => {
    expect(nextPageStartAfterLoad(0, 0)).toBe(0);
    expect(nextPageStartAfterLoad(0, 20)).toBe(20);
  });
});
