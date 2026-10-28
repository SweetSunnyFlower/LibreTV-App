import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTextWithTimeout } from './http';

describe('fetchTextWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects HTTP error responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    })));

    await expect(fetchTextWithTimeout('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });

  it('rejects immediately when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(fetchTextWithTimeout('https://example.com', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
