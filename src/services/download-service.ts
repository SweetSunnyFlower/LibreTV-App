import {
  DEFAULT_HLS_CONCURRENT_DOWNLOADS,
  HLS_CONCURRENT_DOWNLOADS_SETTING_KEY,
  MAX_HLS_CONCURRENT_DOWNLOADS,
  MIN_HLS_CONCURRENT_DOWNLOADS,
} from '@/constants/app-settings';
import type { DownloadRecord, DownloadState, DownloadType } from '@/models/download';
import {
  deleteDownload as dbDeleteDownload,
  getAppSetting,
  getDownloadById,
  insertDownload,
  saveHlsManifest,
  updateDownloadProgress,
  updateDownloadRequestedState,
} from '@/services/database';
import { notifyDownloadCompletedAsync } from '@/services/download-notification-service';
import { buildFileDownloadName } from '@/utils/download-path';
import { runConcurrentWorkers } from '@/utils/concurrent-workers';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

export interface StartDownloadOptions {
  siteUrl?: string;
  detailUrl?: string;
  sourceName?: string;
}

export type DownloadChangeListener = (record: DownloadRecord | null) => void;

type HlsManifestResource = {
  url: string;
  fileName: string;
};

type HlsManifest = {
  version: 1;
  playlistUrl: string;
  outputFile: string;
  hlsDirPath: string;
  playlists: Array<{ fileName: string; content: string }>;
  resources: HlsManifestResource[];
};

type TaskStopReason = 'manual-pause' | 'cancel' | 'app-background' | 'background-deadline' | 'replace';

type HlsController = {
  paused: boolean;
  stopReason?: TaskStopReason;
};

type ActiveTask = {
  task?: any;
  dest?: any;
  hlsController?: HlsController;
  stopReason?: TaskStopReason;
  mode?: 'foreground' | 'background';
};

let File: any = null;
let Paths: any = null;
let Directory: any = null;

if (Platform.OS !== 'web') {
  try {
    const fs = require('expo-file-system');
    File = fs.File;
    Paths = fs.Paths;
    Directory = fs.Directory;
  } catch {
    // expo-file-system not available
  }
}

let DOWNLOAD_DIR: any = null;
let downloadIdCounter = 0;
const activeTasks = new Map<string, ActiveTask>();
const HLS_SEGMENT_RE = /^(?!#)\S+/;
const HLS_URI_ATTR_RE = /URI="([^"]+)"/g;
const DOWNLOAD_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const FOREGROUND_PROGRESS_FLUSH_MS = 1000;
const BACKGROUND_PROGRESS_FLUSH_MS = 2000;

function generateId() {
  downloadIdCounter += 1;
  return `dl_${Date.now()}_${downloadIdCounter}`;
}

export function isDownloadSupported() {
  return Platform.OS !== 'web' && !!File && !!Paths && !!Directory;
}

export function isHlsUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.includes('.m3u8') || lower.includes('m3u8');
}

export function looksLikePlayerPage(url: string) {
  const lower = url.toLowerCase().split('?')[0] ?? '';
  return lower.endsWith('.html') || lower.includes('/vod/play') || lower.includes('/vodplay') || lower.includes('/play/');
}

