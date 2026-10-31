import type { FilterPickerOption } from '@/components/iptv/filter-picker';
import { FilterDrawer, type IptvLibraryFilters } from '@/components/iptv/filter-drawer';
import { useIptv } from '@/context/iptv-context';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { IptvChannel, IptvLibraryChannel, IptvSource } from '@/models/iptv';
import type { LiveWatchHistoryRecord } from '@/models/user-data';
import { cacheIptvChannels, fetchIptvChannels, getCachedIptvChannels, probeStreamUrl } from '@/services/iptv';
import { getIptvSourceStats } from '@/services/database';
import { FlashList } from '@shopify/flash-list';
import {
  getIptvLibraryChannels,
  getIptvLibraryFilterOptions,
  getIptvLibraryStreams,
  getIptvLibrarySyncedAt,
  pickBestStream,
  syncIptvLibraryChannels,
  syncIptvLibraryStreams,
} from '@/services/iptv-library';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronRight, Heart, Plus, RefreshCw, Search } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createProbeQueue } from '@/utils/probe-queue';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TvTab = 'mine' | 'library';

type SourceChannelState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  channels: IptvChannel[];
  error?: string;
};

const TAB_ITEMS: Array<{ key: TvTab; label: string }> = [
  { key: 'mine', label: '我的直播源' },
  { key: 'library', label: '在线频道库' },
];
const TAB_UNDERLINE_WIDTH = 16;
const SOURCE_INDICATOR_HEIGHT = 16;
const CHANNEL_VIEWABILITY = { itemVisiblePercentThreshold: 50 };

