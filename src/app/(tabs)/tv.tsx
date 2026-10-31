import type { FilterPickerOption } from '@/components/iptv/filter-picker';
import { FilterDrawer, type IptvLibraryFilters } from '@/components/iptv/filter-drawer';
import { useIptv } from '@/context/iptv-context';
import { useThemeName } from '@/hooks/use-theme';
import type { IptvChannel, IptvLibraryChannel, IptvSource } from '@/models/iptv';
import { fetchIptvChannels } from '@/services/iptv';
import {
  getIptvLibraryChannels,
  getIptvLibraryFilterOptions,
  getIptvLibrarySyncedAt,
  syncIptvLibrary,
} from '@/services/iptv-library';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronRight, Plus, RefreshCw, Search } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
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

function countryFlag(code: string) {
  if (!code) return '';
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export default function TvScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { sources } = useIptv();

  const [tab, setTab] = useState<TvTab>('mine');
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [sourceStates, setSourceStates] = useState<Record<number, SourceChannelState>>({});
  const [query, setQuery] = useState('');
  const didInitRef = useRef(false);

  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryChannels, setLibraryChannels] = useState<IptvLibraryChannel[]>([]);
  const [countryOptions, setCountryOptions] = useState<FilterPickerOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<FilterPickerOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<FilterPickerOption[]>([]);
  const [filterCountry, setFilterCountry] = useState('CN');
  const [filterLanguage, setFilterLanguage] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabUnderlineX = useRef(new Animated.Value(0)).current;
  const [tabMetrics, setTabMetrics] = useState<Record<string, { x: number; width: number }>>({});
  const sourceIndicatorY = useRef(new Animated.Value(0)).current;
  const [sourceMetrics, setSourceMetrics] = useState<Record<number, { y: number; height: number }>>({});

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

  const fetchSource = useCallback(async (source: IptvSource) => {
    setSourceStates((prev) => ({
      ...prev,
      [source.id]: { status: 'loading', channels: [] },
    }));
    try {
      const channels = await fetchIptvChannels(source.url);
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
  }, []);

  const selectSource = useCallback((source: IptvSource) => {
    setSelectedSourceId(source.id);
    setQuery('');
    const state = sourceStates[source.id];
    if (state?.status !== 'loaded' && state?.status !== 'loading') {
      void fetchSource(source);
    }
  }, [fetchSource, sourceStates]);

  useEffect(() => {
    if (didInitRef.current || sources.length === 0) return;
    didInitRef.current = true;
    selectSource(sources[0]);
  }, [sources, selectSource]);

  const reloadSelected = useCallback(() => {
    const source = sources.find((item) => item.id === selectedSourceId);
    if (source) {
      void fetchSource(source);
    }
  }, [fetchSource, selectedSourceId, sources]);

  const loadLibrary = useCallback(async () => {
    setLibraryError('');
    try {
      const [channels, countries, languages, categories] = await Promise.all([
        getIptvLibraryChannels(db, {
          country: filterCountry || undefined,
          language: filterLanguage || undefined,
          category: filterCategory || undefined,
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
  }, [db, filterCategory, filterCountry, filterLanguage]);

  const syncLibrary = useCallback(async () => {
    setLibrarySyncing(true);
    setLibraryError('');
    try {
      await syncIptvLibrary(db);
      await loadLibrary();
    } catch (error) {
      console.warn('[TV] Failed to sync library:', error);
      setLibraryError(error instanceof Error ? error.message : '在线频道库同步失败');
    } finally {
      setLibrarySyncing(false);
    }
  }, [db, loadLibrary]);

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
  }, [tab, loadLibrary, syncLibrary, filterCountry, filterLanguage, filterCategory, db]);

  const selectedState = selectedSourceId != null ? sourceStates[selectedSourceId] : undefined;
  const selectedChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const channels = selectedState?.channels ?? [];
    if (!keyword) return channels;
    return channels.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [query, selectedState]);

  const openM3uChannel = useCallback((channel: IptvChannel) => {
    router.push({
      pathname: '/live-player',
      params: {
        kind: 'm3u',
        url: channel.url,
        name: channel.name,
        group: channel.group ?? '',
        logo: channel.logo ?? '',
      },
    });
  }, [router]);

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

  const renderLibraryChannel = useCallback(({ item }: { item: IptvLibraryChannel }) => (
    <ChannelRow
      avatar={countryFlag(item.country) || item.name.trim().slice(0, 1) || '台'}
      title={item.name}
      subtitle={item.categories.slice(0, 3).join(' · ') || item.country}
      onPress={() => openLibraryChannel(item)}
      palette={palette}
    />
  ), [openLibraryChannel, palette]);

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
              <Pressable onPress={syncLibrary} disabled={librarySyncing} hitSlop={8} style={styles.headerButton}>
                <Text style={[styles.headerButtonText, { color: palette.text }]}>{librarySyncing ? '同步中' : '同步'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

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
                    <Text
                      style={[styles.sourceSideText, { color: isActive ? palette.text : palette.secondaryText }]}
                      numberOfLines={2}>
                      {source.name}
                    </Text>
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
              <FlatList
                data={selectedChannels}
                keyExtractor={(item) => item.url}
                renderItem={({ item }) => (
                  <ChannelRow
                    avatar={item.name.trim().slice(0, 1) || '台'}
                    title={item.name}
                    subtitle={item.group}
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
          {librarySyncing ? (
            <ListState text="正在同步频道库..." palette={palette} />
          ) : libraryError ? (
            <ListState text={libraryError} actionLabel="重试" onAction={syncLibrary} palette={palette} />
          ) : (
            <FlatList
              data={libraryChannels}
              keyExtractor={(item) => item.id}
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
        onApply={(filters) => {
          setFilterCountry(filters.country);
          setFilterLanguage(filters.language);
          setFilterCategory(filters.category);
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
  onPress,
  palette,
}: {
  avatar: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  palette: typeof lightPalette;
}) {
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
  segmentBackground: '#ECECEA',
  accent: '#2563EB',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  segmentBackground: '#1D1D1D',
  accent: '#60A5FA',
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
  sourceSideText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
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
