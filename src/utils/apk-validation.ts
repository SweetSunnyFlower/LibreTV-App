export function canInstallApk(platform: string) {
  return platform === 'android';
}

export function validateApkUrl(url: string) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('更新包必须使用 HTTPS 地址');
  }
}

export function validateApkMetadata(
  fileSize: number,
  expected?: { size?: number; md5?: string },
  actualMd5?: string | null
) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error('更新包为空');
  }
  if (expected?.size && fileSize !== expected.size) {
    throw new Error('更新包大小校验失败');
  }
  if (expected?.md5 && actualMd5?.toLowerCase() !== expected.md5.toLowerCase()) {
    throw new Error('更新包校验失败');
  }
}
