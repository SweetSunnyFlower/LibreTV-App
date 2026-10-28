import { describe, expect, it } from 'vitest';
import { buildFileDownloadName } from './download-path';

describe('buildFileDownloadName', () => {
  it('includes the task ID so duplicate downloads do not share a path', () => {
    const first = buildFileDownloadName('影片', '第1集', 'dl_1', 'https://cdn.example/1.mp4');
    const second = buildFileDownloadName('影片', '第1集', 'dl_2', 'https://cdn.example/1.mp4');

    expect(first).toBe('影片_第1集_dl_1.mp4');
    expect(second).toBe('影片_第1集_dl_2.mp4');
    expect(first).not.toBe(second);
  });

  it('falls back to mp4 for URLs without a supported extension', () => {
    expect(buildFileDownloadName('影片', '第1集', 'dl_3', 'https://cdn.example/stream'))
      .toBe('影片_第1集_dl_3.mp4');
  });
});
