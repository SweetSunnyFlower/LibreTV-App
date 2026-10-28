# Playback and Runtime Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复播放竞态、错误不可恢复、请求覆盖、下载冲突、更新阻塞和历史进度失真的问题，同时明确在线播放仅支持 m3u8。

**Architecture:** 用可取消的 `PlaybackCoordinator` 统一播放代次、旧播放器暂停、进度恢复和历史写入；把竞态判断、进度规则、文件命名等决策提取为纯函数。页面和 Context 只适配现有 UI、SQLite 与 Expo API。

**Tech Stack:** Expo SDK 56、React Native 0.85、TypeScript、expo-video、expo-file-system、expo-sqlite、Vitest。

## Global Constraints

- 在线播放仅支持 m3u8/HLS，不恢复 MP4 在线播放。
- 引用 Expo API 时以 `https://docs.expo.dev/versions/v56.0.0/` 为准。
- 所有业务代码修改必须先有失败测试。
- 不改变现有页面视觉风格。
- 每个异步请求必须可取消或至少使用 request ID 丢弃过期结果。
- 取消操作不得显示错误弹窗。
- 所有用户可见错误使用中文。
- 最终必须通过 `npm test`、`npx tsc --noEmit`、`npm run test:skeleton` 和 Android release 构建。

---

### Task 1: 建立测试基础设施和播放纯函数

**Files:**
- Modify: `package.json`
- Create: `src/utils/playback.ts`
- Create: `src/utils/playback.test.ts`

**Interfaces:**
- Produces: `shouldRestorePlaybackProgress(positionSeconds: number, durationSeconds: number): boolean`
- Produces: `normalizePlaybackProgress(positionSeconds: number, durationSeconds: number): { positionSeconds: number; durationSeconds: number }`
- Produces: `buildBufferOptions(platform: 'android' | 'ios' | 'web'): BufferOptions`
- Produces: `bufferPercentFor(bufferedPosition: number, duration: number): number | null`

- [ ] **Step 1: Add Vitest and test script**

Run:

```bash
npm install --save-dev vitest
npm pkg set scripts.test="vitest run"
```

Expected: `package.json` contains `"test": "vitest run"` and `"vitest"` in `devDependencies`.

- [ ] **Step 2: Write failing playback utility tests**

Create `src/utils/playback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  bufferPercentFor,
  buildBufferOptions,
  normalizePlaybackProgress,
  shouldRestorePlaybackProgress,
} from './playback';

describe('playback utilities', () => {
  it('does not restore progress near the end', () => {
    expect(shouldRestorePlaybackProgress(5995, 6000)).toBe(false);
    expect(shouldRestorePlaybackProgress(5989, 6000)).toBe(true);
  });

  it('normalizes invalid progress into the media range', () => {
    expect(normalizePlaybackProgress(-2, 120)).toEqual({ positionSeconds: 0, durationSeconds: 120 });
    expect(normalizePlaybackProgress(200, 120)).toEqual({ positionSeconds: 120, durationSeconds: 120 });
  });

  it('uses moderate Android buffering and native iOS defaults', () => {
    expect(buildBufferOptions('android')).toMatchObject({
      minBufferForPlayback: 2,
      preferredForwardBufferDuration: 30,
      maxBufferBytes: 64 * 1024 * 1024,
    });
    expect(buildBufferOptions('ios')).toEqual({ preferredForwardBufferDuration: 0 });
  });

  it('returns a real buffer percentage when duration is known', () => {
    expect(bufferPercentFor(25, 100)).toBe(25);
    expect(bufferPercentFor(25, 0)).toBeNull();
  });
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- src/utils/playback.test.ts`

Expected: FAIL because `src/utils/playback.ts` does not exist.

- [ ] **Step 4: Implement playback utilities**

Create `src/utils/playback.ts`:

```ts
import type { BufferOptions } from 'expo-video';

const END_GUARD_SECONDS = 10;

export function shouldRestorePlaybackProgress(positionSeconds: number, durationSeconds: number) {
  return Number.isFinite(positionSeconds)
    && Number.isFinite(durationSeconds)
    && durationSeconds > 0
    && positionSeconds > 3
    && positionSeconds < durationSeconds - END_GUARD_SECONDS;
}

export function normalizePlaybackProgress(positionSeconds: number, durationSeconds: number) {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  const safePosition = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0;
  return {
    positionSeconds: safeDuration > 0 ? Math.min(safePosition, safeDuration) : safePosition,
    durationSeconds: safeDuration,
  };
}

export function buildBufferOptions(platform: 'android' | 'ios' | 'web'): BufferOptions {
  if (platform === 'android') {
    return {
      minBufferForPlayback: 2,
      preferredForwardBufferDuration: 30,
      maxBufferBytes: 64 * 1024 * 1024,
    };
  }
  if (platform === 'ios') {
    return { preferredForwardBufferDuration: 0 };
  }
  return {};
}

export function bufferPercentFor(bufferedPosition: number, duration: number) {
  if (!Number.isFinite(bufferedPosition) || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor((bufferedPosition / duration) * 100)));
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/utils/playback.test.ts`

