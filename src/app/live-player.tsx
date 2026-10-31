import { getIptvLibraryStreams, pickBestStream } from '@/services/iptv-library';
import { fetchIptvChannels, getCachedIptvChannels } from '@/services/iptv';
import type { IptvChannel } from '@/models/iptv';
import { useEvent } from 'expo';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ChevronLeft, List, Pause, Play, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function LivePlayerScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    kind?: string;
    url?: string;
    name?: string;
    channelId?: string;
    country?: string;
    sourceId?: string;
    sourceUrl?: string;
  }>();

  const kind = firstParam(params.kind);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(firstParam(params.url) ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerChannels, setDrawerChannels] = useState<IptvChannel[]>([]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const drawerX = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  const player = useVideoPlayer(null, () => {});
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    Animated.timing(drawerX, {
      toValue: drawerOpen ? 0 : DRAWER_WIDTH,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, drawerX]);

  useEffect(() => {
    if (kind !== 'm3u') return;
    const sourceId = Number(firstParam(params.sourceId));
    const sourceUrl = firstParam(params.sourceUrl);
    let cancelled = false;
    (async () => {
      try {
        let channels = sourceId ? await getCachedIptvChannels(db, sourceId) : null;
        if ((!channels || channels.length === 0) && sourceUrl) {
          channels = await fetchIptvChannels(sourceUrl);
        }
        if (!cancelled) setDrawerChannels(channels ?? []);
      } catch (error) {
        console.warn('[LivePlayer] Failed to load channel list:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, kind, params.sourceId, params.sourceUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg('');

    const prepare = async () => {
      try {
        if (kind === 'm3u') {
          const uri = firstParam(params.url) ?? '';
          if (!uri) throw new Error('缺少播放地址');
          if (cancelled) return;
          await player.replaceAsync({ uri });
          if (!cancelled) setCurrentUrl(uri);
        } else {
          const channelId = firstParam(params.channelId) ?? '';
          if (!channelId) throw new Error('缺少频道 ID');
          const streams = await getIptvLibraryStreams(db, channelId);
          const stream = pickBestStream(streams);
          if (!stream) throw new Error('该频道暂无可用播放源');

          const headers: Record<string, string> = {};
          if (stream.referrer) headers.Referer = stream.referrer;
          if (stream.userAgent) headers['User-Agent'] = stream.userAgent;

          if (cancelled) return;
          await player.replaceAsync(
            Object.keys(headers).length > 0
              ? { uri: stream.url, headers }
              : { uri: stream.url }
          );
          if (!cancelled) setCurrentUrl(stream.url);
        }

        if (!cancelled) {
          player.play();
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMsg(error instanceof Error ? error.message : '播放失败');
          setLoading(false);
        }
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [db, kind, params.channelId, params.name, params.url, player, retryNonce]);

  const showLoading = loading || (!isPlaying && status !== 'error' && !errorMsg);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const switchChannel = useCallback(async (channel: IptvChannel) => {
    setDrawerOpen(false);
    setErrorMsg('');
    try {
      await player.replaceAsync({ uri: channel.url });
      player.play();
      setCurrentUrl(channel.url);
    } catch (error) {
      console.warn('[LivePlayer] Failed to switch channel:', error);
      setErrorMsg(error instanceof Error ? error.message : '切换失败');
    }
  }, [player]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/tv');
    }
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {!errorMsg ? (
        <VideoView
          player={player}
          nativeControls={false}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <Pressable style={styles.tapOverlay} onPress={() => setControlsVisible((value) => !value)} />

      {showLoading && !errorMsg ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <DotsLoading />
          <Text style={styles.loadingText}>正在加载直播…</Text>
        </View>
      ) : null}

      {errorMsg ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable style={styles.retryButton} onPress={() => setRetryNonce((value) => value + 1)}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {controlsVisible ? (
        <Pressable
          style={[styles.backButton, { top: insets.top + 8 }]}
          onPress={handleBack}
          hitSlop={8}
          accessibilityLabel="返回">
          <ChevronLeft size={27} color="#fff" strokeWidth={2.15} />
        </Pressable>
      ) : null}

      {controlsVisible && kind === 'm3u' ? (
        <Pressable
          style={[styles.channelListButton, { top: insets.top + 8 }]}
          onPress={() => setDrawerOpen(true)}
          hitSlop={8}
          accessibilityLabel="频道列表">
          <List size={24} color="#fff" strokeWidth={2} />
        </Pressable>
      ) : null}

      {controlsVisible ? (
        <Pressable
          style={styles.playPauseButton}
          onPress={togglePlayback}
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
          hitSlop={10}>
          {isPlaying ? <Pause size={26} color="#fff" strokeWidth={2} /> : <Play size={26} color="#fff" strokeWidth={2} />}
        </Pressable>
      ) : null}

      {drawerOpen ? <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} /> : null}
      <Animated.View style={[styles.channelDrawer, { transform: [{ translateX: drawerX }] }]}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>频道列表</Text>
          <Pressable onPress={() => setDrawerOpen(false)} hitSlop={10}>
            <X size={20} color="#fff" strokeWidth={1.8} />
          </Pressable>
        </View>
        <FlatList
          data={drawerChannels}
          keyExtractor={(item) => item.url}
          renderItem={({ item }) => {
            const isActive = item.url === currentUrl;
            return (
              <Pressable
                style={[styles.drawerChannel, isActive && styles.drawerChannelActive]}
                onPress={() => switchChannel(item)}>
                <Text style={[styles.drawerChannelText, isActive && styles.drawerChannelTextActive]} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
    </View>
  );
}

function DotsLoading() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) => Animated.loop(
      Animated.sequence([
        Animated.delay(index * 140),
        Animated.timing(dot, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dot, {
          toValue: 0,
          duration: 260,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay((2 - index) * 140),
      ])
    ));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.dots}>
      {dots.map((dot, index) => (
        <Animated.View
          key={`live-dot-${index}`}
          style={[
            styles.dot,
            {
              opacity: dot.interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 1],
              }),
              transform: [{
                translateY: dot.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  tapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  dots: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 28,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 40,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  channelListButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  channelDrawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#111111',
  },
  drawerHeader: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  drawerTitle: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  drawerChannel: {
    minHeight: 48,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  drawerChannelActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  drawerChannelText: {
    color: '#FAFAFA',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  drawerChannelTextActive: {
    fontWeight: '800',
  },
  playPauseButton: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
});
