import { runBackgroundDownloadWorker } from '@/services/download-background-worker';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const BACKGROUND_DOWNLOAD_TASK = 'background-download-task';

if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
    try {
      await runBackgroundDownloadWorker();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.warn('[Download] Background task failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundDownloadTaskAsync() {
  if (Platform.OS === 'web') return;
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_DOWNLOAD_TASK);
  if (registered) return;
  await BackgroundTask.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
    minimumInterval: 15,
  });
}
