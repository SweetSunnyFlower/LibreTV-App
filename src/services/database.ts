import type { SQLiteDatabase } from 'expo-sqlite';
import { PREDEFINED_SITES } from '@/constants/sites';
import type { DownloadRecord, DownloadRequestedState, DownloadState, DownloadType } from '@/models/download';
import type { FavoriteInput, WatchHistoryInput } from '@/models/user-data';

function favoriteId(siteUrl: string, vodId: number) {
  return `${siteUrl}::${vodId}`;
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase();
}

function searchHistoryId(siteUrl: string, keyword: string) {
  return `${siteUrl}::${normalizeKeyword(keyword)}`;
}

function watchHistoryId(input: { siteUrl?: string; vodId?: number | null; episodeUrl: string; episodeName?: string }) {
  if (input.siteUrl && input.vodId) {
    return `${input.siteUrl}::${input.vodId}::${input.episodeName ?? ''}::${input.episodeUrl}`;
  }
  return `local::${input.episodeUrl}`;
}

type DownloadRow = Omit<DownloadRecord, 'state' | 'downloadType' | 'requestedState'> & {
  state: string;
  downloadType: string;
  requestedState: string;
};

type InsertDownloadInput = {
  id: string;
  vodName: string;
  episodeName: string;
  url: string;
  destPath: string;
  downloadType: DownloadType;
  siteUrl?: string;
  detailUrl?: string;
  sourceName?: string;
  headersJson?: string;
  hlsDirPath?: string;
  hlsManifestJson?: string;
  state?: DownloadState;
  requestedState?: DownloadRequestedState;
};

type DownloadProgressInput = {
  state?: DownloadState;
  bytesWritten?: number;
  totalBytes?: number;
  destPath?: string;
  hlsManifestJson?: string;
  lastError?: string;
  retryCount?: number;
};

function normalizeDownloadType(value?: string | null): DownloadType {
  return value === 'hls' ? 'hls' : 'file';
}

function normalizeRequestedState(value?: string | null): DownloadRequestedState {
  if (value === 'paused' || value === 'cancelled') return value;
  return 'running';
}

function normalizeDownloadState(value?: string | null): DownloadState {
  if (value === 'active' || value === 'recovering' || value === 'paused' || value === 'completed' || value === 'error') {
    return value;
  }
  return 'idle';
}

function normalizeDownloadRow(row: DownloadRow): DownloadRecord {
  return {
    ...row,
    state: normalizeDownloadState(row.state),
    downloadType: normalizeDownloadType(row.downloadType),
    requestedState: normalizeRequestedState(row.requestedState),
    siteUrl: row.siteUrl ?? '',
    detailUrl: row.detailUrl ?? '',
    sourceName: row.sourceName ?? '',
    headersJson: row.headersJson ?? '',
    hlsDirPath: row.hlsDirPath ?? '',
    hlsManifestJson: row.hlsManifestJson ?? '',
    leaseOwner: row.leaseOwner ?? '',
    leaseUntil: row.leaseUntil ?? 0,
    lastError: row.lastError ?? '',
    retryCount: row.retryCount ?? 0,
  };
}

