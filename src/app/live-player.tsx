import { getIptvLibraryStreams, pickBestStream } from '@/services/iptv-library';
import { useEvent } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  }>();

  const kind = firstParam(params.kind);
  const [title, setTitle] = useState(firstParam(params.name) ?? '直播');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  const player = useVideoPlayer(null, () => {});
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg('');

    const prepare = async () => {
      try {
        if (kind === 'm3u') {
          const uri = firstParam(params.url) ?? '';
          if (!uri) throw new Error('缺少播放地址');
          setTitle(firstParam(params.name) ?? '直播');
          if (cancelled) return;
          await player.replaceAsync({ uri });
        } else {
          const channelId = firstParam(params.channelId) ?? '';
          if (!channelId) throw new Error('缺少频道 ID');
          const streams = await getIptvLibraryStreams(db, channelId);
          const stream = pickBestStream(streams);
          if (!stream) throw new Error('该频道暂无可用播放源');

          const headers: Record<string, string> = {};
          if (stream.referrer) headers.Referer = stream.referrer;
          if (stream.userAgent) headers['User-Agent'] = stream.userAgent;

          setTitle(stream.title || firstParam(params.name) || '直播');
          if (cancelled) return;
          await player.replaceAsync(
            Object.keys(headers).length > 0
              ? { uri: stream.url, headers }
              : { uri: stream.url }
          );
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

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/tv');
    }
  }, [router]);

  return (
    <View style={styles.container}>
      {!errorMsg ? (
        <VideoView
          player={player}
          nativeControls
          allowsPictureInPicture
          startsPictureInPictureAutomatically
          contentFit="contain"
          fullscreenOptions={{ enable: true, orientation: 'landscape' }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {loading && !errorMsg ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#fff" />
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

      <Pressable
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={handleBack}
        hitSlop={8}
        accessibilityLabel="返回">
        <ChevronLeft size={27} color="#fff" strokeWidth={2.15} />
      </Pressable>

      <View style={[styles.titleWrap, { bottom: insets.bottom + 18 }]} pointerEvents="none">
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  titleWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
});
