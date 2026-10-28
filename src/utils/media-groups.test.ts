import { describe, expect, it } from 'vitest';
import { downloadFolderKey } from './media-groups';

describe('downloadFolderKey', () => {
  it('keeps same-named videos from different sites in separate folders', () => {
    const first = downloadFolderKey({
      vodName: '同名影片',
      siteUrl: 'https://site-a.example',
      detailUrl: 'https://site-a.example/detail/1',
    });
    const second = downloadFolderKey({
      vodName: '同名影片',
      siteUrl: 'https://site-b.example',
      detailUrl: 'https://site-b.example/detail/1',
    });

    expect(first).not.toBe(second);
  });
});