Expected: all tests pass.

```bash
git add package.json package-lock.json src/utils/playback.ts src/utils/playback.test.ts
git commit -m "test: add playback progress utilities"
```

### Task 2: 添加可取消播放协调器

**Files:**
- Create: `src/services/playback-coordinator.ts`
- Create: `src/services/playback-coordinator.test.ts`

**Interfaces:**
- Consumes: `shouldRestorePlaybackProgress` and `normalizePlaybackProgress` from Task 1.
- Produces: `PlaybackCoordinator.start(input: PlaybackStartInput): Promise<PlaybackStartResult>`
- Produces: `PlaybackCoordinator.flush(positionSeconds: number, durationSeconds: number): Promise<void>`
- Produces: `PlaybackCoordinator.cancel(): void`
- Produces: `PlaybackCoordinator.dispose(): Promise<void>`

- [ ] **Step 1: Write failing coordinator race tests**

Create `src/services/playback-coordinator.test.ts` with a deferred resolver and fake adapter. Cover:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PlaybackCoordinator } from './playback-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

const source = (url: string) => ({
  originalUrl: url,
  normalizedUrl: url,
  playableUrl: url,
  kind: 'hls' as const,
  source: { uri: url },
  diagnostics: {},
});

it('pauses the old player and ignores a stale resolve result', async () => {
  const first = deferred<any>();
  const second = deferred<any>();
  const pending = [first.promise, second.promise];
  const resolver = vi.fn(() => pending.shift()!);
  const adapter = {
    pause: vi.fn(),
    replaceAndWaitReady: vi.fn(async () => ({ duration: 100 })),
    seek: vi.fn(),
    play: vi.fn(),
  };
  const coordinator = new PlaybackCoordinator({ resolve: resolver, adapter, loadProgress: async () => null, saveProgress: async () => {}, recordStarted: async () => {} });

  const firstRun = coordinator.start({ url: 'https://a/1.m3u8', autoPlay: true });
  const secondRun = coordinator.start({ url: 'https://b/2.m3u8', autoPlay: true });
  first.resolve(source('https://a/1.m3u8'));
  second.resolve(source('https://b/2.m3u8'));

  await Promise.all([firstRun, secondRun]);
  expect(adapter.pause).toHaveBeenCalledTimes(2);
  expect(adapter.replaceAndWaitReady).toHaveBeenCalledTimes(1);
  expect(adapter.replaceAndWaitReady).toHaveBeenCalledWith(expect.objectContaining({ uri: 'https://b/2.m3u8' }), expect.any(AbortSignal));
});