async function validateFileDownloadUrl(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers,
      signal: controller.signal,
    });
    if (response.status === 405 || response.status === 501) return;
    if (!response.ok) {
      throw new Error(`下载地址不可用：HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) {
      throw new Error('当前播放地址是网页播放页，暂不能直接保存为本地视频');
    }
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader === null ? NaN : Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength <= 0) {
      throw new Error('下载文件为空');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('下载地址检测超时，请稍后重试');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extensionFromUrl(url: string, fallback = '.ts') {
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.[a-z0-9]{2,5}$/i);
  return match?.[0] ?? fallback;
}

function originOf(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/$/, '');
  }
}

export function buildDownloadHeaders(options?: StartDownloadOptions) {
  const referer = options?.detailUrl || options?.siteUrl;
  if (!referer) return undefined;
  return {
    Referer: referer,
    Origin: originOf(referer),
    'User-Agent': DOWNLOAD_USER_AGENT,
    Accept: '*/*',
  };
}

function parseHeaders(headersJson?: string) {
  if (!headersJson) return undefined;
  try {
    const parsed = JSON.parse(headersJson) as Record<string, string>;
    return Object.keys(parsed).length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHlsConcurrency(value: string | null) {
  const parsed = value ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_HLS_CONCURRENT_DOWNLOADS;
  return Math.min(MAX_HLS_CONCURRENT_DOWNLOADS, Math.max(MIN_HLS_CONCURRENT_DOWNLOADS, Math.floor(parsed)));
}

function getDownloadDir() {
  if (!DOWNLOAD_DIR && File && Paths && Directory) {
    DOWNLOAD_DIR = new Directory(Paths.document, 'downloads');
  }
  return DOWNLOAD_DIR;
}

function fileFromUri(uri: string) {
  if (!File || !uri) return null;
  try {
    return new File(uri);
  } catch {
    return null;
  }
}

function directoryFromUri(uri: string) {
  if (!Directory || !uri) return null;
  try {
    return new Directory(uri);
  } catch {
    return null;
  }
}

async function ensureDirectoryExists(directory: any) {
  if (!directory?.exists) {
    await directory.create({ intermediates: true, idempotent: true });
  }
}

async function deleteIfExists(target: any) {
  try {
    if (target?.exists) await target.delete();
  } catch {
    // ignore filesystem cleanup errors
  }
}

async function writeTextFile(file: any, text: string) {
  await ensureDirectoryExists(file.parentDirectory);
  if (!file.exists) {
    await file.create({ intermediates: true, overwrite: true });
  }
  await file.write(text);
}

async function notifyRecord(db: SQLiteDatabase, id: string, listener?: DownloadChangeListener) {
  if (!listener) return;
  listener(await getDownloadById(db, id));
}

async function updateProgress(
  db: SQLiteDatabase,
  id: string,
  partial: {
    state?: DownloadState;
    bytesWritten?: number;
    totalBytes?: number;
    destPath?: string;
    hlsManifestJson?: string;
    lastError?: string;
    retryCount?: number;
  },
  listener?: DownloadChangeListener
) {
  const previous = partial.state === 'completed' ? await getDownloadById(db, id) : null;
  await updateDownloadProgress(db, id, partial);
  const updated = await getDownloadById(db, id);
  if (listener) listener(updated);

  if (partial.state === 'completed' && previous?.state !== 'completed' && updated?.state === 'completed') {
    void notifyDownloadCompletedAsync(updated);
  }
}

async function setRequestedState(
  db: SQLiteDatabase,
  id: string,
  requestedState: 'running' | 'paused' | 'cancelled',
  state?: DownloadState,
  listener?: DownloadChangeListener
) {
  await updateDownloadRequestedState(db, id, requestedState, state);
  await notifyRecord(db, id, listener);
}

function stopActiveTask(id: string, stopReason: TaskStopReason) {
  const entry = activeTasks.get(id);
  if (!entry) return null;

  entry.stopReason = stopReason;
  if (entry.hlsController) {
    entry.hlsController.paused = true;
    entry.hlsController.stopReason = stopReason;
  }

  if (entry.task) {
    try {
      if (stopReason === 'cancel') {
        entry.task.cancel();
      } else {
        entry.task.pause();
      }
    } catch {
      // 停止下载是 best-effort：不同平台/任务状态下 pause/cancel 可能已经不可用。
    }
  }

  activeTasks.delete(id);
  return entry;
}

function stateForStoppedTask(stopReason?: TaskStopReason): DownloadState | null {
  if (stopReason === 'manual-pause') return 'paused';
  if (stopReason === 'app-background' || stopReason === 'background-deadline') return 'recovering';
  return null;
}

async function updateStoppedFileTask(db: SQLiteDatabase, id: string, entry: ActiveTask, listener?: DownloadChangeListener) {
  const state = stateForStoppedTask(entry.stopReason);
  if (!state) return;
  await updateProgress(db, id, { state, lastError: '' }, listener);
}

function shouldFlushProgress(lastFlush: number, intervalMs: number, complete: boolean) {
  return complete || Date.now() - lastFlush >= intervalMs;
}

function resolveHlsStoppedState(controller?: HlsController, deadlineReached = false): DownloadState | null {
  if (deadlineReached) return 'recovering';
  return stateForStoppedTask(controller?.stopReason);
}

function resolveProgressState(controller?: HlsController): DownloadState {
  return stateForStoppedTask(controller?.stopReason) ?? 'active';
}

function markEntryStopped(entry: ActiveTask, stopReason: TaskStopReason) {
  entry.stopReason = stopReason;
  if (entry.hlsController) {
    entry.hlsController.paused = true;
    entry.hlsController.stopReason = stopReason;
  }
}

function removeActiveTaskIfCurrent(id: string, entry: ActiveTask) {
  if (activeTasks.get(id) === entry) {
    activeTasks.delete(id);
  }
}

function resolvePlaylistUrl(value: string, baseUrl: string) {
  try {
    return new URL(value.trim(), baseUrl).toString();
  } catch {
    return value.trim();
  }
}

function parseManifest(value?: string) {
  if (!value) return null;
  try {
    const manifest = JSON.parse(value) as HlsManifest;
    if (manifest?.version === 1 && Array.isArray(manifest.resources)) return manifest;
  } catch {
    // ignore malformed manifest
  }
  return null;
}

async function buildHlsManifest(playlistUrl: string, hlsDir: any, outputFile: any, headers?: Record<string, string>): Promise<HlsManifest> {
  let fileIndex = 0;
  const usedNames = new Set<string>(['index.m3u8']);
  const localNameByUrl = new Map<string, string>();
  const resources: HlsManifestResource[] = [];
  const playlists: Array<{ fileName: string; content: string }> = [];

  const nextFileName = (url: string, fallbackExt = '.ts') => {
    const existing = localNameByUrl.get(url);
    if (existing) return existing;

    const ext = extensionFromUrl(url, fallbackExt);
    let fileName = '';
    do {
      fileIndex += 1;
      fileName = `part_${String(fileIndex).padStart(5, '0')}${ext}`;
    } while (usedNames.has(fileName));
    usedNames.add(fileName);
    localNameByUrl.set(url, fileName);
    return fileName;
  };

  const enqueueResource = (resourceUrl: string, fallbackExt = '.ts') => {
    const fileName = nextFileName(resourceUrl, fallbackExt);
    if (!resources.some((resource) => resource.url === resourceUrl)) {
      resources.push({ url: resourceUrl, fileName });
    }
    return fileName;
  };

  const processPlaylist = async (url: string, outputName: string): Promise<string> => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`m3u8 下载失败：HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const rewritten: string[] = [];

    for (const line of lines) {
      let nextLine = line;
      const attrMatches = Array.from(line.matchAll(HLS_URI_ATTR_RE));
      for (const match of attrMatches) {
        const rawUri = match[1];
        if (!rawUri || rawUri.startsWith('data:')) continue;
        const absolute = resolvePlaylistUrl(rawUri, url);
        const localName = absolute.toLowerCase().includes('.m3u8')
          ? await processPlaylist(absolute, nextFileName(absolute, '.m3u8'))
          : enqueueResource(absolute, extensionFromUrl(absolute, '.key'));
        nextLine = nextLine.replace(`URI="${rawUri}"`, `URI="${localName}"`);
      }

      if (HLS_SEGMENT_RE.test(line.trim())) {
        const absolute = resolvePlaylistUrl(line.trim(), url);
        nextLine = absolute.toLowerCase().includes('.m3u8')
          ? await processPlaylist(absolute, nextFileName(absolute, '.m3u8'))
          : enqueueResource(absolute);
      }

      rewritten.push(nextLine);
    }

    playlists.push({ fileName: outputName, content: rewritten.join('\n') });
    return outputName;
  };

  await processPlaylist(playlistUrl, 'index.m3u8');
  return {
    version: 1,
    playlistUrl,
    outputFile: outputFile.uri,
    hlsDirPath: hlsDir.uri,
    playlists,
    resources,
  };
}

