import { FilterPicker, type FilterPickerOption } from '@/components/iptv/filter-picker';
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
import { ChevronDown, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  const [picker, setPicker] = useState<'country' | 'language' | 'category' | null>(null);

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

  const countryLabel = countryOptions.find((item) => item.key === filterCountry)?.label ?? '国家';
  const languageLabel = languageOptions.find((item) => item.key === filterLanguage)?.label ?? '语言';
  const categoryLabel = categoryOptions.find((item) => item.key === filterCategory)?.label ?? '分类';

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
            <Pressable onPress={syncLibrary} disabled={librarySyncing} hitSlop={8} style={styles.headerButton}>
              <Text style={[styles.headerButtonText, { color: palette.text }]}>{librarySyncing ? '同步中' : '同步'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.segmentWrap}>
        <View style={[styles.segment, { backgroundColor: palette.segmentBackground }]}>
          <Pressable
            style={[styles.segmentItem, tab === 'mine' && { backgroundColor: palette.text }]}
            onPress={() => setTab('mine')}>
            <Text style={[styles.segmentText, { color: tab === 'mine' ? palette.inverseText : palette.secondaryText }]}>我的直播源</Text>
          </Pressable>
          <Pressable
            style={[styles.segmentItem, tab === 'library' && { backgroundColor: palette.text }]}
            onPress={() => setTab('library')}>
            <Text style={[styles.segmentText, { color: tab === 'library' ? palette.inverseText : palette.secondaryText }]}>在线频道库</Text>
          </Pressable>
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
                    onPress={() => selectSource(source)}>
                    {isActive ? <View style={[styles.sourceSideAccent, { backgroundColor: palette.accent }]} /> : null}
                    <Text
                      style={[styles.sourceSideText, { color: isActive ? palette.accent : palette.text }]}
                      numberOfLines={2}>
                      {source.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
          <View style={styles.filterRow}>
            <FilterButton label={countryLabel} onPress={() => setPicker('country')} palette={palette} />
            <FilterButton label={languageLabel} onPress={() => setPicker('language')} palette={palette} />
            <FilterButton label={categoryLabel} onPress={() => setPicker('category')} palette={palette} />
          </View>

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

      <FilterPicker
        visible={picker === 'country'}
        title="选择国家"
        options={countryOptions}
        selectedKey={filterCountry}
        onSelect={setFilterCountry}
        onClose={() => setPicker(null)}
      />
      <FilterPicker
        visible={picker === 'language'}
        title="选择语言"
        options={languageOptions}
        selectedKey={filterLanguage}
        onSelect={setFilterLanguage}
        onClose={() => setPicker(null)}
      />
      <FilterPicker
        visible={picker === 'category'}
        title="选择分类"
        options={categoryOptions}
        selectedKey={filterCategory}
        onSelect={setFilterCategory}
        onClose={() => setPicker(null)}
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

function FilterButton({ label, onPress, palette }: { label: string; onPress: () => void; palette: typeof lightPalette }) {
  return (
    <Pressable style={[styles.filterButton, { backgroundColor: palette.segmentBackground }]} onPress={onPress}>
      <Text style={[styles.filterButtonText, { color: palette.text }]} numberOfLines={1}>{label}</Text>
      <ChevronDown size={14} color={palette.secondaryText} strokeWidth={1.8} />
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
  segmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  segment: {
    height: 38,
    borderRadius: 0,
    padding: 3,
    flexDirection: 'row',
  },
  segmentItem: {
    flex: 1,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  mineLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  sourceSidebar: {
    width: 108,
  },
  sourceSidebarScroll: {
    flex: 1,
  },
  sourceSideItem: {
    height: 58,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceSideAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
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
    marginTop: 10,
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
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    height: 36,
    borderRadius: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  filterButtonText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
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
