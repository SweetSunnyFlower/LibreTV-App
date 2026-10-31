import { useAppDialog } from '@/context/app-dialog-context';
import type { DownloadRecord } from '@/models/download';
import { getAllDownloads, getDownloadById } from '@/services/database';
import {
  cancelDownloadRecord,
  isDownloadSupported,
  looksLikePlayerPage,
  isHlsUrl,
  pauseDownloadRecord,
  resumeDownloadRecord,
  startDownloadRecord,
  startOrResumeForegroundDownload,
  suspendForegroundDownloadsForAppState,
  type StartDownloadOptions,
} from '@/services/download-service';
import { ensureDownloadNotificationPermissionsAsync } from '@/services/download-notification-service';
import { registerBackgroundDownloadTaskAsync } from '@/tasks/background-download-task';
import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

interface DownloadContextValue {
  isHydrating: boolean;
  downloads: DownloadRecord[];
  startDownload: (vodName: string, episodeName: string, url: string, options?: StartDownloadOptions) => Promise<void>;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => Promise<void>;
}

const DownloadContext = createContext<DownloadContextValue>({
  isHydrating: true,
  downloads: [],
  startDownload: async () => {},
  pauseDownload: () => {},
  resumeDownload: () => {},
  cancelDownload: async () => {},
});

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const dialog = useAppDialog();
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<string | null>(Platform.OS === 'web' ? 'active' : AppState.currentState);
  const refreshInFlight = useRef(false);
  const resumeInFlight = useRef(false);

  const upsertDownload = useCallback((record: DownloadRecord | null) => {
    if (!record) return;
    setDownloads((prev) => {
      const exists = prev.some((item) => item.id === record.id);
      if (!exists) return [record, ...prev];
      return prev.map((item) => (item.id === record.id ? record : item));
    });
  }, []);

  const refreshDownloads = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const all = await getAllDownloads(db);
      setDownloads(all);
    } catch (error) {
      // SQLite 在前后台切换时可能短暂 busy。这里保留旧列表，避免因为一次刷新失败
      // 把下载页清空并触发额外重渲染；下一轮前台轮询或 listener 会继续同步。
      console.warn('[Download] Refresh downloads failed:', error);
    } finally {
      refreshInFlight.current = false;
    }
  }, [db]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refreshDownloads();
    }, 1200);
  }, [refreshDownloads]);

  const clearPollTimer = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const schedulePollRefresh = useCallback(() => {
    const schedule = () => {
      if (Platform.OS === 'web' || appStateRef.current !== 'active') return;
      clearPollTimer();
      pollTimer.current = setTimeout(() => {
        pollTimer.current = null;
        void refreshDownloads().finally(schedule);
      }, 5000);
    };
    schedule();
  }, [clearPollTimer, refreshDownloads]);

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshDownloads sets state only after awaiting SQLite queries, not synchronously
    refreshDownloads().finally(() => {
      if (mounted) setIsHydrating(false);
    });
    return () => {
      mounted = false;
    };
  }, [refreshDownloads]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    registerBackgroundDownloadTaskAsync().catch((error: unknown) => {
      console.warn('[Download] Register background task failed:', error);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    schedulePollRefresh();
    return clearPollTimer;
  }, [clearPollTimer, schedulePollRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  const handleRecordChanged = useCallback((record: DownloadRecord | null) => {
    if (record) {
      upsertDownload(record);
      return;
    }
    scheduleRefresh();
  }, [scheduleRefresh, upsertDownload]);

  const resumeForegroundDownloads = useCallback(async () => {
    if (Platform.OS === 'web' || resumeInFlight.current) return;
    resumeInFlight.current = true;
    try {
      const all = await getAllDownloads(db);
      setDownloads(all);
      const runnable = all.filter((record) => (
        record.requestedState === 'running' &&
        record.state !== 'completed' &&
        record.state !== 'error'
      ));

      // 回前台时不要一次性并发恢复所有任务：网络请求、文件系统和 SQLite 写入会同时
      // 抢 JS 线程，正是 release 包“按钮点不动”的高风险场景。串行恢复更慢一点，
      // 但能让 UI 先恢复响应，后续进度通过 listener/轮询自然同步。
      for (const record of runnable) {
        try {
          await startOrResumeForegroundDownload(db, record, handleRecordChanged);
        } catch (error) {
          console.warn('[Download] Resume foreground download failed:', record.id, error);
        }
      }
    } finally {
      resumeInFlight.current = false;
    }
  }, [db, handleRecordChanged]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && previousState !== 'active') {
        void refreshDownloads().finally(schedulePollRefresh);
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => {
          resumeTimer.current = null;
          void resumeForegroundDownloads();
        }, 600);
        return;
      }

      if (previousState === 'active' && nextState !== 'active') {
        clearPollTimer();
        if (resumeTimer.current) {
          clearTimeout(resumeTimer.current);
          resumeTimer.current = null;
        }
        // 退后台时不能调用 pauseDownloadRecord：那代表用户主动暂停，会把
        // requestedState 写成 paused，后台 worker 就无法继续处理。这里仅挂起
        // 前台 JS 下载循环，保留 running 意图，等系统后台时间片或回前台后继续。
        void suspendForegroundDownloadsForAppState(db, handleRecordChanged);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [clearPollTimer, db, handleRecordChanged, refreshDownloads, resumeForegroundDownloads, schedulePollRefresh]);

  const startDownload = useCallback(
    async (vodName: string, episodeName: string, url: string, options?: StartDownloadOptions) => {
      if (!isDownloadSupported()) {
        void dialog.alert('暂不支持下载', 'Web 端暂不支持离线下载，请在 iOS 或 Android 使用。');
        return;
      }

      if (looksLikePlayerPage(url) && !isHlsUrl(url)) {
        void dialog.alert('暂不支持离线下载', '当前播放地址是网页播放页，暂不能直接保存为本地视频，请在线播放。');
        return;
      }

      try {
        void ensureDownloadNotificationPermissionsAsync({ request: true });
        const record = await startDownloadRecord(db, vodName, episodeName, url, options);
        upsertDownload(record);
        void dialog.alert(
          '已加入下载',
          record.downloadType === 'hls' ? '正在缓存 m3u8 分片，可在下载页查看进度。后台会在系统允许时继续缓存。' : '正在下载视频文件，可在下载页查看进度。后台会尝试自动恢复。'
        );
        void startOrResumeForegroundDownload(db, record, handleRecordChanged);
      } catch (error) {
        void dialog.alert('无法下载', String(error));
      }
    },
    [db, dialog, handleRecordChanged, upsertDownload]
  );

  const pauseDownload = useCallback((id: string) => {
    void pauseDownloadRecord(db, id, handleRecordChanged);
  }, [db, handleRecordChanged]);

  const resumeDownload = useCallback((id: string) => {
    void resumeDownloadRecord(db, id, handleRecordChanged);
  }, [db, handleRecordChanged]);

  const cancelDownload = useCallback(
    async (id: string) => {
      const record = await getDownloadById(db, id);
      if (!record) {
        setDownloads((prev) => prev.filter((item) => item.id !== id));
        return;
      }
      await cancelDownloadRecord(db, record, handleRecordChanged);
      setDownloads((prev) => prev.filter((item) => item.id !== id));
    },
    [db, handleRecordChanged]
  );

  return (
    <DownloadContext.Provider value={{ isHydrating, downloads, startDownload, pauseDownload, resumeDownload, cancelDownload }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  return useContext(DownloadContext);
}