async function prepareHlsManifest(db: SQLiteDatabase, record: DownloadRecord, hlsDir: any, outputFile: any, headers?: Record<string, string>, listener?: DownloadChangeListener) {
  const existing = parseManifest(record.hlsManifestJson);
  if (existing) return existing;

  await updateProgress(db, record.id, { state: 'recovering', lastError: '' }, listener);
  await ensureDirectoryExists(hlsDir);
  const manifest = await buildHlsManifest(record.url, hlsDir, outputFile, headers);
  for (const playlist of manifest.playlists) {
    await writeTextFile(new File(hlsDir, playlist.fileName), playlist.content);
  }
  const manifestJson = JSON.stringify(manifest);
  await saveHlsManifest(db, record.id, manifestJson);
  await updateProgress(db, record.id, {
    hlsManifestJson: manifestJson,
    bytesWritten: 0,
    totalBytes: manifest.resources.length,
    state: 'recovering',
  }, listener);
  return manifest;
}

async function countExistingResources(hlsDir: any, resources: HlsManifestResource[]) {
  let downloaded = 0;
  const pending: HlsManifestResource[] = [];
  for (const resource of resources) {
    const resourceFile = new File(hlsDir, resource.fileName);
    if (resourceFile.exists) {
      downloaded += 1;
    } else {
      pending.push(resource);
    }
  }
  return { downloaded, pending };
}

