import { useIptv } from '@/context/iptv-context';
import { useThemeName } from '@/hooks/use-theme';
import type { IptvChannel } from '@/models/iptv';
import { getAppSetting, setAppSetting } from '@/services/database';
import { fetchIptvChannels } from '@/services/iptv';
import { groupIptvChannels } from '@/utils/iptv';
import { useEvent } from 'expo';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSQLiteContext } from 'expo-sqlite';
import { RefreshCw, Search, Tv, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable as RNPressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_HEIGHT = Math.min(SCREEN_WIDTH * 0.56, 300);

export default function TvScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { source } = useIptv();

  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<IptvChannel | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);

  const player = useVideoPlayer(null, () => {});
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });

  const loadChannels = useCallback(async () => {
    if (!source) {
      setChannels([]);
      setCurrent(null);
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
      setCurrent(restored);
    } catch (error) {
      if (requestRef.current !== requestId) return;
      console.warn('[TV] Failed to load IPTV channels:', error);
      setErrorMsg(error instanceof Error ? error.message : '直播源加载失败');
      setChannels([]);
      setCurrent(null);
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [db, source]);

  useEffect(() => {
    void loadChannels();
    return () => {
      requestRef.current += 1;
    };
  }, [loadChannels, refreshKey]);

  const playChannel = useCallback(async (channel: IptvChannel) => {
    setCurrent(channel);
    setErrorMsg('');
    try {
      await player.replaceAsync({ uri: channel.url });
      player.play();
      if (source) {
        await setAppSetting(db, `iptv.lastChannel.${source.id}`, channel.url);
      }
    } catch (error) {
      console.warn('[TV] Failed to play channel:', error);
      setErrorMsg(error instanceof Error ? error.message : '频道播放失败');
    }
  }, [db, player, source]);

  const filteredChannels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return channels;
    return channels.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [channels, query]);

  const sections = useMemo(
    () => groupIptvChannels(filteredChannels).map((group) => ({
      title: group.name,
      data: group.channels,
    })),
    [filteredChannels]
  );

  const goToSources = useCallback(() => {
    router.push('/live-sources');
  }, [router]);

  const renderChannel = useCallback(({ item }: { item: IptvChannel }) => {
    const isActive = current?.url === item.url;
    return (
      <RNPressable
        style={({ pressed }) => [
          styles.channelRow,
          { borderBottomColor: palette.border },
          isActive && { backgroundColor: palette.segmentBackground },
          pressed && { opacity: 0.6 },
        ]}
        onPress={() => playChannel(item)}>
        <Text
          style={[styles.channelName, { color: isActive ? palette.accent : palette.text }]}
          numberOfLines={1}>
          {item.name}
        </Text>
        {isActive ? <Text style={[styles.playingBadge, { color: palette.accent }]}>播放中</Text> : null}
      </RNPressable>
    );
  }, [current?.url, palette.accent, palette.border, palette.segmentBackground, palette.text, playChannel]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>电视</Text>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>
            {source ? source.name : '暂无直播源'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <RNPressable onPress={() => setRefreshKey((value) => value + 1)} hitSlop={8} style={styles.headerButton}>
            <RefreshCw size={18} color={palette.text} strokeWidth={1.8} />
          </RNPressable>
          <RNPressable onPress={goToSources} hitSlop={8} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, { color: palette.text }]}>换源</Text>
          </RNPressable>
        </View>
      </View>

      <View style={styles.videoShell}>
        {!source ? (
          <View style={styles.emptyVideo}>
            <WifiOff size={28} color={palette.secondaryText} strokeWidth={1.5} />
            <Text style={[styles.emptyVideoText, { color: palette.secondaryText }]}>请先添加直播源</Text>
            <RNPressable style={[styles.primaryButton, { backgroundColor: palette.text }]} onPress={goToSources}>
              <Text style={[styles.primaryButtonText, { color: palette.inverseText }]}>去添加</Text>
            </RNPressable>
          </View>
        ) : current ? (
          <VideoView
            player={player}
            nativeControls
            allowsPictureInPicture
            contentFit="contain"
            style={styles.video}
          />
        ) : (
          <View style={styles.emptyVideo}>
            <Tv size={28} color={palette.secondaryText} strokeWidth={1.5} />
            <Text style={[styles.emptyVideoText, { color: palette.secondaryText }]}>暂无频道</Text>
          </View>
        )}
        {status === 'loading' && current ? (
          <View style={styles.buffering} pointerEvents="none">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : null}
      </View>

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
          <RNPressable style={[styles.primaryButton, { backgroundColor: palette.text }]} onPress={() => setRefreshKey((value) => value + 1)}>
            <Text style={[styles.primaryButtonText, { color: palette.inverseText }]}>重试</Text>
          </RNPressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.url}
          renderItem={renderChannel}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { color: palette.secondaryText }]}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  channelName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
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
