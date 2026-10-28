import { describe, expect, it } from 'vitest';
import { canInstallApk, validateApkMetadata, validateApkUrl } from './apk-validation';

describe('APK validation', () => {
  it('requires HTTPS download URLs', () => {
    expect(() => validateApkUrl('http://example.com/app.apk')).toThrow('HTTPS');
    expect(() => validateApkUrl('https://example.com/app.apk')).not.toThrow();
  });

  it('rejects empty, wrong-sized, and bad-digest files', () => {
    expect(() => validateApkMetadata(0)).toThrow('更新包为空');
    expect(() => validateApkMetadata(100, { size: 200 })).toThrow('大小校验失败');
    expect(() => validateApkMetadata(100, { md5: 'expected' }, 'actual')).toThrow('校验失败');
    expect(() => validateApkMetadata(100, { size: 100, md5: 'ABC' }, 'abc')).not.toThrow();
  });

  it('allows installation only on Android', () => {
    expect(canInstallApk('android')).toBe(true);
    expect(canInstallApk('ios')).toBe(false);
    expect(canInstallApk('web')).toBe(false);
  });
});