export async function runHlsDownloadSlice({
  db,
  record,
  foreground,
  concurrency,
  maxSegments = Infinity,
  deadlineMs = Infinity,
  listener,
  controller,
}: {
  db: SQLiteDatabase;
  record: DownloadRecord;
  foreground: boolean;
  concurrency: number;
  maxSegments?: number;
  deadlineMs?: number;
  listener?: DownloadChangeListener;
  controller?: HlsController;
}) {
  if (!isDownloadSupported()) throw new Error('当前平台不支持下载');
  const headers = parseHeaders(record.headersJson);
  const outputFile = fileFromUri(record.destPath);
  const hlsDir = directoryFromUri(record.hlsDirPath) ?? outputFile?.parentDirectory;
  if (!outputFile || !hlsDir) throw new Error('下载目录不可用');

  const manifest = await prepareHlsManifest(db, record, hlsDir, outputFile, headers, listener);
  const startedAt = Date.now();
  const progressFlushMs = foreground ? FOREGROUND_PROGRESS_FLUSH_MS : BACKGROUND_PROGRESS_FLUSH_MS;
  const existing = await countExistingResources(hlsDir, manifest.resources);
  let downloaded = existing.downloaded;
  let pending = existing.pending;
  let nextIndex = 0;
  let deadlineReached = false;
  let lastProgressFlush = 0;
  const resourceController = new AbortController();

  const flushProgress = async (force = false, forcedState?: DownloadState) => {
    const complete = downloaded >= manifest.resources.length;
    if (!force && !shouldFlushProgress(lastProgressFlush, progressFlushMs, complete)) return;
    lastProgressFlush = Date.now();
    await updateProgress(db, record.id, {
      bytesWritten: downloaded,
      totalBytes: manifest.resources.length,
      state: forcedState ?? (complete ? 'completed' : resolveProgressState(controller)),
      lastError: '',
    }, listener);
  };

  await flushProgress(true, pending.length > 0 ? 'active' : 'completed');

  if (pending.length === 0) return;
  if (!foreground) pending = pending.slice(0, maxSegments);

  const worker = async (workerControl: { fail: (error: unknown) => void; failed: () => boolean }) => {
    while (!workerControl.failed() && !controller?.paused) {
      if (Date.now() - startedAt >= deadlineMs) {
        deadlineReached = true;
        return;
      }

      const latest = await getDownloadById(db, record.id);
      if (!latest || latest.requestedState !== 'running') return;
      const resource = pending[nextIndex];
      nextIndex += 1;
      if (!resource) return;

      const resourceFile = new File(hlsDir, resource.fileName);
      if (!resourceFile.exists) {
        try {
          await File.downloadFileAsync(resource.url, resourceFile, {
            headers,
            idempotent: true,
            signal: resourceController.signal,
          });
        } catch (error) {
          workerControl.fail(error);
          resourceController.abort();
          return;
        }
      }
      downloaded += 1;

      // m3u8 通常会拆成大量小分片。逐片写 SQLite + 刷新 React state 会在
      // release 包恢复前台时堆积 JS 任务，所以这里按时间批量刷新；结束、暂停、
      // 后台时间片耗尽等关键状态会强制 flush，保证最终进度准确。
      await flushProgress();
    }
  };

  await runConcurrentWorkers(Math.min(concurrency, pending.length), worker);

  const stoppedState = resolveHlsStoppedState(controller, deadlineReached);
  if (stoppedState) {
    await flushProgress(true, stoppedState);
    return;
  }

  const finalCount = await countExistingResources(hlsDir, manifest.resources);
  await updateProgress(db, record.id, {
    bytesWritten: finalCount.downloaded,
    totalBytes: manifest.resources.length,
    state: finalCount.pending.length === 0 ? 'completed' : 'recovering',
    destPath: outputFile.uri,
  }, listener);
}

