import { FilterPicker, type FilterPickerOption } from '@/components/iptv/filter-picker';
import { useIptv } from '@/context/iptv-context';
import { useThemeName } from '@/hooks/use-theme';
import type { IptvChannel, IptvLibraryChannel } from '@/models/iptv';
import { getAppSetting, setAppSetting } from '@/services/database';
import { fetchIptvChannels } from '@/services/iptv';
import {
  getIptvLibraryChannels,
  getIptvLibraryFilterOptions,
  getIptvLibraryStreams,
  getIptvLibrarySyncedAt,
  pickBestStream,
  syncIptvLibrary,
} from '@/services/iptv-library';
import { groupIptvChannels } from '@/utils/iptv';
import { useEvent } from 'expo';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronDown, RefreshCw, Search, Tv, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_HEIGHT = Math.min(SCREEN_WIDTH * 0.56, 300);

type TvTab = 'mine' | 'library';

export default function TvScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { source } = useIptv();

  const [tab, setTab] = useState<TvTab>('mine');
  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [currentM3u, setCurrentM3u] = useState<IptvChannel | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);

  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryChannels, setLibraryChannels] = useState<IptvLibraryChannel[]>([]);
  const [currentLibrary, setCurrentLibrary] = useState<IptvLibraryChannel | null>(null);
  const [countryOptions, setCountryOptions] = useState<FilterPickerOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<FilterPickerOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<FilterPickerOption[]>([]);
  const [filterCountry, setFilterCountry] = useState('CN');
  const [filterLanguage, setFilterLanguage] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [picker, setPicker] = useState<'country' | 'language' | 'category' | null>(null);

  const player = useVideoPlayer(null, () => {});
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });

  const playUrl = useCallback(async (uri: string, headers?: Record<string, string>) => {
    setErrorMsg('');
    try {
      await player.replaceAsync(headers ? { uri, headers } : { uri });
      player.play();
    } catch (error) {
      console.warn('[TV] Failed to play:', error);
      setErrorMsg(error instanceof Error ? error.message : '频道播放失败');
    }
  }, [player]);

  const loadM3uChannels = useCallback(async () => {
    if (!source) {
      setChannels([]);
      setCurrentM3u(null);
      setErrorMsg('');
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setErrorMsg('');
    try {
      const parsed = await fetchIptvChannels(source.url);
      if (requestRef.current !== requestId) return;
      setChannels(parsed);

      const lastKey = `iptv.lastChannel.${source.id}`;
      const lastUrl = await getAppSetting(db, lastKey);
      const restored = parsed.find((item) => item.url === lastUrl) ?? parsed[0] ?? null;
      setCurrentM3u(restored);
    } catch (error) {
      if (requestRef.current !== requestId) return;
      console.warn('[TV] Failed to load IPTV channels:', error);
      setErrorMsg(error instanceof Error ? error.message : '直播源加载失败');
      setChannels([]);
      setCurrentM3u(null);
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [db, source]);

  useEffect(() => {
    void loadM3uChannels();
    return () => {
      requestRef.current += 1;
    };
  }, [loadM3uChannels, refreshKey]);

  const playM3uChannel = useCallback(async (channel: IptvChannel) => {
    setCurrentM3u(channel);
    setCurrentLibrary(null);
    await playUrl(channel.url);
    if (source) {
      await setAppSetting(db, `iptv.lastChannel.${source.id}`, channel.url);
    }
  }, [db, playUrl, source]);

  const playLibraryChannel = useCallback(async (channel: IptvLibraryChannel) => {
    setCurrentLibrary(channel);
    setCurrentM3u(null);
    setLibraryError('');
    try {
      const streams = await getIptvLibraryStreams(db, channel.id);
      const stream = pickBestStream(streams);
      if (!stream) {
        setLibraryError('该频道暂无可用播放源');
        return;
      }
      const headers: Record<string, string> = {};
      if (stream.referrer) headers.Referer = stream.referrer;
      if (stream.userAgent) headers['User-Agent'] = stream.userAgent;
      await playUrl(stream.url, headers);
    } catch (error) {
      console.warn('[TV] Failed to load library streams:', error);
      setLibraryError(error instanceof Error ? error.message : '频道加载失败');
    }
  }, [db, playUrl]);

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

  const filteredChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return channels;
    return channels.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [channels, query]);

  const sections = useMemo(
    () => groupIptvChannels(filteredChannels).map((group) => ({ title: group.name, data: group.channels })),
    [filteredChannels]
  );

  const countryLabel = countryOptions.find((item) => item.key === filterCountry)?.label ?? '国家';
  const languageLabel = languageOptions.find((item) => item.key === filterLanguage)?.label ?? '语言';
  const categoryLabel = categoryOptions.find((item) => item.key === filterCategory)?.label ?? '分类';

  const renderM3uChannel = useCallback(({ item }: { item: IptvChannel }) => {
    const isActive = currentM3u?.url === item.url;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.channelRow,
          isActive && { backgroundColor: palette.segmentBackground },
          pressed && { opacity: 0.6 },
        ]}
        onPress={() => playM3uChannel(item)}>
        <Text style={[styles.channelName, { color: isActive ? palette.accent : palette.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {isActive ? <Text style={[styles.playingBadge, { color: palette.accent }]}>播放中</Text> : null}
      </Pressable>
    );
  }, [currentM3u?.url, palette.accent, palette.segmentBackground, palette.text, playM3uChannel]);

  const renderLibraryChannel = useCallback(({ item }: { item: IptvLibraryChannel }) => {
    const isActive = currentLibrary?.id === item.id;
    const meta = item.categories.slice(0, 2).join(' · ') || item.country;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.channelRow,
          isActive && { backgroundColor: palette.segmentBackground },
          pressed && { opacity: 0.6 },
        ]}
        onPress={() => playLibraryChannel(item)}>
        <View style={styles.libraryText}>
          <Text style={[styles.channelName, { color: isActive ? palette.accent : palette.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {meta ? <Text style={[styles.channelMeta, { color: palette.secondaryText }]} numberOfLines={1}>{meta}</Text> : null}
        </View>
        {isActive ? <Text style={[styles.playingBadge, { color: palette.accent }]}>播放中</Text> : null}
      </Pressable>
    );
  }, [currentLibrary?.id, palette.accent, palette.secondaryText, palette.segmentBackground, palette.text, playLibraryChannel]);

  const renderEmptyVideo = (title: string, button?: { label: string; onPress: () => void }) => (
    <View style={styles.emptyVideo}>
      {tab === 'library' ? <Tv size={28} color={palette.secondaryText} strokeWidth={1.5} /> : <WifiOff size={28} color={palette.secondaryText} strokeWidth={1.5} />}
      <Text style={[styles.emptyVideoText, { color: palette.secondaryText }]}>{title}</Text>
      {button ? (
        <Pressable style={[styles.primaryButton, { backgroundColor: palette.text }]} onPress={button.onPress}>
          <Text style={[styles.primaryButtonText, { color: palette.inverseText }]}>{button.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>电视</Text>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>
            {tab === 'mine' ? (source ? source.name : '暂无直播源') : '在线频道库 · iptv-org'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {tab === 'mine' ? (
            <>
              <Pressable onPress={() => setRefreshKey((value) => value + 1)} hitSlop={8} style={styles.headerButton}>
                <RefreshCw size={18} color={palette.text} strokeWidth={1.8} />
              </Pressable>
              <Pressable onPress={() => router.push('/live-sources')} hitSlop={8} style={styles.headerButton}>
                <Text style={[styles.headerButtonText, { color: palette.text }]}>换源</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={syncLibrary} disabled={librarySyncing} hitSlop={8} style={styles.headerButton}>
              <Text style={[styles.headerButtonText, { color: palette.text }]}>{librarySyncing ? '同步中' : '同步'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.videoShell}>
        {tab === 'mine' && !source ? (
          renderEmptyVideo('请先添加直播源', { label: '去添加', onPress: () => router.push('/live-sources') })
        ) : tab === 'mine' && !currentM3u ? (
          renderEmptyVideo('暂无频道')
        ) : tab === 'library' && !currentLibrary ? (
          renderEmptyVideo('选择频道开始播放')
        ) : (
          <VideoView
            player={player}
            nativeControls
            allowsPictureInPicture
            contentFit="contain"
            style={styles.video}
          />
        )}
        {status === 'loading' ? (
          <View style={styles.buffering} pointerEvents="none">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : null}
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

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={palette.secondaryText} />
              <Text style={[styles.loadingText, { color: palette.secondaryText }]}>正在加载频道...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.loadingState}>
              <Text style={[styles.errorText, { color: palette.secondaryText }]}>{errorMsg}</Text>
              <Pressable style={[styles.primaryButton, { backgroundColor: palette.text }]} onPress={() => setRefreshKey((value) => value + 1)}>
                <Text style={[styles.primaryButtonText, { color: palette.inverseText }]}>重试</Text>
              </Pressable>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.url}
              renderItem={renderM3uChannel}
              renderSectionHeader={({ section }) => (
                <Text style={[styles.sectionHeader, { color: palette.secondaryText }]}>{section.title}</Text>
              )}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.filterRow}>
            <FilterButton label={countryLabel} onPress={() => setPicker('country')} palette={palette} />
            <FilterButton label={languageLabel} onPress={() => setPicker('language')} palette={palette} />
            <FilterButton label={categoryLabel} onPress={() => setPicker('category')} palette={palette} />
          </View>

          {librarySyncing ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={palette.secondaryText} />
              <Text style={[styles.loadingText, { color: palette.secondaryText }]}>正在同步频道库...</Text>
            </View>
          ) : libraryError ? (
            <View style={styles.loadingState}>
              <Text style={[styles.errorText, { color: palette.secondaryText }]}>{libraryError}</Text>
              <Pressable style={[styles.primaryButton, { backgroundColor: palette.text }]} onPress={syncLibrary}>
                <Text style={[styles.primaryButtonText, { color: palette.inverseText }]}>重试</Text>
              </Pressable>
            </View>
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

function FilterButton({ label, onPress, palette }: { label: string; onPress: () => void; palette: typeof lightPalette }) {
  return (
    <Pressable style={[styles.filterButton, { backgroundColor: palette.segmentBackground }]} onPress={onPress}>
      <Text style={[styles.filterButtonText, { color: palette.text }]} numberOfLines={1}>{label}</Text>
      <ChevronDown size={14} color={palette.secondaryText} strokeWidth={1.8} />
    </Pressable>
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
  videoShell: {
    width: SCREEN_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: VIDEO_HEIGHT,
  },
  emptyVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyVideoText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  buffering: {
    position: 'absolute',
    alignSelf: 'center',
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  primaryButton: {
    minHeight: 38,
    paddingHorizontal: 20,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segment: {
    height: 38,
    borderRadius: 19,
    padding: 3,
    flexDirection: 'row',
  },
  segmentItem: {
    flex: 1,
    borderRadius: 16,
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
    borderRadius: 20,
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
    borderRadius: 18,
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
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  errorText: {
    paddingHorizontal: 24,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  channelRow: {
    minHeight: 52,
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  libraryText: {
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
  playingBadge: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  listContent: {
    paddingBottom: 136,
  },
});
