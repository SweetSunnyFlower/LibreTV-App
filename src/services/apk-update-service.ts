import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const APK_DIRECTORY_NAME = 'app-updates';
const APK_FILE_NAME = 'movie-update.apk';
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

export type ApkDownloadProgress = {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  progress: number | null;
};

type DownloadAndInstallApkOptions = {
  onProgress?: (progress: ApkDownloadProgress) => void;
};

function getApkFileUri() {
  if (!FileSystem.cacheDirectory) {
    throw new Error('无法访问应用缓存目录');
  }

  return `${FileSystem.cacheDirectory}${APK_DIRECTORY_NAME}/${APK_FILE_NAME}`;
}

export async function downloadAndInstallApk(updateUrl: string, options: DownloadAndInstallApkOptions = {}) {
  if (Platform.OS !== 'android') {
    throw new Error('当前仅支持 Android 安装更新包');
  }

  const apkUri = getApkFileUri();
  const apkDir = apkUri.slice(0, apkUri.lastIndexOf('/') + 1);

  await FileSystem.makeDirectoryAsync(apkDir, { intermediates: true });
  await FileSystem.deleteAsync(apkUri, { idempotent: true });

  const downloadTask = FileSystem.createDownloadResumable(updateUrl, apkUri, {}, (progressData) => {
    const { totalBytesExpectedToWrite, totalBytesWritten } = progressData;
    options.onProgress?.({
      totalBytesExpectedToWrite,
      totalBytesWritten,
      progress: totalBytesExpectedToWrite > 0 ? totalBytesWritten / totalBytesExpectedToWrite : null,
    });
  });

  const downloadResult = await downloadTask.downloadAsync();
  if (!downloadResult) {
    throw new Error('更新包下载已取消');
  }

  if (downloadResult.status < 200 || downloadResult.status >= 300) {
    throw new Error(`更新包下载失败：HTTP ${downloadResult.status}`);
  }

  options.onProgress?.({
    totalBytesExpectedToWrite: 1,
    totalBytesWritten: 1,
    progress: 1,
  });

  const contentUri = await FileSystem.getContentUriAsync(downloadResult.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}