async function finishFileTask(db: SQLiteDatabase, id: string, entry: ActiveTask, promise: Promise<any>, listener?: DownloadChangeListener) {
  try {
    const file = await promise;
    if (entry.stopReason) {
      await updateStoppedFileTask(db, id, entry, listener);
      return;
    }
    if (file) {
      await updateProgress(db, id, { state: 'completed', lastError: '' }, listener);
    }
  } catch (err) {
    if (entry.stopReason) {
      // pause/cancel/AppState/deadline 都是受控中断：不能写成 error，
      // 否则 release 包回前台时会被旧 promise 的 reject 污染状态并触发重试风暴。
      await updateStoppedFileTask(db, id, entry, listener);
      return;
    }

    console.error('[Download] Task failed:', err);
    const latest = await getDownloadById(db, id);
    await updateProgress(db, id, { state: 'error', lastError: String(err), retryCount: (latest?.retryCount ?? 0) + 1 }, listener);
  } finally {
    removeActiveTaskIfCurrent(id, entry);
  }
}

export async function startDownloadRecord(db: SQLiteDatabase, vodName: string, episodeName: string, url: string, options?: StartDownloadOptions) {
  if (!isDownloadSupported()) throw new Error('Web 端暂不支持离线下载，请在 iOS 或 Android 使用。');
  if (looksLikePlayerPage(url) && !isHlsUrl(url)) {
    throw new Error('当前播放地址是网页播放页，暂不能直接保存为本地视频，请在线播放。');
  }

  const downloadDir = getDownloadDir();
  await ensureDirectoryExists(downloadDir);
  const id = generateId();
  const safeName = `${vodName}_${episodeName}`.replace(/[^a-zA-Z0-9一-鿿]/g, '_');
  const hls = isHlsUrl(url);
  const hlsDir = hls ? new Directory(downloadDir, `${safeName}_${id}`) : null;
  if (hlsDir) await ensureDirectoryExists(hlsDir);
  if (!hls) {
    await validateFileDownloadUrl(url, buildDownloadHeaders(options));
  }
  const dest = hlsDir
    ? new File(hlsDir, 'index.m3u8')
    : new File(downloadDir, buildFileDownloadName(vodName, episodeName, id, url));
  const headers = buildDownloadHeaders(options);
  const downloadType: DownloadType = hls ? 'hls' : 'file';

  await insertDownload(db, {
    id,
    vodName,
    episodeName,
    url,
    destPath: dest.uri,
    downloadType,
    siteUrl: options?.siteUrl ?? '',
    detailUrl: options?.detailUrl ?? '',
    sourceName: options?.sourceName ?? '',
    headersJson: headers ? JSON.stringify(headers) : '',
    hlsDirPath: hlsDir?.uri ?? '',
    state: hls ? 'recovering' : 'active',
    requestedState: 'running',
  });

  const record = await getDownloadById(db, id);
  if (!record) throw new Error('下载任务创建失败');
  return record;
}

