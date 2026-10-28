# Async Skeleton UI Design

**Goal:** Add page-level skeletons only while asynchronous state is hydrating or loading.

## Behavior

- Static page structure renders immediately.
- SQLite-backed collections and settings show skeletons during their first read only.
- Remote content pages continue to use skeletons while network requests are active.
- Mutations, polling, app foreground refreshes, and remote pagination do not replace existing content with skeletons.
- Failed initialization stops the skeleton and falls back to the existing empty or error state.

## Visual System

- Every skeleton block has square corners.
- One shared shimmer timeline moves left-to-right across all blocks in a skeleton group.
- Light and dark themes use theme-aware base colors with a low-contrast white highlight.
- Reduced-motion settings disable shimmer while retaining static placeholders.

## Coverage

- Provider hydration flags: site, user data, downloads.
- Async pages: My, favorites, search entry history, search/watch history, download lists and folders, settings, site management, and site editing.
- Existing skeleton users: home, categories, search, aggregate search, detail, player, and image loading.

## Verification

- A source-coverage script verifies required loading flags, page integration, shared skeleton primitives, and square-corner constraints.
- TypeScript must pass.
- Android cold-start surfaces must be checked in the emulator for light and dark themes where practical.
