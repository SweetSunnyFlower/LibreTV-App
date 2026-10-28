import { EpisodeList } from '@/components/movie/episode-list';
import { SkeletonBlock, SkeletonGroup } from '@/components/skeletons/skeleton';
import { VodInfoSection } from '@/components/movie/vod-info-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PLAYER_AUTO_NEXT_EPISODE_SETTING_KEY, PLAYER_AUTO_PLAY_SETTING_KEY, PLAYER_HEIGHT_SETTING_KEY, PLAYER_RECORD_PROGRESS_SETTING_KEY } from '@/constants/app-settings';
import { Spacing } from '@/constants/theme';
import { useAppDialog } from '@/context/app-dialog-context';
import { useDownloads } from '@/context/download-context';
import { useUserData } from '@/context/user-data-context';
import { useTheme } from '@/hooks/use-theme';
import type { Episode, VodDetail } from '@/models/vod';
import { fetchVodDetail, parseEpisodes } from '@/services/cms-api';
import { getAppSetting, setAppSetting } from '@/services/database';
import { resolvePlaybackUrl, type PlaybackResolveResult } from '@/services/playback-resolver';
import { useEvent } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { ChevronLeft, ChevronRight, Download, Heart } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function playbackErrorMessage(message?: string) {
  const text = message ?? '当前地址无法播放或被站点限制。';
  if (/\b403\b|forbidden/i.test(text)) {
    return '播放地址被资源站拒绝访问（403），通常是防盗链或地址已过期。请点重试重新解析，或切换播放线路/资源站。';
  }
  return `播放器错误：${text}`;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_VIDEO_HEIGHT = Math.min(SCREEN_WIDTH * 0.56, 360);
const MIN_VIDEO_HEIGHT = Math.max(120, DEFAULT_VIDEO_HEIGHT);
const MAX_VIDEO_HEIGHT = SCREEN_HEIGHT * 0.8;

function clampVideoHeight(height: number) {
  return Math.min(MAX_VIDEO_HEIGHT, Math.max(MIN_VIDEO_HEIGHT, height));
}

function settingToBoolean(value: string | null, fallback: boolean) {
  if (value === '1') return true;
  if (value === '0') return false;
  return fallback;
}

function playbackProgressSettingKey(rawUrl: string) {
  return `player.progress.${rawUrl}`;
}

function PlayerInfoSkeleton() {
  return (
    <SkeletonGroup>
      <View style={styles.infoSkeleton}>
        <View style={styles.skeletonTitleRow}>
          <SkeletonBlock style={styles.skeletonTitle} />
          <SkeletonBlock style={styles.skeletonAction} />
          <SkeletonBlock style={styles.skeletonAction} />
        </View>
        <SkeletonBlock style={styles.skeletonMeta} />
        <View style={styles.skeletonDescription}>
          <SkeletonBlock style={styles.skeletonLine} />
          <SkeletonBlock style={[styles.skeletonLine, { width: '88%' }]} />
          <SkeletonBlock style={[styles.skeletonLine, { width: '62%' }]} />
        </View>
        <View style={styles.skeletonEpisodeGrid}>
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonBlock key={`player-info-skeleton-${index}`} style={styles.skeletonEpisode} />
          ))}
        </View>
      </View>
    </SkeletonGroup>
  );
}