export async function startOrResumeForegroundDownload(db: SQLiteDatabase, record: DownloadRecord, listener?: DownloadChangeListener) {
  if (!isDownloadSupported()) throw new Error('当前平台不支持下载');
  stopActiveTask(record.id, 'replace');
  await setRequestedState(db, record.id, 'running', record.downloadType === 'hls' ? 'recovering' : 'active', listener);
  const latest = await getDownloadById(db, record.id);
  if (!latest) return;

  if (latest.downloadType === 'hls' || isHlsUrl(latest.url) || latest.destPath.toLowerCase().endsWith('.m3u8')) {
    const hlsController: HlsController = { paused: false };
    const hlsConcurrency = normalizeHlsConcurrency(await getAppSetting(db, HLS_CONCURRENT_DOWNLOADS_SETTING_KEY));
    const entry: ActiveTask = { hlsController, dest: fileFromUri(latest.destPath), mode: 'foreground' };
    activeTasks.set(latest.id, entry);
    runHlsDownloadSlice({
      db,
      record: latest,
      foreground: true,
      concurrency: hlsConcurrency,
      listener,
      controller: hlsController,
    }).then(() => {
      removeActiveTaskIfCurrent(latest.id, entry);
    }).catch(async (err) => {
      if (entry.stopReason) {
        removeActiveTaskIfCurrent(latest.id, entry);
        return;
      }
      console.error('[Download] HLS task failed:', err);
      removeActiveTaskIfCurrent(latest.id, entry);
      const next = await getDownloadById(db, latest.id);
      await updateProgress(db, latest.id, { state: 'error', lastError: String(err), retryCount: (next?.retryCount ?? 0) + 1 }, listener);
    });
    return;
  }

  const dest = fileFromUri(latest.destPath);
  if (!dest) {
    await updateProgress(db, latest.id, { state: 'error', lastError: '下载文件路径不可用' }, listener);
    return;
  }

  let lastProgressFlush = 0;
  const task = File.createDownloadTask(latest.url, dest, {
    headers: parseHeaders(latest.headersJson),
    onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => {
      if (!shouldFlushProgress(lastProgressFlush, FOREGROUND_PROGRESS_FLUSH_MS, bytesWritten >= totalBytes)) return;
      lastProgressFlush = Date.now();
      void updateProgress(db, latest.id, { bytesWritten, totalBytes, state: 'active', lastError: '' }, listener);
    },
  });
  const entry: ActiveTask = { task, dest, mode: 'foreground' };
  activeTasks.set(latest.id, entry);
  void finishFileTask(db, latest.id, entry, task.downloadAsync(), listener);
}

export async function pauseDownloadRecord(db: SQLiteDatabase, id: string, listener?: DownloadChangeListener) {
  stopActiveTask(id, 'manual-pause');
  await setRequestedState(db, id, 'paused', 'paused', listener);
}