function countryFlag(code: string) {
  if (!code) return '';
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function formatSourceUpdatedAt(timestamp: number) {
  if (!timestamp) return '未同步';
  const date = new Date(timestamp * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

export default function TvScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { sources } = useIptv();
  const { isLiveFavorite, toggleLiveFavorite, liveWatchHistory } = useUserData();

  const [tab, setTab] = useState<TvTab>('mine');
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [sourceStates, setSourceStates] = useState<Record<number, SourceChannelState>>({});
  const [sourceStats, setSourceStats] = useState<Record<number, { channelCount: number; updatedAt: number }>>({});
  const [channelStatus, setChannelStatus] = useState<Record<string, 'checking' | 'available' | 'unavailable'>>({});
  const [libraryChannelStatus, setLibraryChannelStatus] = useState<Record<string, 'checking' | 'available' | 'unavailable'>>({});
  const [query, setQuery] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const didInitRef = useRef(false);
  const probedChannelsRef = useRef<Set<string>>(new Set());
  const probedLibraryRef = useRef<Set<string>>(new Set());

  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [librarySyncProgress, setLibrarySyncProgress] = useState('');
  const [libraryStreamsSyncing, setLibraryStreamsSyncing] = useState(false);
  const [libraryStreamsReady, setLibraryStreamsReady] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryChannels, setLibraryChannels] = useState<IptvLibraryChannel[]>([]);
  const [countryOptions, setCountryOptions] = useState<FilterPickerOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<FilterPickerOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<FilterPickerOption[]>([]);
  const [filterCountry, setFilterCountry] = useState('CN');
  const [filterLanguage, setFilterLanguage] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [includeNsfw, setIncludeNsfw] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabUnderlineX = useRef(new Animated.Value(0)).current;
  const [tabMetrics, setTabMetrics] = useState<Record<string, { x: number; width: number }>>({});
  const sourceIndicatorY = useRef(new Animated.Value(0)).current;
  const [sourceMetrics, setSourceMetrics] = useState<Record<number, { y: number; height: number }>>({});
  const m3uProbeQueueRef = useRef<ReturnType<typeof createProbeQueue> | null>(null);
  if (!m3uProbeQueueRef.current) m3uProbeQueueRef.current = createProbeQueue(4);
  const m3uProbeQueue = m3uProbeQueueRef.current;
  const libraryProbeQueueRef = useRef<ReturnType<typeof createProbeQueue> | null>(null);
  if (!libraryProbeQueueRef.current) libraryProbeQueueRef.current = createProbeQueue(4);
  const libraryProbeQueue = libraryProbeQueueRef.current;
  const visibleM3uRef = useRef<Set<string>>(new Set());
  const visibleLibraryRef = useRef<Set<string>>(new Set());
  const m3uProbeControllersRef = useRef<Map<string, AbortController>>(new Map());
  const libraryProbeControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    const metric = tabMetrics[tab];
    if (!metric) return;
    Animated.timing(tabUnderlineX, {
      toValue: metric.x + (metric.width - TAB_UNDERLINE_WIDTH) / 2,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [tab, tabMetrics, tabUnderlineX]);

  useEffect(() => {
    if (selectedSourceId == null) return;
    const metric = sourceMetrics[selectedSourceId];
    if (!metric) return;
    Animated.timing(sourceIndicatorY, {
      toValue: metric.y + (metric.height - SOURCE_INDICATOR_HEIGHT) / 2,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selectedSourceId, sourceMetrics, sourceIndicatorY]);

  useEffect(() => {
    return () => {
      for (const controller of m3uProbeControllersRef.current.values()) controller.abort();
      for (const controller of libraryProbeControllersRef.current.values()) controller.abort();
    };
  }, []);

  const loadSourceStats = useCallback(async () => {
    try {
      const rows = await getIptvSourceStats(db);
      setSourceStats(Object.fromEntries(rows.map((row) => [
        row.sourceId,
        { channelCount: row.channelCount, updatedAt: row.updatedAt },
      ])));
    } catch (error) {
      console.warn('[TV] Failed to load source stats:', error);
    }
  }, [db]);

  const refreshSource = useCallback(async (source: IptvSource) => {
    setSourceStates((prev) => ({
      ...prev,
      [source.id]: { status: 'loading', channels: [] },
    }));
    try {
      const channels = await fetchIptvChannels(source.url);
      await cacheIptvChannels(db, source.id, channels);
      void loadSourceStats();
      setSourceStates((prev) => ({
        ...prev,
        [source.id]: { status: 'loaded', channels },
      }));
    } catch (error) {
      setSourceStates((prev) => ({
        ...prev,
        [source.id]: {
          status: 'error',
          channels: [],
          error: error instanceof Error ? error.message : '直播源加载失败',
        },
      }));
    }
  }, [db, loadSourceStats]);

  const loadSource = useCallback(async (source: IptvSource) => {
    const existing = sourceStates[source.id];
    if (existing?.status === 'loaded' || existing?.status === 'loading') return;

    try {
      const cached = await getCachedIptvChannels(db, source.id);
      if (cached && cached.length > 0) {
        void loadSourceStats();
        setSourceStates((prev) => ({
          ...prev,
          [source.id]: { status: 'loaded', channels: cached },
        }));
        void (async () => {
          try {
            const fresh = await fetchIptvChannels(source.url);
            await cacheIptvChannels(db, source.id, fresh);
            void loadSourceStats();
            setSourceStates((prev) => ({
              ...prev,
              [source.id]: { status: 'loaded', channels: fresh },
            }));
          } catch (error) {
            console.warn('[TV] Background refresh failed:', error);
          }
        })();
        return;
      }
    } catch (error) {
      console.warn('[TV] Failed to read cached channels:', error);
    }

    await refreshSource(source);
  }, [db, loadSourceStats, refreshSource, sourceStates]);

  const selectSource = useCallback((source: IptvSource) => {
    setSelectedSourceId(source.id);
    setQuery('');
    const state = sourceStates[source.id];
    if (state?.status !== 'loaded' && state?.status !== 'loading') {
      void loadSource(source);
    }
  }, [loadSource, sourceStates]);

  useEffect(() => {
    if (didInitRef.current || sources.length === 0) return;
    didInitRef.current = true;
    void loadSourceStats();
    selectSource(sources[0]);
  }, [loadSourceStats, selectSource, sources]);

  const reloadSelected = useCallback(() => {
    const source = sources.find((item) => item.id === selectedSourceId);
    if (source) {
      void refreshSource(source);
    }
  }, [refreshSource, selectedSourceId, sources]);

  const loadLibrary = useCallback(async () => {
    setLibraryError('');
    try {
      const [channels, countries, languages, categories] = await Promise.all([
        getIptvLibraryChannels(db, {
          country: filterCountry || undefined,
          language: filterLanguage || undefined,
          category: filterCategory || undefined,
          includeNsfw,
        }),
        getIptvLibraryFilterOptions(db, 'countries'),
        getIptvLibraryFilterOptions(db, 'languages'),
        getIptvLibraryFilterOptions(db, 'categories'),
      ]);
      setLibraryChannels(channels);
      setCountryOptions([
        { key: '', label: '全部国家' },
        ...countries.map((item) => ({ key: item.code, label: `${item.flag ?? ''} ${item.name}` })),
      ]);
      setLanguageOptions([
        { key: '', label: '全部语言' },
        ...languages.map((item) => ({ key: item.code, label: item.name })),
      ]);
      setCategoryOptions([
        { key: '', label: '全部分类' },
        ...categories.map((item) => ({ key: item.id, label: item.name })),
      ]);
    } catch (error) {
      console.warn('[TV] Failed to load library:', error);
      setLibraryError(error instanceof Error ? error.message : '在线频道库加载失败');
    }
  }, [db, filterCategory, filterCountry, filterLanguage, includeNsfw]);

  const syncLibrary = useCallback(async () => {
    setLibrarySyncing(true);
    setLibraryError('');
    setLibrarySyncProgress('准备同步频道数据…');
    setLibraryStreamsReady(false);
    try {
      await syncIptvLibraryChannels(db, ({ label, percent }) => {
        setLibrarySyncProgress(`${label} · ${percent}%`);
      });
      await loadLibrary();
      setLibrarySyncing(false);
      setLibrarySyncProgress('');
      setLibraryStreamsSyncing(true);
      setLibrarySyncProgress('正在后台同步流数据…');
      try {
        await syncIptvLibraryStreams(db, ({ label, percent }) => {
          setLibrarySyncProgress(`${label} · ${percent}%`);
        });
        setLibraryStreamsReady(true);
      } catch (error) {
        console.warn('[TV] Failed to sync library streams:', error);
      } finally {
        setLibraryStreamsSyncing(false);
        setLibrarySyncProgress('');
      }
    } catch (error) {
      console.warn('[TV] Failed to sync library:', error);
      setLibraryError(error instanceof Error ? error.message : '在线频道库同步失败');
    } finally {
      setLibrarySyncing(false);
      setLibrarySyncProgress((current) => (libraryStreamsSyncing ? current : ''));
    }
  }, [db, libraryStreamsSyncing, loadLibrary]);

  useEffect(() => {
    if (tab !== 'library') return;
    let cancelled = false;
    (async () => {
      const syncedAt = await getIptvLibrarySyncedAt(db);
      if (cancelled) return;
      if (syncedAt === 0) {
        await syncLibrary();
      } else {
        await loadLibrary();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadLibrary, syncLibrary, filterCountry, filterLanguage, filterCategory, includeNsfw, db]);

  const selectedState = selectedSourceId != null ? sourceStates[selectedSourceId] : undefined;
  const selectedSource = sources.find((item) => item.id === selectedSourceId) ?? null;
  const selectedChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const channels = selectedState?.channels ?? [];
    if (!keyword) return channels;
    return channels.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [query, selectedState]);

  const filteredLibraryChannels = useMemo(() => {
    const keyword = libraryQuery.trim().toLowerCase();
    if (!keyword) return libraryChannels;
    return libraryChannels.filter((item) => (
      item.name.toLowerCase().includes(keyword)
      || item.altNames.some((alt) => alt.toLowerCase().includes(keyword))
    ));
  }, [libraryChannels, libraryQuery]);

  const openM3uChannel = useCallback((channel: IptvChannel) => {
    const source = sources.find((item) => item.id === selectedSourceId);
    router.push({
      pathname: '/live-player',
      params: {
        kind: 'm3u',
        url: channel.url,
        name: channel.name,
        group: channel.group ?? '',
        logo: channel.logo ?? '',
        sourceId: selectedSourceId != null ? String(selectedSourceId) : '',
        sourceUrl: source?.url ?? '',
        sourceName: source?.name ?? '',
      },
    });
  }, [router, selectedSourceId, sources]);

  const openLibraryChannel = useCallback((channel: IptvLibraryChannel) => {
    router.push({
      pathname: '/live-player',
      params: {
        kind: 'library',
        channelId: channel.id,
        name: channel.name,
        country: channel.country,
      },
    });
  }, [router]);

  const openRecentLive = useCallback((item: LiveWatchHistoryRecord) => {
    router.push({
      pathname: '/live-player',
      params: {
        kind: item.kind,
        url: item.kind === 'm3u' ? item.channelUrl : '',
        channelId: item.kind === 'library' ? (item.channelId ?? '') : '',
        name: item.channelName,
        sourceId: item.kind === 'm3u' && item.sourceId != null ? String(item.sourceId) : '',
        sourceName: item.sourceName,
        logo: item.logo,
      },
    });
  }, [router]);

  const renderLibraryChannel = useCallback(({ item }: { item: IptvLibraryChannel }) => (
    <ChannelRow
      avatar={countryFlag(item.country) || item.name.trim().slice(0, 1) || '台'}
      title={item.name}
      subtitle={item.altNames.length > 0 ? item.altNames.join(' · ') : (item.categories.slice(0, 3).join(' · ') || item.country)}
      status={libraryChannelStatus[item.id]}
      favorite={isLiveFavorite('library', item.id)}
      nsfw={item.isNsfw}
      onToggleFavorite={() => {
        void toggleLiveFavorite({
          kind: 'library',
          channelId: item.id,
          channelName: item.name,
          channelUrl: '',
          sourceId: null,
          sourceName: '在线频道库',
          logo: '',
        });
      }}
      onPress={() => openLibraryChannel(item)}
      palette={palette}
    />
  ), [isLiveFavorite, libraryChannelStatus, openLibraryChannel, palette, toggleLiveFavorite]);

  const enqueueM3uProbe = useCallback((item: IptvChannel) => {
    if (probedChannelsRef.current.has(item.url)) return;
    if (m3uProbeControllersRef.current.has(item.url)) return;
    if (!visibleM3uRef.current.has(item.url)) return;

    probedChannelsRef.current.add(item.url);
    const controller = new AbortController();
    m3uProbeControllersRef.current.set(item.url, controller);
    setChannelStatus((prev) => ({ ...prev, [item.url]: 'checking' }));

    void m3uProbeQueue.run(async () => {
      if (controller.signal.aborted) return;
      const ok = await probeStreamUrl(item.url, controller.signal);
      if (controller.signal.aborted) return;
      setChannelStatus((prev) => ({ ...prev, [item.url]: ok ? 'available' : 'unavailable' }));
    }).catch(() => {
      if (!controller.signal.aborted) {
        setChannelStatus((prev) => ({ ...prev, [item.url]: 'unavailable' }));
      }
    }).finally(() => {
      m3uProbeControllersRef.current.delete(item.url);
    });
  }, [m3uProbeQueue]);

  const handleChannelViewable = useCallback(({ viewableItems }: { viewableItems: Array<{ item: IptvChannel }> }) => {
    const visible = new Set(viewableItems.map(({ item }) => item.url));
    visibleM3uRef.current = visible;

    for (const { item } of viewableItems) {
      enqueueM3uProbe(item);
    }

    for (const [key, controller] of m3uProbeControllersRef.current) {
      if (!visible.has(key)) controller.abort();
    }
  }, [enqueueM3uProbe]);

  const enqueueLibraryProbe = useCallback((item: IptvLibraryChannel) => {
    if (!libraryStreamsReady) return;
    if (probedLibraryRef.current.has(item.id)) return;
    if (libraryProbeControllersRef.current.has(item.id)) return;
    if (!visibleLibraryRef.current.has(item.id)) return;

    probedLibraryRef.current.add(item.id);
    const controller = new AbortController();
    libraryProbeControllersRef.current.set(item.id, controller);
    setLibraryChannelStatus((prev) => ({ ...prev, [item.id]: 'checking' }));

    void libraryProbeQueue.run(async () => {
      if (controller.signal.aborted) return;
      const streams = await getIptvLibraryStreams(db, item.id);
      const stream = pickBestStream(streams);
      if (controller.signal.aborted) return;
      if (!stream) {
        setLibraryChannelStatus((prev) => ({ ...prev, [item.id]: 'unavailable' }));
        return;
      }
      const ok = await probeStreamUrl(stream.url, controller.signal);
      if (controller.signal.aborted) return;
      setLibraryChannelStatus((prev) => ({ ...prev, [item.id]: ok ? 'available' : 'unavailable' }));
    }).catch(() => {
      if (!controller.signal.aborted) {
        setLibraryChannelStatus((prev) => ({ ...prev, [item.id]: 'unavailable' }));
      }
    }).finally(() => {
      libraryProbeControllersRef.current.delete(item.id);
    });
  }, [db, libraryProbeQueue, libraryStreamsReady]);

  const handleLibraryChannelViewable = useCallback(({ viewableItems }: { viewableItems: Array<{ item: IptvLibraryChannel }> }) => {
    const visible = new Set(viewableItems.map(({ item }) => item.id));
    visibleLibraryRef.current = visible;

    for (const { item } of viewableItems) {
      enqueueLibraryProbe(item);
    }

    for (const [key, controller] of libraryProbeControllersRef.current) {
      if (!visible.has(key)) controller.abort();
    }
  }, [enqueueLibraryProbe]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>电视</Text>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>
            {tab === 'mine' ? (selectedSourceId != null ? sources.find((item) => item.id === selectedSourceId)?.name ?? '我的直播源' : '我的直播源') : '在线频道库 · iptv-org'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {tab === 'mine' ? (
            <>
              <Pressable onPress={reloadSelected} hitSlop={8} style={styles.headerButton}>
                <RefreshCw size={18} color={palette.text} strokeWidth={1.8} />
              </Pressable>
              <Pressable onPress={() => router.push('/live-sources')} hitSlop={8} style={styles.headerButton}>
                <Plus size={20} color={palette.text} strokeWidth={1.9} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => setDrawerOpen(true)} hitSlop={8} style={styles.headerButton}>
                <Text style={[styles.headerButtonText, { color: palette.text }]}>筛选</Text>
              </Pressable>
              <Pressable onPress={syncLibrary} disabled={librarySyncing || libraryStreamsSyncing} hitSlop={8} style={styles.headerButton}>
                <Text style={[styles.headerButtonText, { color: palette.text }]}>
                  {librarySyncing ? '同步中' : libraryStreamsSyncing ? '流同步中' : '同步'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {liveWatchHistory.length > 0 ? (
        <View style={[styles.recentWrap, { borderBottomColor: palette.border }]}>
          <Text style={[styles.recentTitle, { color: palette.secondaryText }]}>最近看过的直播</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {liveWatchHistory.slice(0, 8).map((item) => (
              <Pressable
                key={item.id}
                style={[styles.recentChip, { backgroundColor: palette.segmentBackground }]}
                onPress={() => openRecentLive(item)}>
                <Text style={[styles.recentChipText, { color: palette.text }]} numberOfLines={1}>
                  {item.channelName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.tabsWrap}>
        <View style={styles.tabsRow}>
          {TAB_ITEMS.map((item) => {
            const isSelected = tab === item.key;
            return (
              <Pressable
                key={item.key}
                style={styles.tabButton}
                onPress={() => setTab(item.key)}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  setTabMetrics((current) => {
                    const previous = current[item.key];
                    if (previous?.x === x && previous.width === width) return current;
                    return { ...current, [item.key]: { x, width } };
                  });
                }}
                hitSlop={10}>
                <Text style={[styles.tabText, { color: isSelected ? palette.text : palette.secondaryText }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
          <Animated.View
            style={[
              styles.tabUnderline,
              {
                backgroundColor: palette.text,
                transform: [{ translateX: tabUnderlineX }],
              },
            ]}
          />
        </View>
      </View>

      {tab === 'mine' ? (
        <View style={styles.mineLayout}>
          <View style={[styles.sourceSidebar, { backgroundColor: palette.segmentBackground }]}>
            <View style={styles.sourceSidebarScroll}>
              {sources.map((source) => {
                const isActive = source.id === selectedSourceId;
                return (
                  <Pressable
                    key={source.id}
                    style={[
                      styles.sourceSideItem,
                      { borderBottomColor: palette.border },
                      isActive && { backgroundColor: palette.background },
                    ]}
                    onLayout={(event) => {
                      const { y, height } = event.nativeEvent.layout;
                      setSourceMetrics((current) => {
                        const previous = current[source.id];
                        if (previous?.y === y && previous.height === height) return current;
                        return { ...current, [source.id]: { y, height } };
                      });
                    }}
                    onPress={() => selectSource(source)}>
                    <View style={styles.sourceSideTextWrap}>
                      <Text
                        style={[styles.sourceSideText, { color: isActive ? palette.text : palette.secondaryText }]}
                        numberOfLines={2}>
                        {source.name}
                      </Text>
                      <Text
                        style={[styles.sourceSideMeta, { color: isActive ? palette.secondaryText : palette.secondaryText }]}
                        numberOfLines={1}>
                        {sourceStats[source.id]
                          ? `更新 ${formatSourceUpdatedAt(sourceStats[source.id].updatedAt)} · ${sourceStats[source.id].channelCount} 个频道`
                          : '未同步'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Animated.View
              style={[
                styles.sourceIndicator,
                {
                  backgroundColor: palette.text,
                  transform: [{ translateY: sourceIndicatorY }],
                },
              ]}
            />
          </View>

          <View style={styles.channelPane}>
            <View style={[styles.searchWrap, { backgroundColor: palette.segmentBackground }]}>
              <Search size={17} color={palette.secondaryText} strokeWidth={1.8} />
              <TextInput
                style={[styles.searchInput, { color: palette.text }]}
                value={query}
                onChangeText={setQuery}
                placeholder="搜索频道"
                placeholderTextColor={palette.secondaryText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {!selectedSourceId ? (
              <ListState text="选择左侧直播源" palette={palette} />
            ) : selectedState?.status === 'loading' ? (
              <ListState text="正在加载频道..." palette={palette} />
            ) : selectedState?.status === 'error' ? (
              <ListState text={selectedState.error ?? '直播源加载失败'} actionLabel="重试" onAction={reloadSelected} palette={palette} />
            ) : (
              <FlashList
                data={selectedChannels}
                keyExtractor={(item) => item.url}
                viewabilityConfig={CHANNEL_VIEWABILITY}
                onViewableItemsChanged={handleChannelViewable}
                renderItem={({ item }) => (
                  <ChannelRow
                    avatar={item.name.trim().slice(0, 1) || '台'}
                    title={item.name}
                    subtitle={item.group}
                    status={channelStatus[item.url]}
                    favorite={isLiveFavorite('m3u', item.url)}
                    onToggleFavorite={() => {
                      void toggleLiveFavorite({
                        kind: 'm3u',
                        channelId: null,
                        channelName: item.name,
                        channelUrl: item.url,
                        sourceId: selectedSourceId,
                        sourceName: selectedSource?.name ?? '',
                        logo: item.logo ?? '',
                      });
                    }}
                    onPress={() => openM3uChannel(item)}
                    palette={palette}
                  />
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
              />
            )}
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.librarySearchWrap, { backgroundColor: palette.segmentBackground }]}>
            <Search size={17} color={palette.secondaryText} strokeWidth={1.8} />
            <TextInput
              style={[styles.searchInput, { color: palette.text }]}
              value={libraryQuery}
              onChangeText={setLibraryQuery}
              placeholder="搜索频道名或别名"
              placeholderTextColor={palette.secondaryText}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {libraryStreamsSyncing ? (
            <View style={[styles.streamSyncBanner, { backgroundColor: palette.segmentBackground }]}>
              <ActivityIndicator size="small" color={palette.secondaryText} />
              <Text style={[styles.streamSyncBannerText, { color: palette.secondaryText }]} numberOfLines={1}>
                {librarySyncProgress || '正在后台同步流数据…'}
              </Text>
            </View>
          ) : null}
          {librarySyncing ? (
            <ListState text={librarySyncProgress || '正在同步频道库...'} palette={palette} />
          ) : libraryError ? (
            <ListState text={libraryError} actionLabel="重试" onAction={syncLibrary} palette={palette} />
          ) : (
            <FlashList
              data={filteredLibraryChannels}
              keyExtractor={(item) => item.id}
              viewabilityConfig={CHANNEL_VIEWABILITY}
              onViewableItemsChanged={handleLibraryChannelViewable}
              renderItem={renderLibraryChannel}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </>
      )}

      <FilterDrawer
        visible={drawerOpen}
        countryOptions={countryOptions}
        languageOptions={languageOptions}
        categoryOptions={categoryOptions}
        country={filterCountry}
        language={filterLanguage}
        category={filterCategory}
        includeNsfw={includeNsfw}
        onApply={(filters) => {
          setFilterCountry(filters.country);
          setFilterLanguage(filters.language);
          setFilterCategory(filters.category);
          setIncludeNsfw(filters.includeNsfw);
        }}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

function ChannelRow({
  avatar,
  title,
  subtitle,
  status,
  favorite,
  nsfw,
  onToggleFavorite,
  onPress,
  palette,
}: {
  avatar: string;
  title: string;
  subtitle?: string;
  status?: 'checking' | 'available' | 'unavailable';
  favorite?: boolean;
  nsfw?: boolean;
  onToggleFavorite?: () => void;
  onPress: () => void;
  palette: typeof lightPalette;
}) {
  const statusColor = status === 'available'
    ? palette.success
    : status === 'unavailable'
      ? palette.danger
      : palette.secondaryText;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.channelRow,
        { borderBottomColor: palette.border },
        pressed && { opacity: 0.6 },
      ]}
      onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: palette.segmentBackground }]}>
        <Text style={[styles.avatarText, { color: palette.secondaryText }]}>{avatar}</Text>
      </View>
      <View style={styles.channelText}>
        <Text style={[styles.channelName, { color: palette.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.channelMeta, { color: palette.secondaryText }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {status ? <View style={[styles.statusDot, { backgroundColor: statusColor }]} /> : null}
      {nsfw ? (
        <Text style={[styles.nsfwBadge, { color: palette.danger, borderColor: palette.danger }]}>NSFW</Text>
      ) : null}
      {onToggleFavorite ? (
        <Pressable onPress={onToggleFavorite} hitSlop={6}>
          <Heart
            size={17}
            color={favorite ? palette.text : palette.secondaryText}
            fill={favorite ? palette.text : 'transparent'}
            strokeWidth={1.8}
          />
        </Pressable>
      ) : null}
      <ChevronRight size={17} color={palette.secondaryText} strokeWidth={1.8} />
    </Pressable>
  );
}

function ListState({
  text,
  actionLabel,
  onAction,
  palette,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  palette: typeof lightPalette;
}) {
  return (
    <View style={styles.listState}>
      <ActivityIndicator size="small" color={palette.secondaryText} />
      <Text style={[styles.listStateText, { color: palette.secondaryText }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable style={[styles.stateButton, { backgroundColor: palette.text }]} onPress={onAction}>
          <Text style={[styles.stateButtonText, { color: palette.inverseText }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  inverseText: '#FFFFFF',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  segmentBackground: '#F2F2F0',
  accent: '#2563EB',
  success: '#2E7D32',
  danger: '#C62828',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  segmentBackground: '#1D1D1D',
  accent: '#60A5FA',
  success: '#81C784',
  danger: '#E57373',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  recentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentTitle: {
    marginBottom: 7,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  recentChip: {
    maxWidth: 160,
    height: 30,
    marginRight: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  recentChipText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  tabsWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 20,
    minHeight: 30,
    position: 'relative',
  },
  tabButton: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tabText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    top: 22,
    width: TAB_UNDERLINE_WIDTH,
    height: 4,
    borderRadius: 4,
  },
  mineLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  sourceSidebar: {
    width: 108,
    position: 'relative',
  },
  sourceSidebarScroll: {
    flex: 1,
  },
  sourceSideItem: {
    height: 44,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 4,
    height: SOURCE_INDICATOR_HEIGHT,
    borderRadius: 2,
  },
  sourceSideTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sourceSideText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  sourceSideMeta: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  channelPane: {
    flex: 1,
  },
  searchWrap: {
    marginHorizontal: 12,
    marginTop: 0,
    height: 38,
    borderRadius: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  librarySearchWrap: {
    marginHorizontal: 16,
    marginTop: 0,
    height: 38,
    borderRadius: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamSyncBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    minHeight: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamSyncBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    paddingVertical: 0,
  },
  channelRow: {
    minHeight: 64,
    marginHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  channelText: {
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  channelMeta: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nsfwBadge: {
    marginLeft: 8,
    paddingHorizontal: 5,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  listState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  listStateText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  stateButton: {
    minHeight: 38,
    paddingHorizontal: 20,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  listContent: {
    paddingBottom: 136,
  },
});
