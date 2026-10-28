import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePlaybackUrl } from './playback-resolver';

describe('resolvePlaybackUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not read a video response body as text', async () => {
    const text = vi.fn(async () => 'binary');
    const cancel = vi.fn(async () => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      url: 'https://cdn.example/opaque-stream',
      headers: new Headers({ 'content-type': 'video/mp4' }),
      body: { cancel },
      text,
    })));

    const result = await resolvePlaybackUrl({
      url: 'https://cdn.example/opaque-stream',
      siteUrl: 'https://site.example',
    });

    expect(result.kind).toBe('mp4');
    expect(result.playableUrl).toBe('https://cdn.example/opaque-stream');
    expect(text).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('resolves a relative m3u8 URL against the final page URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<script>player.source = "/streams/index.m3u8?token=abc";</script>',
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }
    )));

    const result = await resolvePlaybackUrl({
      url: 'https://site.example/play/1',
      detailUrl: 'https://site.example/detail/1',
    });

    expect(result.kind).toBe('hls');
    expect(result.playableUrl).toBe('https://site.example/streams/index.m3u8?token=abc');
  });
});