export default function PlayerScreen() {
  const params = useLocalSearchParams<{
    url: string;
    title?: string;
    vodId?: string;
    siteUrl?: string;
    detailUrl?: string;
    episodeName?: string;
    vodName?: string;
    sourceName?: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const dialog = useAppDialog();
  const { startDownload } = useDownloads();
  const { addWatchHistory, isFavorite, toggleFavorite } = useUserData();
  const rawUrl = firstParam(params.url) ?? '';
  const title = firstParam(params.title) ?? firstParam(params.vodName) ?? '正在播放';
  const vodId = firstParam(params.vodId);
  const siteUrl = firstParam(params.siteUrl);
  const detailUrl = firstParam(params.detailUrl) || siteUrl;
  const episodeName = firstParam(params.episodeName);
  const sourceName = firstParam(params.sourceName);
  const vodNameParam = firstParam(params.vodName);
  const fallbackTitle = title.replace(/\s+-\s+$/, '').trim() || '正在播放';

  const [detail, setDetail] = useState<VodDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<PlaybackResolveResult | null>(null);
  const [resolveError, setResolveError] = useState('');
  const [fakeBufferPercent, setFakeBufferPercent] = useState(0);
  const [episodeNavVisible, setEpisodeNavVisible] = useState(true);
  const [videoHeight, setVideoHeight] = useState(DEFAULT_VIDEO_HEIGHT);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [autoNextEpisodeEnabled, setAutoNextEpisodeEnabled] = useState(true);
  const [recordProgressEnabled, setRecordProgressEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const player = useVideoPlayer(null as VideoSource, () => { });
  const progressSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const episodeNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoHeightRef = useRef(DEFAULT_VIDEO_HEIGHT);
  const dragStartHeightRef = useRef(DEFAULT_VIDEO_HEIGHT);
  const lastResolveAlertRef = useRef('');
  const lastPlayerAlertRef = useRef('');
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.bufferedPosition,
  });

  useEffect(() => {
    player.timeUpdateEventInterval = 1;
    player.bufferOptions = {
      minBufferForPlayback: 10, // 开始播放前至少缓冲多久
      preferredForwardBufferDuration: 600, // 指定播放器希望向前缓冲多少秒
      maxBufferBytes: 200 * 1024 * 1024,
    };
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting(db, PLAYER_AUTO_PLAY_SETTING_KEY),
      getAppSetting(db, PLAYER_AUTO_NEXT_EPISODE_SETTING_KEY),
      getAppSetting(db, PLAYER_RECORD_PROGRESS_SETTING_KEY),
    ]).then(([autoPlayValue, autoNextEpisodeValue, recordProgressValue]) => {
      if (cancelled) return;
      setAutoPlayEnabled(settingToBoolean(autoPlayValue, true));
      setAutoNextEpisodeEnabled(settingToBoolean(autoNextEpisodeValue, true));
      setRecordProgressEnabled(settingToBoolean(recordProgressValue, true));
      setSettingsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const resolveAndPlay = useCallback(async () => {
    setResolveError('');
    setResolving(true);
    try {
      const result = await resolvePlaybackUrl({
        url: rawUrl,
        siteUrl,
        detailUrl,
        sourceName,
        title,
      });
      setResolveResult(result);
      if (!result.source || result.error) {
        setResolveError(result.error || '无法解析播放地址');
        await player.replaceAsync(null);
        return;
      }
      console.log('[Player] Resolved source:', {
        kind: result.kind,
        playableUrl: result.playableUrl,
        diagnostics: result.diagnostics,
      });
      await player.replaceAsync(result.source);
      if (recordProgressEnabled) {
        const progressValue = await getAppSetting(db, playbackProgressSettingKey(rawUrl));
        const progressSeconds = progressValue ? Number(progressValue) : NaN;
        if (Number.isFinite(progressSeconds) && progressSeconds > 3) {
          player.currentTime = progressSeconds;
        }
      }
      await addWatchHistory({
        siteUrl: siteUrl ?? '',
        detailUrl: detailUrl ?? '',
        vodId: vodId ? Number(vodId) : null,
        vodName: vodNameParam ?? detail?.vod_name ?? fallbackTitle,
        vodPic: detail?.vod_pic ?? '',
        episodeName: episodeName ?? '',
        sourceName: sourceName ?? '',
        episodeUrl: rawUrl,
        playableUrl: result.playableUrl,
      });
      if (autoPlayEnabled) {
        player.play();
      }
    } catch (err) {
      console.error('[Player] Resolve failed:', err);
      setResolveError(String(err));
    } finally {
      setResolving(false);
    }
  }, [rawUrl, siteUrl, detailUrl, sourceName, title, player, addWatchHistory, vodId, vodNameParam, detail, fallbackTitle, episodeName, autoPlayEnabled, recordProgressEnabled, db]);

  useEffect(() => {
    if (settingsLoaded) {
      resolveAndPlay();
    }
  }, [settingsLoaded, resolveAndPlay]);

  const buffering = resolving || status === 'loading';

  const updateVideoHeight = useCallback((height: number) => {
    const nextHeight = clampVideoHeight(height);
    videoHeightRef.current = nextHeight;
    setVideoHeight(nextHeight);
  }, []);

  const saveVideoHeight = useCallback(async () => {
    await setAppSetting(db, PLAYER_HEIGHT_SETTING_KEY, String(Math.round(videoHeightRef.current)));
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(db, PLAYER_HEIGHT_SETTING_KEY).then((value) => {
      const storedHeight = value ? Number(value) : NaN;
      if (!cancelled && Number.isFinite(storedHeight)) {
        updateVideoHeight(storedHeight);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, updateVideoHeight]);

  const showEpisodeNavTemporarily = useCallback(() => {
    setEpisodeNavVisible(true);
    if (episodeNavTimerRef.current) {
      clearTimeout(episodeNavTimerRef.current);
    }
    episodeNavTimerRef.current = setTimeout(() => {
      setEpisodeNavVisible(false);
      episodeNavTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (episodeNavTimerRef.current) {
        clearTimeout(episodeNavTimerRef.current);
      }
      if (progressSaveTimerRef.current) {
        clearTimeout(progressSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!recordProgressEnabled || currentTime <= 3) return;
    if (progressSaveTimerRef.current) return;

    progressSaveTimerRef.current = setTimeout(() => {
      progressSaveTimerRef.current = null;
      void setAppSetting(db, playbackProgressSettingKey(rawUrl), String(Math.floor(currentTime)));
    }, 1000);
  }, [currentTime, db, rawUrl, recordProgressEnabled]);

  const resizePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => {
      dragStartHeightRef.current = videoHeightRef.current;
    },
    onPanResponderMove: (_, gestureState) => {
      updateVideoHeight(dragStartHeightRef.current + gestureState.dy);
    },
    onPanResponderRelease: () => {
      void saveVideoHeight();
    },
    onPanResponderTerminate: () => {
      void saveVideoHeight();
    },
  }), [saveVideoHeight, updateVideoHeight]);

  useEffect(() => {
    if (!buffering) {
      setFakeBufferPercent(0);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setFakeBufferPercent(Math.min(99.99, Math.floor((elapsed / 6000) * 99.99)));
    }, 100);

    return () => clearInterval(timer);
  }, [buffering]);

  useEffect(() => {
    if (!buffering) {
      loadingProgress.stopAnimation();
      loadingProgress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(loadingProgress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [buffering, loadingProgress]);

  useEffect(() => {
    if (!resolveError || lastResolveAlertRef.current === resolveError) return;
    lastResolveAlertRef.current = resolveError;
    void dialog.alert('播放出错', resolveError);
  }, [dialog, resolveError]);

  useEffect(() => {
    if (status !== 'error') return;
    const message = playbackErrorMessage(error?.message);
    if (lastPlayerAlertRef.current === message) return;
    lastPlayerAlertRef.current = message;
    void dialog.alert('播放出错', message);
  }, [dialog, status, error?.message]);

  useEffect(() => {
    let cancelled = false;
    if (!vodId || !siteUrl) {
      setDetail(null);
      setEpisodes([]);
      return;
    }

    setLoadingDetail(true);
    fetchVodDetail(siteUrl, Number(vodId)).then((data) => {
      if (!cancelled) {
        setDetail(data);
        setEpisodes(data ? parseEpisodes(data.vod_play_url, data.vod_play_from, detailUrl) : []);
        setLoadingDetail(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [vodId, siteUrl]);

  const hlsOnWeb = Platform.OS === 'web' && resolveResult?.kind === 'hls';
  const shouldShowDiagnostic = !!resolveError || status === 'error' || hlsOnWeb;
  const activeEpisode = useMemo(() => {
    return episodes.find((episode) => {
      return episode.url === rawUrl || (
        episode.name === episodeName &&
        (!sourceName || episode.source === sourceName)
      );
    }) ?? null;
  }, [episodes, rawUrl, episodeName, sourceName]);
  const currentSourceEpisodes = useMemo(() => {
    if (!activeEpisode) return [];
    return episodes.filter((episode) => episode.sourceIndex === activeEpisode.sourceIndex);
  }, [activeEpisode, episodes]);
  const currentEpisodeIndex = useMemo(() => {
    if (!activeEpisode) return -1;
    return currentSourceEpisodes.findIndex((episode) => episode.url === activeEpisode.url);
  }, [activeEpisode, currentSourceEpisodes]);
  const previousEpisode = currentEpisodeIndex > 0 ? currentSourceEpisodes[currentEpisodeIndex - 1] : null;
  const nextEpisode = currentEpisodeIndex >= 0 && currentEpisodeIndex < currentSourceEpisodes.length - 1
    ? currentSourceEpisodes[currentEpisodeIndex + 1]
    : null;
  const showEpisodeNav = currentSourceEpisodes.length > 1;

  useEffect(() => {
    if (showEpisodeNav) {
      showEpisodeNavTemporarily();
    } else {
      setEpisodeNavVisible(false);
    }
  }, [showEpisodeNav, activeEpisode?.url, showEpisodeNavTemporarily]);

  const handlePlayEpisode = useCallback(async (episode: Episode) => {
    if (episode.url === rawUrl) return;

    await saveVideoHeight();
    router.replace({
      pathname: '/player',
      params: {
        url: episode.url,
        title: `${detail?.vod_name ?? fallbackTitle} - ${episode.name}`,
        vodId: vodId ?? '',
        siteUrl: siteUrl ?? '',
        detailUrl: detailUrl ?? '',
        episodeName: episode.name,
        vodName: detail?.vod_name ?? vodNameParam ?? fallbackTitle,
        sourceName: episode.source ?? '',
      },
    });
  }, [router, detail, fallbackTitle, vodId, siteUrl, detailUrl, vodNameParam, rawUrl, saveVideoHeight]);

  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      if (autoNextEpisodeEnabled && nextEpisode) {
        void handlePlayEpisode(nextEpisode);
      }
    });
    return () => subscription.remove();
  }, [autoNextEpisodeEnabled, handlePlayEpisode, nextEpisode, player]);

  const handleDownloadEpisode = useCallback((vodName: string, episode: Episode) => {
    startDownload(vodName, episode.name, episode.url, {
      siteUrl,
      detailUrl,
      sourceName: episode.source,
    });
  }, [startDownload, siteUrl, detailUrl]);

  const handleDownloadCurrent = useCallback(() => {
    const episode = activeEpisode ?? {
      name: episodeName ?? '当前播放',
      url: rawUrl,
      source: sourceName,
    };
    if (!episode.url) {
      void dialog.alert('无法下载', '当前播放地址为空。');
      return;
    }
    startDownload(detail?.vod_name ?? vodNameParam ?? fallbackTitle, episode.name, episode.url, {
      siteUrl,
      detailUrl,
      sourceName: episode.source,
    });
  }, [activeEpisode, detail?.vod_name, detailUrl, dialog, episodeName, fallbackTitle, rawUrl, siteUrl, sourceName, startDownload, vodNameParam]);

  const handleToggleFavorite = useCallback(() => {
    if (!detail || !siteUrl) {
      void dialog.alert('暂时无法收藏', '影片信息还未加载完成。');
      return;
    }
    toggleFavorite({
      siteUrl,
      detailUrl: detailUrl ?? siteUrl,
      vodId: detail.vod_id,
      vodName: detail.vod_name,
      vodPic: detail.vod_pic,
      vodYear: detail.vod_year,
      vodArea: detail.vod_area,
      vodRemarks: detail.vod_remarks,
      typeName: detail.type_name,
    });
  }, [detail, detailUrl, dialog, siteUrl, toggleFavorite]);

  const favoriteActive = detail && siteUrl ? isFavorite(siteUrl, detail.vod_id) : false;

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const playerTitleActions = (
    <View style={styles.playerActionRow}>
      <Pressable
        style={styles.playerActionButton}
        onPress={handleToggleFavorite}
        disabled={!detail || !siteUrl}
        hitSlop={8}>
        <Heart size={20} color={colors.text} fill={favoriteActive ? colors.text : 'transparent'} />
      </Pressable>
      <Pressable
        style={styles.playerActionButton}
        onPress={handleDownloadCurrent}
        disabled={!rawUrl}
        hitSlop={8}>
        <Download size={20} color={colors.text} />
      </Pressable>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View
        style={[styles.videoShell, { height: videoHeight + insets.top, paddingTop: insets.top }]}
        onTouchStart={showEpisodeNav ? showEpisodeNavTemporarily : undefined}>
        {resolving ? (
          <View style={styles.videoState}>
            {/* <ActivityIndicator color="#fff" />
            <ThemedText type="defaultSemiBold" style={styles.videoMessage}>
              
            </ThemedText> */}
          </View>
        ) : resolveError ? (
          <View style={styles.videoState} />
        ) : (
          <VideoView
            player={player}
            nativeControls={true}
            buttonOptions={{ showPrevious: false, showNext: false }}
            allowsPictureInPicture={true}
            startsPictureInPictureAutomatically={true}
            contentFit="contain"
            fullscreenOptions={{ enable: true, orientation: 'landscape' }}
            style={[styles.video, { height: videoHeight }]}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.64)', 'rgba(0,0,0,0)']}
          style={styles.videoOverlay}
          pointerEvents="none"
        />
        {/* <TouchableOpacity
            style={[styles.overlayBackButton, { top: insets.top + Spacing.two }]}
            onPress={handleBack}
            activeOpacity={0.78}>
            <ChevronLeft size={26} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
           */}


        {buffering ? (
          <View style={styles.bufferingBadge}>
            {/* <ActivityIndicator size="small" color="#fff" /> */}
            <ThemedText type="smallBold" style={styles.bufferingText}>
              缓冲中 {fakeBufferPercent}%
            </ThemedText>
          </View>
        ) : null}


        {buffering ? (
          <View style={[styles.bufferingTrack, { backgroundColor: colors.progressTrack }]}>
            <Animated.View
              style={[
                styles.bufferingBar,
                {
                  backgroundColor: colors.text,
                  transform: [
                    {
                      translateX: loadingProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-SCREEN_WIDTH * 0.35, SCREEN_WIDTH],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.playbackControlBar}>
        <Pressable
          style={[styles.episodeNavButton, !previousEpisode && styles.episodeNavButtonDisabled]}
          onPress={() => {
            showEpisodeNavTemporarily();
            if (previousEpisode) void handlePlayEpisode(previousEpisode);
          }}
          disabled={!previousEpisode}
          hitSlop={8}>
          <ChevronLeft size={18} color={colors.text} />
          <ThemedText type="smallBold" themeColor="text">上一集</ThemedText>
        </Pressable>

        <View style={styles.resizeHandleWrap} {...resizePanResponder.panHandlers}>
          <View style={[styles.resizeHandleBar, { backgroundColor: colors.text }]} />
        </View>

        <Pressable
          style={[styles.episodeNavButton, !nextEpisode && styles.episodeNavButtonDisabled]}
          onPress={() => {
            showEpisodeNavTemporarily();
            if (nextEpisode) void handlePlayEpisode(nextEpisode);
          }}
          disabled={!nextEpisode}
          hitSlop={8}>
          <ThemedText type="smallBold" themeColor="text">下一集</ThemedText>
          <ChevronRight size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.contentScroll}>
        {shouldShowDiagnostic ? (
          <View style={[styles.diagnosticBox, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="accent">
              播放提示
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {resolveError
                ? `${resolveError}${resolveResult?.normalizedUrl ? `\n地址：${resolveResult.normalizedUrl}` : ''}`
                : status === 'error'
                  ? playbackErrorMessage(error?.message)
                  : '当前地址是 HLS/m3u8，部分浏览器无法直接播放。建议在 iOS/Android 真机或 Safari 中测试。'}
            </ThemedText>
          </View>
        ) : null}
        {loadingDetail ? (
          <PlayerInfoSkeleton />
        ) : (
          <VodInfoSection
            detail={detail}
            fallbackTitle={fallbackTitle}
            episodeName={episodeName}
            compact
            right={playerTitleActions}
          />
        )}
        {episodes.length > 0 ? (
          <EpisodeList
            episodes={episodes}
            vodName={detail?.vod_name ?? vodNameParam ?? fallbackTitle}
            activeEpisode={activeEpisode}
            onPlay={handlePlayEpisode}
            onDownload={handleDownloadEpisode}
          />
        ) : null}

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  videoShell: {
    width: '100%',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  video: {
    width: SCREEN_WIDTH,
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 112,
    zIndex: 2,
  },
  overlayBackButton: {
    position: 'absolute',
    left: Spacing.three,
    zIndex: 3,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bufferingBadge: {
    position: 'absolute',
    left: '50%',
    top: '62%',
    zIndex: 4,
    transform: [{ translateX: -54 }, { translateY: -20 }],
    minWidth: 108,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    // backgroundColor: 'rgba(0,0,0,0.58)',
  },
  bufferingText: {
    color: '#fff',
  },
  playbackControlBar: {
    minHeight: 42,
    // paddingHorizontal: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  episodeNavButton: {
    minWidth: 86,
    minHeight: 34,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  episodeNavButtonDisabled: {
    opacity: 0.36,
  },
  resizeHandleWrap: {
    height: 34,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandleBar: {
    width: 34,
    height: 5,
    borderRadius: 3,
    opacity: 0.72,
  },
  playerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  playerActionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bufferingTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  bufferingBar: {
    width: '25%',
    height: '100%',
    backgroundColor: '#fff',
  },
  videoState: {
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#000',
  },
  videoMessage: {
    color: '#fff',
  },
  diagnosticBox: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  infoSkeleton: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  skeletonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  skeletonTitle: {
    flex: 1,
    height: 24,
    opacity: 0.9,
  },
  skeletonAction: {
    width: 32,
    height: 32,
    opacity: 0.72,
  },
  skeletonMeta: {
    width: '64%',
    height: 14,
    opacity: 0.72,
  },
  skeletonDescription: {
    gap: Spacing.two,
  },
  skeletonLine: {
    width: '100%',
    height: 12,
    opacity: 0.64,
  },
  skeletonEpisodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  skeletonEpisode: {
    width: (SCREEN_WIDTH - Spacing.three * 2 - Spacing.two * 3) / 4,
    height: 38,
    opacity: 0.72,
  },
});
