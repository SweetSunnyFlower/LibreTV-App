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
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react-native';
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

type MineRow =
  | { type: 'source'; source: IptvSource }
  | { type: 'loading'; sourceId: number }
  | { type: 'error'; sourceId: number; message: string }
  | { type: 'channel'; channel: IptvChannel };

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
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sourceStates, setSourceStates] = useState<Record<number, SourceChannelState>>({});
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

  const toggleSource = useCallback(async (source: IptvSource) => {
    const willExpand = !expandedIds.has(source.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (willExpand) {
        next.add(source.id);
      } else {
        next.delete(source.id);
      }
      return next;
    });

    if (willExpand) {
      const state = sourceStates[source.id];
      if (state?.status !== 'loaded' && state?.status !== 'loading') {
        await fetchSource(source);
      }
    }
  }, [expandedIds, fetchSource, sourceStates]);

  useEffect(() => {
    if (didInitRef.current || sources.length === 0) return;
    didInitRef.current = true;
    void toggleSource(sources[0]);
  }, [sources, toggleSource]);

  const reloadMine = useCallback(() => {
    setSourceStates({});
    const expanded = new Set(expandedIds);
    for (const source of sources) {
      if (expanded.has(source.id)) {
        void fetchSource(source);
      }
    }
  }, [expandedIds, fetchSource, sources]);

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

  const mineRows = useMemo<MineRow[]>(() => {
    const rows: MineRow[] = [];
    const keyword = query.trim().toLowerCase();
    for (const source of sources) {
      rows.push({ type: 'source', source });
      if (!expandedIds.has(source.id)) continue;

      const state = sourceStates[source.id];
      if (state?.status === 'loading') {
        rows.push({ type: 'loading', sourceId: source.id });
        continue;
      }
      if (state?.status === 'error') {
        rows.push({ type: 'error', sourceId: source.id, message: state.error ?? '直播源加载失败' });
        continue;
      }
      for (const channel of state?.channels ?? []) {
        if (!keyword || channel.name.toLowerCase().includes(keyword)) {
          rows.push({ type: 'channel', channel });
        }
      }
    }
    return rows;
  }, [sources, expandedIds, sourceStates, query]);

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

  const renderMineRow = useCallback(({ item }: { item: MineRow }) => {
    if (item.type === 'source') {
      const isExpanded = expandedIds.has(item.source.id);
      const state = sourceStates[item.source.id];
      const count = state?.status === 'loaded' ? `${state.channels.length} 个频道` : state?.status === 'loading' ? '加载中...' : '';
      return (
        <Pressable
          style={({ pressed }) => [
            styles.sourceHeader,
            { borderBottomColor: palette.border, backgroundColor: palette.segmentBackground },
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => toggleSource(item.source)}>
          <View style={styles.sourceHeaderText}>
            <Text style={[styles.sourceName, { color: palette.text }]} numberOfLines={1}>{item.source.name}</Text>
            {count ? <Text style={[styles.sourceMeta, { color: palette.secondaryText }]}>{count}</Text> : null}
          </View>
          {isExpanded ? <ChevronUp size={18} color={palette.secondaryText} strokeWidth={1.8} /> : <ChevronDown size={18} color={palette.secondaryText} strokeWidth={1.8} />}
        </Pressable>
      );
    }
    if (item.type === 'loading') {
      return <View style={styles.inlineState}><ActivityIndicator size="small" color={palette.secondaryText} /></View>;
    }
    if (item.type === 'error') {
      return <Text style={[styles.inlineError, { color: palette.secondaryText }]}>{item.message}</Text>;
    }
    return (
      <ChannelRow
        avatar={item.channel.name.trim().slice(0, 1) || '台'}
        title={item.channel.name}
        subtitle={item.channel.group}
        onPress={() => openM3uChannel(item.channel)}
        palette={palette}
      />
    );
  }, [expandedIds, openM3uChannel, palette, sourceStates, toggleSource]);

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
            {tab === 'mine' ? `${sources.length} 个直播源` : '在线频道库 · iptv-org'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {tab === 'mine' ? (
            <>
              <Pressable onPress={reloadMine} hitSlop={8} style={styles.headerButton}>
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
        <>
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
          <FlatList
            data={mineRows}
            keyExtractor={(item, index) => (item.type === 'channel' ? item.channel.url : `${item.type}-${index}`)}
            renderItem={renderMineRow}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </>
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
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    height: 40,
    borderRadius: 0,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
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
  sourceHeader: {
    minHeight: 48,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sourceName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  sourceMeta: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  channelRow: {
    minHeight: 64,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  channelText: {
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  channelMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  inlineState: {
    minHeight: 56,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineError: {
    marginHorizontal: 16,
    paddingVertical: 16,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
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
