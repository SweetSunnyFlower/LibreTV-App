# Live Player Favorite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live-channel favorite controls to the TV player for both M3U sources and the online channel library.

**Architecture:** A pure helper will define the favorite identity for both live-source kinds. The existing SQLite-backed user-data context remains the source of truth, while the player renders a stateful square star button beside the existing M3U channel-list button.

**Tech Stack:** Expo SDK 58, React Native 0.88, TypeScript, Vitest, SQLite, lucide-react-native.

---

### Task 1: Centralize Live Favorite Identity

**Files:**
- Create: `src/utils/live-favorite.ts`
- Create: `src/utils/live-favorite.test.ts`
- Modify: `src/services/database.ts:10-18`
- Modify: `src/context/user-data-context.tsx:137-151`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { liveFavoriteChannelKey } from './live-favorite';

describe('liveFavoriteChannelKey', () => {
  it('uses the channel id for online-library favorites', () => {
    expect(liveFavoriteChannelKey('library', 'CCTV1-CN', 'https://example.com/live.m3u8'))
      .toBe('CCTV1-CN');
  });

  it('uses the stream URL for M3U favorites', () => {
    expect(liveFavoriteChannelKey('m3u', null, 'https://example.com/live.m3u8'))
      .toBe('https://example.com/live.m3u8');
  });

  it('uses an empty key for an invalid online-library favorite', () => {
    expect(liveFavoriteChannelKey('library', null, 'https://example.com/live.m3u8'))
      .toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/utils/live-favorite.test.ts`

Expected: FAIL because `src/utils/live-favorite.ts` does not exist.

- [ ] **Step 3: Implement the helper and reuse it**

```ts
import type { LiveFavoriteInput } from '@/models/user-data';

export function liveFavoriteChannelKey(
  kind: LiveFavoriteInput['kind'],
  channelId: string | null,
  channelUrl: string
) {
  return kind === 'library' ? (channelId ?? '') : channelUrl;
}
```

In `src/services/database.ts`, replace the local `liveKindKey` function with the helper:

```ts
import { liveFavoriteChannelKey } from '@/utils/live-favorite';

export function liveFavoriteId(input: LiveFavoriteInput) {
  return `live-fav::${input.kind}::${liveFavoriteChannelKey(input.kind, input.channelId, input.channelUrl)}`;
}

function liveHistoryId(input: LiveWatchHistoryInput) {
  return `live-hist::${input.kind}::${liveFavoriteChannelKey(input.kind, input.channelId, input.channelUrl)}`;
}
```

In `src/context/user-data-context.tsx`, use the same key calculation in `isLiveFavorite`:

```ts
const isLiveFavorite = useCallback(
  (kind: 'm3u' | 'library', key: string) => liveFavorites.some((item) => (
    item.kind === kind
      && liveFavoriteChannelKey(kind, item.channelId, item.channelUrl) === key
  )),
  [liveFavorites]
);
```

`toggleLiveFavorite` will continue to pass the same canonical key:

```ts
if (isLiveFavorite(
  input.kind,
  liveFavoriteChannelKey(input.kind, input.channelId, input.channelUrl)
)) {
  await dbDeleteLiveFavorite(db, liveFavoriteId(input));
} else {
  await upsertLiveFavorite(db, input);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/utils/live-favorite.test.ts`

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/live-favorite.ts src/utils/live-favorite.test.ts src/services/database.ts src/context/user-data-context.tsx
git commit -m "refactor: centralize live favorite keys"
```

### Task 2: Add Favorite Control To Live Player

**Files:**
- Modify: `src/app/live-player.tsx:1-360`

- [ ] **Step 1: Connect the existing favorite context**

Replace the single `addLiveWatchHistory` destructure with:

```ts
const {
  addLiveWatchHistory,
  isLiveFavorite,
  toggleLiveFavorite,
} = useUserData();
```

Add a `channelLogo` state initialized from the route:

```ts
const [channelLogo, setChannelLogo] = useState(firstParam(params.logo) ?? '');
```

Track the current logo when M3U playback or channel switching prepares a URL:

```ts
setChannelLogo(firstParam(params.logo) ?? '');
```

```ts
setChannelLogo(channel.logo ?? '');
```

Reset it to an empty string for online-library playback:

```ts
setChannelLogo('');
```

- [ ] **Step 2: Add favorite input and toggle handler**

After `channelLogo` is available, derive the canonical key and current state:

```ts
const favoriteKind = kind === 'library' ? 'library' : 'm3u';
const favoriteChannelId = favoriteKind === 'library'
  ? (firstParam(params.channelId) ?? null)
  : null;
const favoriteKey = liveFavoriteChannelKey(favoriteKind, favoriteChannelId, currentUrl);
const favorite = isLiveFavorite(favoriteKind, favoriteKey);
```

Add the asynchronous handler before `showControls`:

```ts
const handleToggleFavorite = useCallback(async () => {
  if (!favoriteKey) return;
  const sourceId = Number(firstParam(params.sourceId));
  try {
    await toggleLiveFavorite({
      kind: favoriteKind,
      channelId: favoriteChannelId,
      channelName,
      channelUrl: currentUrl,
      sourceId: favoriteKind === 'm3u' && Number.isFinite(sourceId) && sourceId > 0
        ? sourceId
        : null,
      sourceName: favoriteKind === 'm3u'
        ? (firstParam(params.sourceName) ?? '')
        : '在线频道库',
      logo: favoriteKind === 'm3u' ? channelLogo : '',
    });
  } catch (error) {
    console.warn('[LivePlayer] Failed to toggle favorite:', error);
  }
}, [
  channelLogo,
  channelName,
  currentUrl,
  favoriteChannelId,
  favoriteKind,
  favoriteKey,
  params.sourceId,
  params.sourceName,
  toggleLiveFavorite,
]);
```

- [ ] **Step 3: Render square favorite and channel-list controls**

Import `Star` from `lucide-react-native`. Replace the standalone M3U channel-list button with one right-side action row shown whenever controls are visible:

```tsx
{controlsVisible ? (
  <View style={[styles.topRightControls, { top: insets.top + 8 }]}>
    <Pressable
      style={styles.controlButton}
      onPress={() => {
        showControls();
        void handleToggleFavorite();
      }}
      hitSlop={8}
      accessibilityLabel={favorite ? '取消收藏' : '收藏频道'}
      accessibilityState={{ selected: favorite }}>
      <Star
        size={24}
        color="#fff"
        strokeWidth={2}
        fill={favorite ? '#fff' : 'transparent'}
      />
    </Pressable>
    {kind === 'm3u' ? (
      <Pressable
        style={styles.controlButton}
        onPress={() => {
          showControls();
          setDrawerOpen(true);
        }}
        hitSlop={8}
        accessibilityLabel="频道列表">
        <List size={24} color="#fff" strokeWidth={2} />
      </Pressable>
    ) : null}
  </View>
) : null}
```

Add these styles and remove the old absolute `channelListButton`:

```ts
topRightControls: {
  position: 'absolute',
  right: 12,
  flexDirection: 'row',
  gap: 8,
},
controlButton: {
  width: 44,
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.42)',
},
```

- [ ] **Step 4: Verify static behavior**

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

Run: `npm test`

Expected: PASS with all existing and new tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/live-player.tsx
git commit -m "feat: add favorites to live player"
```

### Task 3: Build And Device Verification

**Files:**
- Build output: `android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 1: Build the production release**

```bash
export NVM_DIR="/Users/flower/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
export ANDROID_HOME="/Users/flower/Library/Android/sdk"
npm run assemble:android:release:prod
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Install on the connected phone**

```bash
adb devices
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Expected: `Success`.

- [ ] **Step 3: Verify the interactions**

1. Open `电视 → 我的直播源`, play a channel, and confirm the star and channel-list buttons are top-right.
2. Toggle the star and confirm it becomes filled without changing playback.
3. Open `我的 → 我的收藏` and confirm the live channel appears.
4. Repeat from `在线频道库` and confirm only the star button is shown.
5. Confirm both controls hide after 5 seconds and return after tapping the video.
