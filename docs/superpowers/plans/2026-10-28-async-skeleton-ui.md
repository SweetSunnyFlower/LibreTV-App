# Async Skeleton UI Implementation Plan

> **For agentic workers:** Execute inline in this session. Keep each task independently verifiable and preserve existing page behavior outside loading states.

**Goal:** Add consistent square-corner shimmer skeletons to every asynchronous data surface without blocking static content.

**Architecture:** Providers expose initial hydration flags. A shared skeleton primitive owns shimmer animation, while page skeleton compositions cover common data layouts. Existing remote-data skeletons migrate to the shared primitive.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript, `expo-linear-gradient`, React Native `Animated` and `AccessibilityInfo`.

## Global Constraints

- Skeleton placeholders must use `borderRadius: 0`.
- Skeleton animation must honor reduced-motion preferences.
- Only first hydration or active request states may show skeletons.
- Static headers, navigation controls, and form labels must render immediately.

---

### Task 1: Skeleton Foundation

**Files:**
- Create: `src/hooks/use-reduced-motion.ts`
- Create: `src/components/skeletons/skeleton.tsx`
- Create: `src/components/skeletons/page-skeletons.tsx`
- Create: `scripts/check-skeleton-coverage.mjs`

- [ ] Write the coverage check, then run it and confirm the missing skeleton files and provider flags fail.
- [ ] Implement a shared shimmer timeline, square `SkeletonBlock`, reduced-motion handling, and common list/settings/form skeleton compositions.
- [ ] Run the coverage check again; remaining page/provider gaps must be reported.

### Task 2: Async State Contracts

**Files:**
- Modify: `src/context/site-context.tsx`
- Modify: `src/context/user-data-context.tsx`
- Modify: `src/context/download-context.tsx`

- [ ] Add `isHydrating` to each context contract and default value.
- [ ] Set it to `false` only after the first successful or failed read.
- [ ] Ensure later refresh and polling operations do not set it back to `true`.
- [ ] Run the coverage check and TypeScript.

### Task 3: Async Page Integration

**Files:**
- Modify: `src/app/(tabs)/downloads.tsx`
- Modify: `src/app/(tabs)/my.tsx`
- Modify: `src/app/(tabs)/search-entry.tsx`
- Modify: `src/app/mine/downloads.tsx`
- Modify: `src/app/mine/favorites.tsx`
- Modify: `src/app/mine/search-history.tsx`
- Modify: `src/app/mine/watch-history.tsx`
- Modify: `src/app/mine/watch-history-folder.tsx`
- Modify: `src/app/mine/download-folder.tsx`
- Modify: `src/app/mine/settings.tsx`
- Modify: `src/app/sites/index.tsx`
- Modify: `src/app/sites/edit.tsx`

- [ ] Keep page headers and static controls mounted.
- [ ] Render skeleton compositions only while their relevant data source is hydrating.
- [ ] Restore existing empty and populated states after hydration completes.
- [ ] Track local settings hydration without affecting theme controls.
- [ ] Run the coverage check and TypeScript.

### Task 4: Existing Skeleton Migration

**Files:**
- Modify: `src/components/movie/poster-grid-skeleton.tsx`
- Modify: `src/components/app-image.tsx`
- Modify: `src/app/detail.tsx`
- Modify: `src/app/player.tsx`

- [ ] Replace static skeleton blocks with the shared square shimmer primitive.
- [ ] Use one shimmer group per skeleton layout where practical.
- [ ] Remove rounded image-placeholder geometry.
- [ ] Run the coverage check and TypeScript.

### Task 5: Verification

- [ ] Run `node scripts/check-skeleton-coverage.mjs`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Bundle/install the Android app and inspect cold-start async pages.
- [ ] Confirm static content remains visible while content skeletons animate.
- [ ] Review the final diff for accidental non-skeleton behavior changes.