async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string, existingColumns: Set<string>) {
  if (existingColumns.has(column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  existingColumns.add(column);
}

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      isDefault INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      vodName TEXT NOT NULL,
      episodeName TEXT NOT NULL,
      url TEXT NOT NULL,
      destPath TEXT NOT NULL,
      bytesWritten INTEGER NOT NULL DEFAULT 0,
      totalBytes INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'idle',
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS favorite_vods (
      id TEXT PRIMARY KEY,
      siteUrl TEXT NOT NULL,
      detailUrl TEXT NOT NULL DEFAULT '',
      vodId INTEGER NOT NULL,
      vodName TEXT NOT NULL,
      vodPic TEXT NOT NULL DEFAULT '',
      vodYear TEXT NOT NULL DEFAULT '',
      vodArea TEXT NOT NULL DEFAULT '',
      vodRemarks TEXT NOT NULL DEFAULT '',
      typeName TEXT NOT NULL DEFAULT '',
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(siteUrl, vodId)
    );
    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      normalizedKeyword TEXT NOT NULL,
      siteUrl TEXT NOT NULL,
      siteName TEXT NOT NULL DEFAULT '',
      resultCount INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(siteUrl, normalizedKeyword)
    );
    CREATE TABLE IF NOT EXISTS watch_history (
      id TEXT PRIMARY KEY,
      siteUrl TEXT NOT NULL DEFAULT '',
      detailUrl TEXT NOT NULL DEFAULT '',
      vodId INTEGER,
      vodName TEXT NOT NULL,
      vodPic TEXT NOT NULL DEFAULT '',
      episodeName TEXT NOT NULL DEFAULT '',
      sourceName TEXT NOT NULL DEFAULT '',
      episodeUrl TEXT NOT NULL,
      playableUrl TEXT NOT NULL DEFAULT '',
      positionMillis INTEGER NOT NULL DEFAULT 0,
      durationMillis INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_favorite_vods_updated ON favorite_vods(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_search_history_updated ON search_history(updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_watch_history_updated ON watch_history(updatedAt DESC);
  `);

  const downloadColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(downloads)');
  const existingDownloadColumns = new Set(downloadColumns.map((column) => column.name));
  await ensureColumn(db, 'downloads', 'downloadType', `TEXT NOT NULL DEFAULT 'file'`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'siteUrl', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'detailUrl', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'sourceName', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'headersJson', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'hlsDirPath', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'hlsManifestJson', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'requestedState', `TEXT NOT NULL DEFAULT 'running'`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'leaseOwner', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'leaseUntil', `INTEGER NOT NULL DEFAULT 0`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'lastError', `TEXT NOT NULL DEFAULT ''`, existingDownloadColumns);
  await ensureColumn(db, 'downloads', 'retryCount', `INTEGER NOT NULL DEFAULT 0`, existingDownloadColumns);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_downloads_runnable ON downloads(requestedState, state, leaseUntil, createdAt);
  `);

  // Seed predefined sites if table is empty
  const count = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM sites');
  if (count?.cnt === 0) {
    for (let i = 0; i < PREDEFINED_SITES.length; i++) {
      const site = PREDEFINED_SITES[i];
      await db.runAsync(
        'INSERT INTO sites (url, name, detail, isDefault, isActive) VALUES (?, ?, ?, ?, ?)',
        [site.url, site.name, site.detail, site.isDefault ? 1 : 0, i === 0 ? 1 : 0]
      );
    }
  }
}

// ===== App Settings CRUD =====

export async function getAppSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ? LIMIT 1', [key]);
  return row?.value ?? null;
}

export async function setAppSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updatedAt = strftime('%s','now')`,
    [key, value]
  );
}

// ===== Site CRUD =====

export async function getAllSites(db: SQLiteDatabase) {
  return db.getAllAsync<{
    id: number;
    url: string;
    name: string;
    detail: string;
    isDefault: number;
    isActive: number;
    createdAt: number;
  }>('SELECT * FROM sites ORDER BY isDefault DESC, createdAt ASC');
}

export async function getActiveSite(db: SQLiteDatabase) {
  return db.getFirstAsync<{
    id: number;
    url: string;
    name: string;
    detail: string;
    isDefault: number;
    isActive: number;
    createdAt: number;
  }>('SELECT * FROM sites WHERE isActive = 1 LIMIT 1');
}

export async function setActiveSite(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE sites SET isActive = 0 WHERE isActive = 1');
    await db.runAsync('UPDATE sites SET isActive = 1 WHERE id = ?', [id]);
  });
}

export async function addSite(
  db: SQLiteDatabase,
  url: string,
  name: string,
  detail: string
) {
  const result = await db.runAsync(
    'INSERT INTO sites (url, name, detail, isDefault, isActive) VALUES (?, ?, ?, 0, 0)',
    [url, name, detail]
  );
  return result.lastInsertRowId;
}

export async function updateSite(
  db: SQLiteDatabase,
  id: number,
  url: string,
  name: string,
  detail: string
) {
  await db.runAsync(
    'UPDATE sites SET url = ?, name = ?, detail = ? WHERE id = ?',
    [url, name, detail, id]
  );
}

export async function deleteSite(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    const deleting = await db.getFirstAsync<{ isActive: number }>('SELECT isActive FROM sites WHERE id = ? LIMIT 1', [id]);
    await db.runAsync('DELETE FROM sites WHERE id = ?', [id]);
    if (deleting?.isActive) {
      const next = await db.getFirstAsync<{ id: number }>('SELECT id FROM sites ORDER BY isDefault DESC, createdAt ASC LIMIT 1');
      if (next) {
        await db.runAsync('UPDATE sites SET isActive = 1 WHERE id = ?', [next.id]);
      }
    }
  });
}

// ===== Download CRUD =====

export async function getAllDownloads(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<DownloadRow>('SELECT * FROM downloads ORDER BY createdAt DESC');
  return rows.map(normalizeDownloadRow);
}

export async function getDownloadById(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<DownloadRow>('SELECT * FROM downloads WHERE id = ? LIMIT 1', [id]);
  return row ? normalizeDownloadRow(row) : null;
}

export async function insertDownload(db: SQLiteDatabase, input: InsertDownloadInput) {
  await db.runAsync(
    `INSERT INTO downloads (
      id, vodName, episodeName, url, destPath, state, downloadType, siteUrl, detailUrl, sourceName,
      headersJson, hlsDirPath, hlsManifestJson, requestedState, leaseOwner, leaseUntil, lastError, retryCount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, '', 0)`,
    [
      input.id,
      input.vodName,
      input.episodeName,
      input.url,
      input.destPath,
      input.state ?? 'active',
      input.downloadType,
      input.siteUrl ?? '',
      input.detailUrl ?? '',
      input.sourceName ?? '',
      input.headersJson ?? '',
      input.hlsDirPath ?? '',
      input.hlsManifestJson ?? '',
      input.requestedState ?? 'running',
    ]
  );
}

export async function updateDownloadState(
  db: SQLiteDatabase,
  id: string,
  state: string,
  bytesWritten: number,
  totalBytes: number
) {
  await updateDownloadProgress(db, id, { state: normalizeDownloadState(state), bytesWritten, totalBytes });
}

export async function updateDownloadProgress(db: SQLiteDatabase, id: string, input: DownloadProgressInput) {
  const assignments: string[] = ['updatedAt = strftime("%s","now")'];
  const values: Array<string | number> = [];

  if (input.state !== undefined) {
    assignments.push('state = ?');
    values.push(input.state);
  }
  if (input.bytesWritten !== undefined) {
    assignments.push('bytesWritten = ?');
    values.push(input.bytesWritten);
  }
  if (input.totalBytes !== undefined) {
    assignments.push('totalBytes = ?');
    values.push(input.totalBytes);
  }
  if (input.destPath !== undefined) {
    assignments.push('destPath = ?');
    values.push(input.destPath);
  }
  if (input.hlsManifestJson !== undefined) {
    assignments.push('hlsManifestJson = ?');
    values.push(input.hlsManifestJson);
  }
  if (input.lastError !== undefined) {
    assignments.push('lastError = ?');
    values.push(input.lastError);
  }
  if (input.retryCount !== undefined) {
    assignments.push('retryCount = ?');
    values.push(input.retryCount);
  }

  values.push(id);
  await db.runAsync(`UPDATE downloads SET ${assignments.join(', ')} WHERE id = ?`, values);
}

export async function updateDownloadRequestedState(db: SQLiteDatabase, id: string, requestedState: DownloadRequestedState, state?: DownloadState) {
  if (state) {
    await db.runAsync(
      'UPDATE downloads SET requestedState = ?, state = ?, updatedAt = strftime("%s","now") WHERE id = ?',
      [requestedState, state, id]
    );
    return;
  }
  await db.runAsync(
    'UPDATE downloads SET requestedState = ?, updatedAt = strftime("%s","now") WHERE id = ?',
    [requestedState, id]
  );
}

export async function getRunnableDownloads(db: SQLiteDatabase, limit = 1) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await db.getAllAsync<DownloadRow>(
    `SELECT * FROM downloads
     WHERE requestedState = 'running'
       AND state != 'completed'
       AND (leaseOwner = '' OR leaseUntil <= ?)
     ORDER BY downloadType = 'hls' DESC, updatedAt ASC
     LIMIT ?`,
    [now, limit]
  );
  return rows.map(normalizeDownloadRow);
}

export async function acquireDownloadLease(db: SQLiteDatabase, id: string, owner: string, leaseUntil: number) {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.runAsync(
    `UPDATE downloads SET leaseOwner = ?, leaseUntil = ?, updatedAt = strftime("%s","now")
     WHERE id = ? AND requestedState = 'running' AND state != 'completed' AND (leaseOwner = '' OR leaseUntil <= ?)`,
    [owner, leaseUntil, id, now]
  );
  return result.changes > 0;
}

export async function releaseDownloadLease(db: SQLiteDatabase, id: string, owner: string) {
  await db.runAsync(
    `UPDATE downloads SET leaseOwner = '', leaseUntil = 0, updatedAt = strftime("%s","now")
     WHERE id = ? AND leaseOwner = ?`,
    [id, owner]
  );
}

export async function saveHlsManifest(db: SQLiteDatabase, id: string, manifestJson: string) {
  await updateDownloadProgress(db, id, { hlsManifestJson: manifestJson });
}

export async function deleteDownload(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM downloads WHERE id = ?', [id]);
}

// ===== User Data CRUD =====

export async function getFavorites(db: SQLiteDatabase) {
  return db.getAllAsync<{
    id: string;
    siteUrl: string;
    detailUrl: string;
    vodId: number;
    vodName: string;
    vodPic: string;
    vodYear: string;
    vodArea: string;
    vodRemarks: string;
    typeName: string;
    createdAt: number;
    updatedAt: number;
  }>('SELECT * FROM favorite_vods ORDER BY updatedAt DESC');
}

export async function upsertFavorite(db: SQLiteDatabase, input: FavoriteInput) {
  await db.runAsync(
    `INSERT INTO favorite_vods (id, siteUrl, detailUrl, vodId, vodName, vodPic, vodYear, vodArea, vodRemarks, typeName)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(siteUrl, vodId) DO UPDATE SET
       detailUrl = excluded.detailUrl,
       vodName = excluded.vodName,
       vodPic = excluded.vodPic,
       vodYear = excluded.vodYear,
       vodArea = excluded.vodArea,
       vodRemarks = excluded.vodRemarks,
       typeName = excluded.typeName,
       updatedAt = strftime('%s','now')`,
    [
      favoriteId(input.siteUrl, input.vodId),
      input.siteUrl,
      input.detailUrl,
      input.vodId,
      input.vodName,
      input.vodPic,
      input.vodYear,
      input.vodArea,
      input.vodRemarks,
      input.typeName,
    ]
  );
}

export async function deleteFavorite(db: SQLiteDatabase, siteUrl: string, vodId: number) {
  await db.runAsync('DELETE FROM favorite_vods WHERE siteUrl = ? AND vodId = ?', [siteUrl, vodId]);
}

export async function isFavoriteVod(db: SQLiteDatabase, siteUrl: string, vodId: number) {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM favorite_vods WHERE siteUrl = ? AND vodId = ? LIMIT 1',
    [siteUrl, vodId]
  );
  return !!row;
}

export async function getSearchHistory(db: SQLiteDatabase) {
  return db.getAllAsync<{
    id: string;
    keyword: string;
    normalizedKeyword: string;
    siteUrl: string;
    siteName: string;
    resultCount: number;
    createdAt: number;
    updatedAt: number;
  }>('SELECT * FROM search_history ORDER BY updatedAt DESC LIMIT 100');
}

export async function upsertSearchHistory(
  db: SQLiteDatabase,
  keyword: string,
  siteUrl: string,
  siteName: string,
  resultCount: number
) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return;
  await db.runAsync(
    `INSERT INTO search_history (id, keyword, normalizedKeyword, siteUrl, siteName, resultCount)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(siteUrl, normalizedKeyword) DO UPDATE SET
       keyword = excluded.keyword,
       siteName = excluded.siteName,
       resultCount = excluded.resultCount,
       updatedAt = strftime('%s','now')`,
    [searchHistoryId(siteUrl, keyword), keyword.trim(), normalized, siteUrl, siteName, resultCount]
  );
}

export async function deleteSearchHistory(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM search_history WHERE id = ?', [id]);
}

export async function clearSearchHistory(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM search_history');
}

export async function getWatchHistory(db: SQLiteDatabase) {
  return db.getAllAsync<{
    id: string;
    siteUrl: string;
    detailUrl: string;
    vodId: number | null;
    vodName: string;
    vodPic: string;
    episodeName: string;
    sourceName: string;
    episodeUrl: string;
    playableUrl: string;
    positionMillis: number;
    durationMillis: number;
    createdAt: number;
    updatedAt: number;
  }>('SELECT * FROM watch_history ORDER BY updatedAt DESC LIMIT 100');
}

export async function upsertWatchHistory(db: SQLiteDatabase, input: WatchHistoryInput) {
  const id = watchHistoryId({ siteUrl: input.siteUrl, vodId: input.vodId, episodeUrl: input.episodeUrl, episodeName: input.episodeName });
  await db.runAsync(
    `INSERT INTO watch_history (id, siteUrl, detailUrl, vodId, vodName, vodPic, episodeName, sourceName, episodeUrl, playableUrl, positionMillis, durationMillis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       siteUrl = excluded.siteUrl,
       detailUrl = excluded.detailUrl,
       vodId = excluded.vodId,
       vodName = excluded.vodName,
       vodPic = excluded.vodPic,
       episodeName = excluded.episodeName,
       sourceName = excluded.sourceName,
       episodeUrl = excluded.episodeUrl,
       playableUrl = excluded.playableUrl,
       positionMillis = excluded.positionMillis,
       durationMillis = excluded.durationMillis,
       updatedAt = strftime('%s','now')`,
    [
      id,
      input.siteUrl,
      input.detailUrl,
      input.vodId ?? null,
      input.vodName,
      input.vodPic,
      input.episodeName,
      input.sourceName,
      input.episodeUrl,
      input.playableUrl,
      input.positionMillis ?? 0,
      input.durationMillis ?? 0,
    ]
  );
}

export async function deleteWatchHistory(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM watch_history WHERE id = ?', [id]);
}

export async function clearWatchHistory(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM watch_history');
}
