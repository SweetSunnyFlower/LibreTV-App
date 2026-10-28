import { EpisodeList, EPISODE_LIST_LAYOUT } from '@/components/movie/episode-list';
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
import { PlaybackCoordinator } from '@/services/playback-coordinator';
import { resolvePlaybackUrl, type PlaybackResolveResult } from '@/services/playback-resolver';
import { bufferPercentFor, buildBufferOptions } from '@/utils/playback';
import { useEvent } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoSource } from 'expo-video';
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

function createAbortError() {
  const error = new Error('播放请求已取消');
  error.name = 'AbortError';
  return error;
}

function readablePlaybackError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  const message = String(error);
  return message && message !== '[object Object]' ? message : '播放失败，请重试';
}

async function replaceVideoSourceAndWaitReady(
  player: VideoPlayer,
  source: VideoSource,
  signal: AbortSignal
) {
  if (signal.aborted) throw createAbortError();

  return new Promise<{ duration: number }>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      sourceSubscription.remove();
      statusSubscription.remove();
      signal.removeEventListener('abort', handleAbort);
      if (timer) clearTimeout(timer);
    };
    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ duration: Number.isFinite(duration) ? Math.max(0, duration) : 0 });
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => fail(createAbortError());

    const sourceSubscription = player.addListener('sourceLoad', ({ duration }) => {
      finish(duration);
    });
    const statusSubscription = player.addListener('statusChange', ({ status: nextStatus, error: nextError }) => {
      if (nextStatus === 'error') {
        fail(new Error(nextError?.message || '播放器加载失败'));
      }
    });

    signal.addEventListener('abort', handleAbort, { once: true });
    timer = setTimeout(() => {
      fail(new Error('播放加载超时，请重试'));
    }, 30000);

    player.replaceAsync(source).then(() => {
      const duration = Number(player.duration);
      if (duration > 0) finish(duration);
    }).catch(fail);
  });
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
        <SkeletonBlock style={[styles.skeletonMeta, { width: '42%' }]} />
        <SkeletonBlock style={[styles.skeletonMeta, { width: '72%' }]} />
        <View style={styles.skeletonInfoRow}>
          <SkeletonBlock style={styles.skeletonLabel} />
          <SkeletonBlock style={[styles.skeletonLine, { width: '48%' }]} />
        </View>
        <View style={styles.skeletonInfoRow}>
          <SkeletonBlock style={styles.skeletonLabel} />
          <View style={styles.skeletonValueGroup}>
            <SkeletonBlock style={styles.skeletonLine} />
            <SkeletonBlock style={[styles.skeletonLine, { width: '86%' }]} />
            <SkeletonBlock style={[styles.skeletonLine, { width: '58%' }]} />
          </View>
        </View>
        <View style={styles.skeletonInfoRow}>
          <SkeletonBlock style={styles.skeletonLabel} />
          <View style={styles.skeletonValueGroup}>
            <SkeletonBlock style={styles.skeletonLine} />
            <SkeletonBlock style={[styles.skeletonLine, { width: '75%' }]} />
          </View>
        </View>
      </View>
      <View style={styles.skeletonEpisodeSection}>
        <View style={styles.skeletonEpisodeHeader}>
          <SkeletonBlock style={styles.skeletonEpisodeTitle} />
          <SkeletonBlock style={styles.skeletonEpisodeMeta} />
        </View>
        <View style={styles.skeletonEpisodeGrid}>
          {Array.from({ length: 9 }, (_, index) => (
            <View key={`player-info-skeleton-${index}`} style={styles.skeletonEpisodeCell}>
              <SkeletonBlock style={styles.skeletonEpisode} />
            </View>
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
    sourceIndex?: string;
    autoPlay?: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const dialog = useAppDialog();
  const { startDownload } = useDownloads();
  const { addWatchHistory, updateWatchHistoryProgress, isFavorite, toggleFavorite } = useUserData();
  const rawUrl = firstParam(params.url) ?? '';
  const title = firstParam(params.title) ?? firstParam(params.vodName) ?? '正在播放';
  const vodId = firstParam(params.vodId);
  const siteUrl = firstParam(params.siteUrl);
  const detailUrl = firstParam(params.detailUrl) || siteUrl;
  const episodeName = firstParam(params.episodeName);
  const sourceName = firstParam(params.sourceName);
  const sourceIndex = firstParam(params.sourceIndex);
  const autoPlayParam = firstParam(params.autoPlay);
  const vodNameParam = firstParam(params.vodName);
  const fallbackTitle = title.replace(/\s+-\s+$/, '').trim() || '正在播放';

  const [detail, setDetail] = useState<VodDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<PlaybackResolveResult | null>(null);
  const [resolveError, setResolveError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
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
  const detailRef = useRef<VodDetail | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const recordProgressEnabledRef = useRef(true);
  const playbackContextRef = useRef({
    rawUrl,
    siteUrl,
    detailUrl,
    sourceName,
    title,
  });
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });
  const { currentTime, bufferedPosition } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.bufferedPosition,
  });

  useEffect(() => {
    playbackContextRef.current = { rawUrl, siteUrl, detailUrl, sourceName, title };
    detailRef.current = detail;
  }, [detail, detailUrl, rawUrl, siteUrl, sourceName, title]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
    durationRef.current = player.duration || mediaDuration;
  }, [currentTime, mediaDuration, player.duration]);

  useEffect(() => {
    player.timeUpdateEventInterval = 1;
    player.bufferOptions = buildBufferOptions(Platform.OS);
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting(db, PLAYER_AUTO_PLAY_SETTING_KEY),
      getAppSetting(db, PLAYER_AUTO_NEXT_EPISODE_SETTING_KEY),
      getAppSetting(db, PLAYER_RECORD_PROGRESS_SETTING_KEY),
    ])
      .then(([autoPlayValue, autoNextEpisodeValue, recordProgressValue]) => {
        if (cancelled) return;
        const nextAutoPlay = settingToBoolean(autoPlayValue, true);
        const nextRecordProgress = settingToBoolean(recordProgressValue, true);
        setAutoPlayEnabled(nextAutoPlay);
        setAutoNextEpisodeEnabled(settingToBoolean(autoNextEpisodeValue, true));
        setRecordProgressEnabled(nextRecordProgress);
        recordProgressEnabledRef.current = nextRecordProgress;
      })
      .catch((error) => {
        console.warn('[Player] Failed to load playback settings, using defaults:', error);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const coordinator = useMemo(() => new PlaybackCoordinator({
    resolve: async (url, signal) => {
      if (signal.aborted) throw createAbortError();
      const context = playbackContextRef.current;
      return resolvePlaybackUrl({
        url,
        siteUrl: context.siteUrl,
        detailUrl: context.detailUrl,
        sourceName: context.sourceName,
        title: context.title,
        signal,
      });
    },
    adapter: {
      pause: () => player.pause(),
      replaceAndWaitReady: (source, signal) => replaceVideoSourceAndWaitReady(player, source, signal),
      seek: (positionSeconds) => {
        player.currentTime = positionSeconds;
      },
      play: () => player.play(),
    },
    loadProgress: async (url) => {
      if (!recordProgressEnabledRef.current) return null;
      const progressValue = await getAppSetting(db, playbackProgressSettingKey(url));
      const positionSeconds = progressValue ? Number(progressValue) : NaN;
      return Number.isFinite(positionSeconds)
        ? { positionSeconds, durationSeconds: 0 }
        : null;
    },
    saveProgress: async (url, positionSeconds, durationSeconds, watchHistoryId) => {
      if (!recordProgressEnabledRef.current) return;
      await Promise.all([
        setAppSetting(db, playbackProgressSettingKey(url), String(Math.floor(positionSeconds))),
        watchHistoryId
          ? updateWatchHistoryProgress(
              watchHistoryId,
              Math.round(positionSeconds * 1000),
              Math.round(durationSeconds * 1000)
            )
          : Promise.resolve(),
      ]);
    },
    recordStarted: async (result) => {
      const context = playbackContextRef.current;
      const currentDetail = detailRef.current;
      return addWatchHistory({
        siteUrl: context.siteUrl ?? '',
        detailUrl: context.detailUrl ?? '',
        vodId: vodId ? Number(vodId) : null,
        vodName: vodNameParam ?? currentDetail?.vod_name ?? fallbackTitle,
        vodPic: currentDetail?.vod_pic ?? '',
        episodeName: episodeName ?? '',
        sourceName: context.sourceName ?? '',
        sourceIndex: sourceIndex ? Number(sourceIndex) : null,
        episodeUrl: context.rawUrl,
        playableUrl: result.playableUrl,
      });
    },
  }), [addWatchHistory, db, episodeName, fallbackTitle, player, sourceIndex, updateWatchHistoryProgress, vodId, vodNameParam]);

  const flushPlaybackProgress = useCallback(async () => {
    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
      progressSaveTimerRef.current = null;
    }
    await coordinator.flush(currentTimeRef.current, durationRef.current);
  }, [coordinator]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (!rawUrl) {
      setResolving(false);
      setResolveError('播放地址为空');
      return;
    }

    let active = true;
    lastResolveAlertRef.current = '';
    lastPlayerAlertRef.current = '';
    setResolveError('');
    setResolveResult(null);
    setMediaDuration(0);
    setResolving(true);

    void coordinator.start({
      url: rawUrl,
      autoPlay: autoPlayEnabled || autoPlayParam === '1',
    }).then((result) => {
      if (!active || result.status === 'cancelled') return;
      setResolving(false);
      if (result.status === 'error') {
        setResolveError(readablePlaybackError(result.error));
        return;
      }
      console.log('[Player] Resolved source:', {
        kind: result.result.kind,
        playableUrl: result.result.playableUrl,
        diagnostics: result.result.diagnostics,
      });
      setMediaDuration(player.duration || durationRef.current);
      setResolveResult(result.result);
    });

    return () => {
      active = false;
      void flushPlaybackProgress();
      coordinator.cancel();
    };
  }, [
    autoPlayEnabled,
    autoPlayParam,
    coordinator,
    flushPlaybackProgress,
    rawUrl,
    retryNonce,
    settingsLoaded,
  ]);

  const buffering = resolving || status === 'loading';
  const realBufferPercent = bufferPercentFor(bufferedPosition, durationRef.current);

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
    if (!recordProgressEnabled || currentTime <= 3) {
      if (progressSaveTimerRef.current) {
        clearTimeout(progressSaveTimerRef.current);
        progressSaveTimerRef.current = null;
      }
      return;
    }
    if (progressSaveTimerRef.current) return;

    progressSaveTimerRef.current = setTimeout(() => {
      progressSaveTimerRef.current = null;
      void coordinator.flush(currentTimeRef.current, durationRef.current);
    }, 2000);
  }, [coordinator, currentTime, recordProgressEnabled]);

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
    if (resolving || status !== 'error') return;
    const message = playbackErrorMessage(error?.message);
    if (lastPlayerAlertRef.current === message) return;
    lastPlayerAlertRef.current = message;
    void dialog.alert('播放出错', message);
  }, [dialog, error?.message, resolving, status]);

  useEffect(() => {
    let cancelled = false;
    if (!vodId || !siteUrl) {
      setDetail(null);
      setEpisodes([]);
      setLoadingDetail(false);
      return;
    }

    setLoadingDetail(true);
    fetchVodDetail(siteUrl, Number(vodId))
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setEpisodes(data ? parseEpisodes(data.vod_play_url, data.vod_play_from, detailUrl) : []);
        }
      })
      .catch((error) => {
        console.warn('[Player] Failed to load Vod detail:', error);
        if (!cancelled) {
          setDetail(null);
          setEpisodes([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailUrl, siteUrl, vodId]);

  const hlsOnWeb = Platform.OS === 'web' && resolveResult?.kind === 'hls';
  const shouldShowDiagnostic = !!resolveError || status === 'error' || hlsOnWeb;
  const activeEpisode = useMemo(() => {
    return episodes.find((episode) => {
      if (episode.url === rawUrl) return true;
      if (episode.name !== episodeName) return false;
      if (sourceIndex && String(episode.sourceIndex ?? 0) !== sourceIndex) return false;
      return !sourceName || episode.source === sourceName;
    }) ?? null;
  }, [episodes, rawUrl, episodeName, sourceIndex, sourceName]);
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

    player.pause();
    await flushPlaybackProgress();
    coordinator.cancel();
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
        sourceIndex: String(episode.sourceIndex ?? 0),
        autoPlay: '1',
      },
    });
  }, [coordinator, detail, detailUrl, fallbackTitle, flushPlaybackProgress, player, rawUrl, router, saveVideoHeight, siteUrl, vodId, vodNameParam]);

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
    player.pause();
    void flushPlaybackProgress();
    coordinator.cancel();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [coordinator, flushPlaybackProgress, player, router]);

  const handleRetry = useCallback(() => {
    player.pause();
    void flushPlaybackProgress();
    coordinator.cancel();
    setRetryNonce((value) => value + 1);
  }, [coordinator, flushPlaybackProgress, player]);

  const playerTitleActions = (
    <View style={styles.playerActionRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favoriteActive ? '取消收藏' : '收藏'}
        style={styles.playerActionButton}
        onPress={handleToggleFavorite}
        disabled={!detail || !siteUrl}
        hitSlop={8}>
        <Heart size={20} color={colors.text} fill={favoriteActive ? colors.text : 'transparent'} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="下载当前剧集"
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
          <View style={[styles.videoState, { height: videoHeight }]}>
            <ThemedText type="defaultSemiBold" style={styles.videoMessage}>
              正在解析播放地址
            </ThemedText>
          </View>
        ) : resolveError || status === 'error' ? (
          <View style={[styles.videoState, { height: videoHeight }]}>
            <ThemedText type="defaultSemiBold" style={styles.videoMessage}>
              播放失败
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重试播放"
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              onPress={handleRetry}>
              <ThemedText type="smallBold" style={styles.videoMessage}>重试</ThemedText>
            </Pressable>
          </View>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={[styles.overlayBackButton, { top: insets.top + Spacing.two }]}
          onPress={handleBack}
          hitSlop={8}>
          <ChevronLeft size={26} color="#fff" strokeWidth={2.4} />
        </Pressable>


        {buffering ? (
          <View style={styles.bufferingBadge}>
            <ThemedText type="smallBold" style={styles.bufferingText}>
              {resolving
                ? '解析中'
                : realBufferPercent === null
                  ? '缓冲中'
                  : `缓冲中 ${realBufferPercent}%`}
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#000',
  },
  videoMessage: {
    color: '#fff',
  },
  retryButton: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  retryButtonPressed: {
    opacity: 0.64,
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
    height: 12,
    opacity: 0.72,
  },
  skeletonInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  skeletonLabel: {
    width: 34,
    height: 12,
    opacity: 0.72,
  },
  skeletonValueGroup: {
    flex: 1,
    gap: 6,
  },
  skeletonLine: {
    width: '100%',
    height: 12,
    opacity: 0.64,
  },
  skeletonEpisodeSection: {
    marginTop: EPISODE_LIST_LAYOUT.marginTop,
    gap: EPISODE_LIST_LAYOUT.sectionGap,
  },
  skeletonEpisodeHeader: {
    paddingHorizontal: EPISODE_LIST_LAYOUT.horizontalPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skeletonEpisodeTitle: {
    width: 72,
    height: 22,
  },
  skeletonEpisodeMeta: {
    width: 104,
    height: 16,
  },
  skeletonEpisodeGrid: {
    paddingHorizontal: EPISODE_LIST_LAYOUT.horizontalPadding,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: EPISODE_LIST_LAYOUT.gap,
    columnGap: EPISODE_LIST_LAYOUT.gap,
  },
  skeletonEpisodeCell: {
    width: EPISODE_LIST_LAYOUT.itemWidth,
  },
  skeletonEpisode: {
    width: '100%',
    height: EPISODE_LIST_LAYOUT.buttonHeight,
    opacity: 0.72,
  },
});
