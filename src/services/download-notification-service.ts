import type { DownloadRecord } from '@/models/download';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const DOWNLOAD_NOTIFICATION_CHANNEL_ID = 'downloads';

export function configureDownloadNotificationHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannelAsync() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DOWNLOAD_NOTIFICATION_CHANNEL_ID, {
    name: '下载通知',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#E53935',
  });
}

export async function ensureDownloadNotificationPermissionsAsync({ request }: { request: boolean }) {
  if (Platform.OS === 'web') return false;

  try {
    await ensureAndroidChannelAsync();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!request) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.warn('[DownloadNotification] Permission check failed:', error);
    return false;
  }
}

export async function notifyDownloadCompletedAsync(record: DownloadRecord) {
  try {
    const granted = await ensureDownloadNotificationPermissionsAsync({ request: false });
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '下载完成',
        body: `《${record.vodName}》${record.episodeName || '离线视频'} 已下载完成`,
        data: {
          type: 'download-completed',
          downloadId: record.id,
        },
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('[DownloadNotification] Schedule notification failed:', error);
  }
}
