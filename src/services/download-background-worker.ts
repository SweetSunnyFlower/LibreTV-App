import { acquireDownloadLease, getRunnableDownloads, releaseDownloadLease, updateDownloadProgress, migrateDb } from '@/services/database';
import { runDownloadInBackground } from '@/services/download-service';
import * as SQLite from 'expo-sqlite';

const BACKGROUND_DEADLINE_MS = 25_000;
const BACKGROUND_MAX_RECORDS = 1;
const BACKGROUND_MAX_HLS_SEGMENTS = 20;
const LEASE_SECONDS = 180;

function backgroundOwner() {
  return `background:${Date.now()}`;
}

export async function runBackgroundDownloadWorker() {
  const db = await SQLite.openDatabaseAsync('movie.db');
  await migrateDb(db);

  const owner = backgroundOwner();
  const records = await getRunnableDownloads(db, BACKGROUND_MAX_RECORDS);
  const startedAt = Date.now();

  for (const record of records) {
    if (Date.now() - startedAt >= BACKGROUND_DEADLINE_MS) return;

    const leaseUntil = Math.floor(Date.now() / 1000) + LEASE_SECONDS;
    const acquired = await acquireDownloadLease(db, record.id, owner, leaseUntil);
    if (!acquired) continue;

    try {
      await runDownloadInBackground(
        db,
        { ...record, leaseOwner: owner, leaseUntil },
        Math.max(3000, BACKGROUND_DEADLINE_MS - (Date.now() - startedAt)),
        BACKGROUND_MAX_HLS_SEGMENTS
      );
    } catch (error) {
      // 后台任务的 deadline 到期是正常时间片结束，会在 download-service 中
      // 标记为 recovering 并正常返回；走到这里才说明是真正的下载/文件错误。
      await updateDownloadProgress(db, record.id, {
        state: 'error',
        lastError: String(error),
        retryCount: record.retryCount + 1,
      });
    } finally {
      await releaseDownloadLease(db, record.id, owner);
    }
  }
}