it('does not restore progress within ten seconds of the end', async () => {
  const adapter = {
    pause: vi.fn(),
    replaceAndWaitReady: vi.fn(async () => ({ duration: 100 })),
    seek: vi.fn(),
    play: vi.fn(),
  };
  const coordinator = new PlaybackCoordinator({
    resolve: async () => source('https://a/1.m3u8'),
    adapter,
    loadProgress: async () => ({ positionSeconds: 95, durationSeconds: 100 }),
    saveProgress: async () => {},
    recordStarted: async () => {},
  });

  await coordinator.start({ url: 'https://a/1.m3u8', autoPlay: true });
  expect(adapter.seek).not.toHaveBeenCalled();
  expect(adapter.play).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/services/playback-coordinator.test.ts`

Expected: FAIL because `PlaybackCoordinator` is not implemented.

- [ ] **Step 3: Implement coordinator**

Create `src/services/playback-coordinator.ts` with these exact public types:

```ts
export type PlaybackStartInput = { url: string; autoPlay: boolean };
export type PlaybackCoordinatorResult =
  | { status: 'started'; playableUrl: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown };

export class PlaybackCoordinator {
  constructor(private readonly dependencies: {
    resolve: (signal: AbortSignal) => Promise<PlaybackResolveResult>;
    adapter: {
      pause: () => void;
      replaceAndWaitReady: (source: VideoSource, signal: AbortSignal) => Promise<{ duration: number }>;
      seek: (positionSeconds: number) => void;
      play: () => void;
    };
    loadProgress: (url: string) => Promise<{ positionSeconds: number; durationSeconds: number } | null>;
    saveProgress: (url: string, positionSeconds: number, durationSeconds: number) => Promise<void>;
    recordStarted: (result: PlaybackResolveResult) => Promise<void>;
  }) {}
}
```

Implementation rules:

```ts
private generation = 0;
private controller: AbortController | null = null;
private activeUrl = '';

async start(input: PlaybackStartInput): Promise<PlaybackCoordinatorResult> {
  const generation = ++this.generation;
  this.controller?.abort();
  this.controller = new AbortController();
  const controller = this.controller;
  this.activeUrl = input.url;
  this.dependencies.adapter.pause();
  try {
    const result = await this.dependencies.resolve(controller.signal);
    if (generation !== this.generation || controller.signal.aborted) return { status: 'cancelled' };
    if (!result.source || result.error) throw new Error(result.error || '无法解析播放地址');
    const ready = await this.dependencies.adapter.replaceAndWaitReady(result.source, controller.signal);
    if (generation !== this.generation || controller.signal.aborted) return { status: 'cancelled' };
    const progress = await this.dependencies.loadProgress(input.url);
    if (progress && shouldRestorePlaybackProgress(progress.positionSeconds, ready.duration)) {
      this.dependencies.adapter.seek(progress.positionSeconds);
    }
    await this.dependencies.recordStarted(result);
    if (generation !== this.generation || controller.signal.aborted) return { status: 'cancelled' };
    if (input.autoPlay) this.dependencies.adapter.play();
    return { status: 'started', playableUrl: result.playableUrl };
  } catch (error) {
    if (controller.signal.aborted || generation !== this.generation) return { status: 'cancelled' };
    return { status: 'error', error };
  }
}
```

`flush` normalizes values and calls `saveProgress(this.activeUrl, ...)` only when URL is non-empty. `cancel` increments generation and aborts. `dispose` calls `cancel`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/services/playback-coordinator.test.ts`

Expected: coordinator tests pass.

```bash
git add src/services/playback-coordinator.ts src/services/playback-coordinator.test.ts
git commit -m "fix: coordinate cancellable playback requests"
```

### Task 3: Integrate coordinator into the player and expose recovery controls

**Files:**
- Modify: `src/app/player.tsx`
- Modify: `src/app/detail.tsx`
- Modify: `src/models/vod.ts`
- Modify: `src/app/mine/watch-history-folder.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `PlaybackCoordinator` from Task 2.
- Produces route parameter `sourceIndex?: string` for episode identity.
- Uses `autoPlay=1` for manual previous/next and automatic next episodes.

- [ ] **Step 1: Write failing episode parser test**

Create `src/services/cms-api.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseEpisodes } from './cms-api';

describe('parseEpisodes', () => {
  it('keeps only m3u8 episodes and preserves source index', () => {
    const result = parseEpisodes(
      '第1集$https://cdn.example/1.m3u8#第2集$https://cdn.example/2.mp4',
      '主线',
      'https://site.example',
    );
    expect(result).toEqual([
      expect.objectContaining({ name: '第1集', kind: 'm3u8', source: '主线', sourceIndex: 0 }),
    ]);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/services/cms-api.test.ts`

Expected: FAIL currently because `cms-api.ts` imports `@/constants/api`, which Vitest cannot resolve, proving test infrastructure needs relative alias support before behavior is asserted.

- [ ] **Step 3: Configure Vitest aliases**

Create `vitest.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify RED for missing player behavior**

Run: `npm test -- src/services/cms-api.test.ts`

Expected: the m3u8 parser test passes because this is current behavior. This test is retained as a regression test for the only-m3u8 requirement.

- [ ] **Step 5: Integrate coordinator**

In `player.tsx`:

- Remove `detail` from the playback effect dependency.
- Keep `detailRef` synced with a separate effect.
- Instantiate `PlaybackCoordinator` with an adapter whose `replaceAndWaitReady` subscribes to `sourceLoad` before calling `player.replaceAsync`.
- Start playback from a single effect keyed by `settingsLoaded`, URL, site URL, detail URL, source name, source index and `autoPlay` route parameter.
- Call `flush()` before previous/next navigation, retry, Android hardware back and unmount.
- Use `bufferPercentFor(bufferedPosition, player.duration)`; render `缓冲中` without a percentage when duration is unknown.
- Use `buildBufferOptions(Platform.OS)`.
- Replace the commented back button with an accessible 44x44 button.
- Render a centered retry button whenever `resolveError` or `status === 'error'`.
- Reset both alert references when a new request begins and after success.
- Wrap settings loading in `catch` and call `setSettingsLoaded(true)` with defaults.

- [ ] **Step 6: Fix episode identity and automatic play semantics**

In `detail.tsx` and `mine/watch-history-folder.tsx`, pass `sourceIndex` to `/player`.

In `player.tsx`, read `sourceIndex`; match an episode by `sourceIndex`, `sourceName` and name before falling back to URL. Pass `autoPlay: '1'` when navigating previous/next or automatically advancing.

- [ ] **Step 7: Update README and type comments**

Change the detail/playback feature text to:

```markdown
- 在线播放仅支持 HLS / m3u8 资源。
```

Change resolver description to state that direct MP4 and webpage playback are intentionally not exposed as selectable episodes.

- [ ] **Step 8: Verify and commit**

Run:

```bash
npm test
npx tsc --noEmit
git diff --check
```

Expected: tests and type-check pass.

```bash
git add src/app/player.tsx src/app/detail.tsx src/models/vod.ts src/app/mine/watch-history-folder.tsx src/services/cms-api.test.ts vitest.config.ts README.md
git commit -m "fix: make m3u8 playback cancellable and recoverable"
```

### Task 4: Persist watch progress and stabilize history IDs

**Files:**
- Create: `src/utils/watch-history.ts`
- Create: `src/utils/watch-history.test.ts`
- Modify: `src/services/database.ts`
- Modify: `src/context/user-data-context.tsx`
- Modify: `src/app/player.tsx`

**Interfaces:**
- Produces: `stableWatchHistoryId(input): string`
- Produces: `updateWatchHistoryProgress(db, id, positionMillis, durationMillis): Promise<void>`
- Produces Context method `updateWatchHistoryProgress(id: string, positionMillis: number, durationMillis: number): Promise<void>`
- Changes `addWatchHistory` to return the stable history record ID.

- [ ] **Step 1: Write failing stable-ID tests**

```ts
import { describe, expect, it } from 'vitest';
import { stableWatchHistoryId } from './watch-history';

it('ignores temporary query tokens in episode URLs', () => {
  const base = { siteUrl: 'https://site', vodId: 7, sourceName: 'A', episodeName: '第1集' };
  expect(stableWatchHistoryId({ ...base, episodeUrl: 'https://cdn/1.m3u8?token=a' }))
    .toBe(stableWatchHistoryId({ ...base, episodeUrl: 'https://cdn/1.m3u8?token=b' }));
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/utils/watch-history.test.ts`

Expected: FAIL because `stableWatchHistoryId` does not exist.

- [ ] **Step 3: Implement stable ID**

```ts
export function canonicalEpisodeUrl(episodeUrl: string) {
  try {
    const url = new URL(episodeUrl);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return episodeUrl.split(/[?#]/)[0] ?? episodeUrl;
  }
}

export function stableWatchHistoryId(input: {
  siteUrl?: string;
  vodId?: number | null;
  sourceName?: string;
  episodeName?: string;
  episodeUrl: string;
}) {
  if (input.siteUrl && input.vodId) {
    return `${input.siteUrl}::${input.vodId}::${input.sourceName ?? ''}::${input.episodeName ?? ''}::${canonicalEpisodeUrl(input.episodeUrl)}`;
  }
  return `local::${canonicalEpisodeUrl(input.episodeUrl)}`;
}
```

- [ ] **Step 4: Add progress persistence test**

Extend the coordinator test with a fake `recordStarted` returning history ID and verify `flush` calls both app-setting and watch-history callbacks after the initial history record exists.

Run: `npm test -- src/services/playback-coordinator.test.ts`

Expected: FAIL because coordinator currently only saves to one callback.

- [ ] **Step 5: Implement history progress persistence**

In `database.ts`, use `stableWatchHistoryId`, return the ID from `upsertWatchHistory`, and add:

```ts
export async function updateWatchHistoryProgress(
  db: SQLiteDatabase,
  id: string,
  positionMillis: number,
  durationMillis: number,
) {
  await db.runAsync(
    'UPDATE watch_history SET positionMillis = ?, durationMillis = ?, updatedAt = strftime(\'%s\',\'now\') WHERE id = ?',
    [Math.max(0, Math.floor(positionMillis)), Math.max(0, Math.floor(durationMillis)), id],
  );
}
```

In `UserDataContext`, replace only the matching history item. In `player.tsx`, debounce history writes to once every two seconds and force one on session flush. Keep the existing app-setting progress write as a resume compatibility source.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/utils/watch-history.ts src/utils/watch-history.test.ts src/services/database.ts src/context/user-data-context.tsx src/app/player.tsx src/services/playback-coordinator.ts src/services/playback-coordinator.test.ts
git commit -m "fix: persist stable watch history progress"
```

### Task 5: Harden resolver and media networking

**Files:**
- Create: `src/services/http.ts`
- Create: `src/services/http.test.ts`
- Modify: `src/services/playback-resolver.ts`
- Modify: `src/services/playback-resolver.test.ts` (create if absent)
- Modify: `src/services/cms-api.ts`
- Modify: `src/services/douban-api.ts`

**Interfaces:**
- Produces: `fetchWithTimeout(url, init?, timeoutMs?)` with external `AbortSignal` composition.
- Produces: `fetchJsonWithTimeout<T>` and `fetchTextWithTimeout`.
- `resolvePlaybackUrl` accepts `signal?: AbortSignal`.

- [ ] **Step 1: Write failing timeout and abort tests**

Test that an external abort rejects promptly, HTTP 404 throws, and a response with `content-type: video/*` is not converted with `text()`.

Run: `npm test -- src/services/http.test.ts src/services/playback-resolver.test.ts`

Expected: FAIL before implementations exist.

- [ ] **Step 2: Implement HTTP helpers**

Use one `AbortController` per request, listen to the external signal, keep the timer active through body consumption, and normalize timeout/abort errors into readable Chinese errors.

- [ ] **Step 3: Harden resolver**

- Pass the signal through all requests.
- Reject non-2xx responses.
- Inspect `content-type` and `content-length` before reading.
- If response is `application/vnd.apple.mpegurl`, `application/x-mpegurl`, or starts with `text/`/`application/json`, read text with a 1MB cap where streaming is available.
- If response is video/audio or content length exceeds 1MB without a text content type, cancel the body and return the candidate as a direct playable source instead of reading it into memory.
- Add support for protocol-relative and relative m3u8 URLs found in quoted strings.

- [ ] **Step 4: Propagate CMS errors**

Remove empty-array fallbacks for failed requests. Throw readable errors for HTTP and JSON failures. Update tags to keep its intentional local fallback, but recommendations must throw on network failure.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/services/http.ts src/services/http.test.ts src/services/playback-resolver.ts src/services/playback-resolver.test.ts src/services/cms-api.ts src/services/douban-api.ts
git commit -m "fix: harden cancellable media and cms requests"
```

### Task 6: Fix request races, pagination, aggregate errors, and detail recovery

**Files:**
- Create: `src/utils/latest-request.ts`
- Create: `src/utils/latest-request.test.ts`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/categories.tsx`
- Modify: `src/app/search.tsx`
- Modify: `src/app/aggregate-search.tsx`
- Modify: `src/app/detail.tsx`

**Interfaces:**
- Produces: `LatestRequest.next(): number`, `isCurrent(id): boolean`, `invalidate(): void`.

- [ ] **Step 1: Write failing latest-request and pagination tests**

Test that only the newest ID is current, invalidation makes all old IDs stale, and a failed page load does not advance the page.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/utils/latest-request.test.ts`

Expected: FAIL because utility does not exist.

- [ ] **Step 3: Implement request gate**

```ts
export class LatestRequest {
  private current = 0;
  next() { return ++this.current; }
  isCurrent(id: number) { return id === this.current; }
  invalidate() { this.current += 1; }
}
```

- [ ] **Step 4: Apply to pages**

- Home: capture request ID for tags and items; only latest writes state. Increment `pageStart` only after a successful non-empty append.
- Categories: capture IDs for category and item loads; ignore stale responses.
- Search: capture ID for each query; clear stale error state.
- Aggregate search: track `failedSites`; when `failedSites === totalSites`, set a clear network error.
- Detail: create an error state and retry nonce; missing parameters resolve loading immediately.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/utils/latest-request.ts src/utils/latest-request.test.ts "src/app/(tabs)/index.tsx" "src/app/(tabs)/categories.tsx" src/app/search.tsx src/app/aggregate-search.tsx src/app/detail.tsx
git commit -m "fix: prevent stale search and pagination results"
```

### Task 7: Fix download collisions and HLS failure handling

**Files:**
- Create: `src/utils/download-path.ts`
- Create: `src/utils/download-path.test.ts`
- Modify: `src/services/download-service.ts`
- Modify: `src/utils/media-groups.ts`
- Modify: `src/utils/media-groups.test.ts` (create)

**Interfaces:**
- Produces: `buildFileDownloadName(vodName, episodeName, id, url): string`
- Produces: `downloadFolderKey` including site/detail identity.

- [ ] **Step 1: Write failing download tests**

Assert two task IDs create different file names and same-named films from different sites create different folder keys.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/utils/download-path.test.ts src/utils/media-groups.test.ts`

Expected: FAIL for missing helper and old grouping behavior.

- [ ] **Step 3: Implement path helpers and use them**

Use `${safeName}_${id}.${extension}` for file downloads. Keep HLS directories unique.

- [ ] **Step 4: Add HEAD preflight**

Call `fetchWithTimeout` with `method: 'HEAD'`, propagate abort and timeout. Reject 4xx/5xx and HTML. Continue on 405/501.

- [ ] **Step 5: Fix HLS worker cancellation**

Create one `AbortController` for resources and a shared `failure`. Worker loop exits when `failure` is set. On error, set failure and abort. Run workers with `Promise.allSettled`; if failure exists, throw it once after all settle.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/utils/download-path.ts src/utils/download-path.test.ts src/utils/media-groups.ts src/utils/media-groups.test.ts src/services/download-service.ts
git commit -m "fix: prevent download collisions and hls worker leaks"
```

### Task 8: Fix update recovery and APK validation

**Files:**
- Modify: `src/models/app-version.ts`
- Modify: `src/services/app-version-service.ts`
- Modify: `src/services/apk-update-service.ts`
- Modify: `src/components/app-version-update-checker.tsx`
- Modify: `src/app/mine/settings.tsx`
- Create: `src/services/apk-update-service.test.ts`

**Interfaces:**
- `AppVersionUpdateInfo` adds optional `md5?: string` and `size?: number`.
- `downloadAndInstallApk` validates HTTPS, non-empty file, optional size and optional md5.

- [ ] **Step 1: Write failing validation tests**

Test rejection for HTTP URLs, zero-byte files, size mismatch, and MD5 mismatch using injected metadata checks. Test that iOS never attempts APK installation.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/services/apk-update-service.test.ts`

Expected: FAIL because validation helper does not exist.

- [ ] **Step 3: Implement validation helpers**

Add:

```ts
export function validateApkUrl(url: string) {
  if (!/^https:\/\//i.test(url)) throw new Error('更新包必须使用 HTTPS 地址');
}

export function validateApkMetadata(fileSize: number, expected?: { size?: number; md5?: string }, actualMd5?: string | null) {
  if (fileSize <= 0) throw new Error('更新包为空');
  if (expected?.size && fileSize !== expected.size) throw new Error('更新包大小校验失败');
  if (expected?.md5 && actualMd5?.toLowerCase() !== expected.md5.toLowerCase()) throw new Error('更新包校验失败');
}
```

- [ ] **Step 4: Fix dialogs and platform guards**

Set force update buttons to close normally. Guard automatic and manual APK installation with `Platform.OS === 'android'`. Remove direct `ToastAndroid` use from the iOS-reachable path.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add src/models/app-version.ts src/services/app-version-service.ts src/services/apk-update-service.ts src/services/apk-update-service.test.ts src/components/app-version-update-checker.tsx src/app/mine/settings.tsx
git commit -m "fix: validate updates and recover update dialogs"
```

### Task 9: Final verification and release build

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run all source verification**

```bash
npm test
npx tsc --noEmit
npm run test:skeleton
git diff --check
```

Expected: every command exits 0 with no test failures.

- [ ] **Step 2: Build Android release**

Run:

```bash
npm run assemble:android:release:prod
```

Expected: Gradle reports `BUILD SUCCESSFUL`.

- [ ] **Step 3: Inspect final diff**

```bash
git status --short
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Expected: only planned files changed; design and implementation commits are present.

- [ ] **Step 4: Commit any verification-only corrections**

Only if Step 1 or Step 2 exposed a defect, return to the relevant task, add a failing regression test, implement the fix, and rerun the full verification sequence.
