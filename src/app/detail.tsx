import { AppImage } from '@/components/app-image';
import { EpisodeList } from '@/components/movie/episode-list';
import { SkeletonBlock, SkeletonGroup } from '@/components/skeletons/skeleton';
import { VodInfoSection } from '@/components/movie/vod-info-section';
import { ScreenHeader } from '@/components/screen-header';
import { useDownloads } from '@/context/download-context';
import { useSite } from '@/context/site-context';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { Episode, VodDetail } from '@/models/vod';
import { fetchVodDetail, parseEpisodes } from '@/services/cms-api';
import { CMS_IMAGE_HEADERS, normalizeImageUrl } from '@/utils/image-url';
import { LatestRequest } from '@/utils/latest-request';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

export default function DetailScreen() {
  const router = useRouter();
  const { id, siteUrl, detailUrl } = useLocalSearchParams<{ id: string; siteUrl: string; detailUrl?: string }>();
  const { site } = useSite();
  const { startDownload } = useDownloads();
  const { isFavorite, toggleFavorite } = useUserData();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;

  const [detail, setDetail] = useState<VodDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const requestRef = useRef(new LatestRequest());
  const abortControllerRef = useRef<AbortController | null>(null);

  const effectiveSiteUrl = siteUrl || site?.url || '';
  const effectiveDetailUrl = detailUrl || site?.detail || site?.url || effectiveSiteUrl;

  useEffect(() => {
    abortControllerRef.current?.abort();
    if (!id || !effectiveSiteUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- params can change on the same mounted route; reflect missing-param error state
      setLoading(false);
      setErrorMsg('缺少影片或站点参数，无法加载详情');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestRef.current.next();
    setLoading(true);
    setErrorMsg('');
    fetchVodDetail(effectiveSiteUrl, Number(id), controller.signal)
      .then((data) => {
        if (!requestRef.current.isCurrent(requestId)) return;
        if (!data) {
          setErrorMsg('未找到影片详情');
          return;
        }
        setDetail(data);
        setEpisodes(parseEpisodes(data.vod_play_url, data.vod_play_from, effectiveDetailUrl));
      })
      .catch((error) => {
        if (controller.signal.aborted || !requestRef.current.isCurrent(requestId)) return;
        setErrorMsg(error instanceof Error ? error.message : '详情加载失败');
      })
      .finally(() => {
        if (requestRef.current.isCurrent(requestId)) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [effectiveDetailUrl, effectiveSiteUrl, id, retryNonce]);

  const handlePlay = useCallback(
    (episode: Episode) => {
      router.push({
        pathname: '/player',
        params: {
          url: episode.url,
          title: `${detail?.vod_name ?? ''} - ${episode.name}`,
          vodId: detail?.vod_id ? String(detail.vod_id) : '',
          siteUrl: effectiveSiteUrl,
          detailUrl: effectiveDetailUrl,
          episodeName: episode.name,
          sourceName: episode.source ?? '',
          sourceIndex: String(episode.sourceIndex ?? 0),
        },
      });
    },
    [router, detail, effectiveSiteUrl, effectiveDetailUrl]
  );

  const handleDownload = useCallback(
    (vodName: string, episode: Episode) => {
      startDownload(vodName, episode.name, episode.url, {
        siteUrl: effectiveSiteUrl,
        detailUrl: effectiveDetailUrl,
        sourceName: episode.source,
      });
    },
    [startDownload, effectiveSiteUrl, effectiveDetailUrl]
  );

  const handleToggleFavorite = useCallback(() => {
    if (!detail) return;
    toggleFavorite({
      siteUrl: effectiveSiteUrl,
      detailUrl: effectiveDetailUrl,
      vodId: detail.vod_id,
      vodName: detail.vod_name,
      vodPic: detail.vod_pic,
      vodYear: detail.vod_year,
      vodArea: detail.vod_area,
      vodRemarks: detail.vod_remarks,
      typeName: detail.type_name,
    });
  }, [detail, effectiveSiteUrl, effectiveDetailUrl, toggleFavorite]);

  const favoriteActive = detail ? isFavorite(effectiveSiteUrl, detail.vod_id) : false;
  const favoriteButton = detail ? (
    <Pressable style={({ pressed }) => [styles.favoriteButton, pressed && { opacity: 0.65 }]} onPress={handleToggleFavorite} hitSlop={8}>
      <Heart size={20} color="#fff" fill={favoriteActive ? '#fff' : 'transparent'} strokeWidth={2} />
    </Pressable>
  ) : null;
  const scrollY = useState(() => new Animated.Value(0))[0];
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <ScreenHeader title="详情" floating />
        <DetailSkeleton />
      </View>
    );
  }

  if (errorMsg || !detail) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <ScreenHeader title="详情" subtitle="加载失败" />
        <View style={styles.centerContainer}>
          <Text style={[styles.centerText, { color: palette.secondaryText }]}>
            {errorMsg || '加载失败'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新加载详情"
            style={({ pressed }) => [styles.retryButton, { borderColor: palette.border }, pressed && styles.retryButtonPressed]}
            onPress={() => setRetryNonce((value) => value + 1)}>
            <Text style={[styles.retryText, { color: palette.text }]}>重试</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const tags = [detail.vod_remarks, detail.vod_year, detail.vod_area, detail.type_name].filter(Boolean) as string[];
  const subtitle = [detail.vod_lang, detail.vod_director ? `导演：${detail.vod_director}` : ''].filter(Boolean).join(' · ');

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title="详情"
        subtitle={detail.vod_name}
        floating
        right={favoriteButton}
        style={{ opacity: headerOpacity }}
      />
      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}>
        <View style={styles.hero}>
          <AppImage
            uri={normalizeImageUrl(detail.vod_pic, effectiveSiteUrl)}
            headers={CMS_IMAGE_HEADERS}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.58)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
            locations={[0, 0.48, 1]}
            style={styles.heroTopGradient}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.96)']}
            locations={[0, 0.5, 1]}
            style={styles.heroGradient}
          />
          <View style={styles.heroContent}>
            {tags.length > 0 ? <Text style={styles.heroMeta} numberOfLines={1}>{tags.join(' · ')}</Text> : null}
            <Text style={styles.heroTitle} numberOfLines={2}>{detail.vod_name}</Text>
            {subtitle ? <Text style={styles.heroSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        </View>

        <VodInfoSection detail={detail} />

        <EpisodeList episodes={episodes} vodName={detail.vod_name} onPlay={handlePlay} onDownload={handleDownload} />
      </Animated.ScrollView>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <SkeletonGroup>
      <View style={styles.skeletonRoot}>
        <SkeletonBlock style={styles.skeletonHero} />
        <View style={styles.skeletonContent}>
          <SkeletonBlock style={styles.skeletonLineLarge} />
          <SkeletonBlock style={styles.skeletonLineMedium} />
          <SkeletonBlock style={styles.skeletonLineSmall} />
          <View style={styles.skeletonRows}>
            {Array.from({ length: 3 }, (_, index) => (
              <SkeletonBlock key={`detail-row-${index}`} style={styles.skeletonRow} />
            ))}
          </View>
          <View style={styles.skeletonEpisodeGrid}>
            {Array.from({ length: 9 }, (_, index) => (
              <SkeletonBlock key={`episode-skeleton-${index}`} style={styles.skeletonEpisode} />
            ))}
          </View>
        </View>
      </View>
    </SkeletonGroup>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  retryButton: {
    minWidth: 96,
    minHeight: 44,
    marginTop: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  retryButtonPressed: {
    opacity: 0.62,
  },
  retryText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  scrollContent: {
    paddingBottom: 136,
  },
  hero: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.52,
    position: 'relative',
    overflow: 'hidden',
  },
  heroTopGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '34%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  heroContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  heroMeta: {
    marginBottom: 8,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  favoriteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonRoot: {
    flex: 1,
  },
  skeletonHero: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.52,
  },
  skeletonContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 12,
  },
  skeletonLineLarge: {
    width: '68%',
    height: 24,
  },
  skeletonLineMedium: {
    width: '88%',
    height: 14,
  },
  skeletonLineSmall: {
    width: '52%',
    height: 14,
  },
  skeletonRows: {
    marginTop: 6,
    gap: 10,
  },
  skeletonRow: {
    width: '100%',
    height: 16,
  },
  skeletonEpisodeGrid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
  },
  skeletonEpisode: {
    width: '33%',
    height: 38,
  },
});