export async function resumeDownloadRecord(db: SQLiteDatabase, id: string, listener?: DownloadChangeListener) {
  const record = await getDownloadById(db, id);
  if (!record) return;
  await startOrResumeForegroundDownload(db, record, listener);
}

export async function suspendForegroundDownloadsForAppState(db: SQLiteDatabase, listener?: DownloadChangeListener) {
  const foregroundEntries = Array.from(activeTasks.entries()).filter(([, entry]) => entry.mode === 'foreground');

  for (const [id] of foregroundEntries) {
    // 这里不是用户点击“暂停”，只是 App 进入后台时让前台 JS 下载循环让路。
    // requestedState 必须保持 running：这样系统给后台任务时间片时，
    // download-background-worker 仍能通过 getRunnableDownloads() 接管继续下载。
    stopActiveTask(id, 'app-background');
    await updateProgress(db, id, { state: 'recovering', lastError: '' }, listener);
  }
}

export async function deleteDownloadedFiles(record: DownloadRecord) {
  const dest = fileFromUri(record.destPath);
  if (!dest) return;
  if (record.downloadType === 'hls' || isHlsUrl(record.url) || record.destPath.toLowerCase().endsWith('.m3u8')) {
    await deleteIfExists(record.hlsDirPath ? directoryFromUri(record.hlsDirPath) : dest.parentDirectory);
    return;
  }
  await deleteIfExists(dest);
}

export async function cancelDownloadRecord(db: SQLiteDatabase, record: DownloadRecord, listener?: DownloadChangeListener) {
  stopActiveTask(record.id, 'cancel');
  await updateDownloadRequestedState(db, record.id, 'cancelled', 'paused');
  await deleteDownloadedFiles(record);
  await dbDeleteDownload(db, record.id);
  listener?.(null);
}

export async function runDownloadInBackground(db: SQLiteDatabase, record: DownloadRecord, deadlineMs: number, maxHlsSegments: number) {
  if (!isDownloadSupported()) return;
  if (record.downloadType === 'hls' || isHlsUrl(record.url) || record.destPath.toLowerCase().endsWith('.m3u8')) {
    await runHlsDownloadSlice({
      db,
      record,
      foreground: false,
      concurrency: 1,
      maxSegments: maxHlsSegments,
      deadlineMs,
    });
    return;
  }

  const dest = fileFromUri(record.destPath);
  if (!dest) throw new Error('下载文件路径不可用');
  await updateDownloadProgress(db, record.id, { state: 'active', lastError: '' });

  let lastProgressFlush = 0;
  const task = File.createDownloadTask(record.url, dest, {
    headers: parseHeaders(record.headersJson),
    onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => {
      if (!shouldFlushProgress(lastProgressFlush, BACKGROUND_PROGRESS_FLUSH_MS, bytesWritten >= totalBytes)) return;
      lastProgressFlush = Date.now();
      void updateDownloadProgress(db, record.id, { bytesWritten, totalBytes, state: 'active', lastError: '' });
    },
  });
  const entry: ActiveTask = { task, dest, mode: 'background' };
  const taskPromise = task.downloadAsync();

  // Expo background task 给 JS 的执行窗口很短。普通文件不像 HLS 可以天然按分片切片，
  // 所以这里主动在 deadline 到期时暂停任务并正常返回；这只是时间片用完，不是下载失败。
  const deadlinePromise = new Promise<null>((resolve) => {
    const timer = setTimeout(() => {
      markEntryStopped(entry, 'background-deadline');
      try { task.pause(); } catch { /* ignore */ }
      resolve(null);
    }, Math.max(0, deadlineMs));

    taskPromise.finally(() => clearTimeout(timer)).catch(() => {
      // 真正的错误由 finishFileTask 统一处理，这里只负责清理 deadline timer。
    });
  });

  await finishFileTask(db, record.id, entry, Promise.race([taskPromise, deadlinePromise]));
}
