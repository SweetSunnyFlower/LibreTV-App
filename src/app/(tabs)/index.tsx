import { HomeFeedCard } from '@/components/movie/home-feed-card';
import { PosterGridSkeleton } from '@/components/movie/poster-grid-skeleton';
import { TagSelector } from '@/components/movie/tag-selector';
import type { DoubanContentType } from '@/constants/api';
import { useThemeName } from '@/hooks/use-theme';
import type { DoubanMovie } from '@/models/douban';
import { fetchMovieTags, fetchRecommendedMovies } from '@/services/douban-api';
import { LatestRequest } from '@/utils/latest-request';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_WIDTH = 72;
const TAB_GAP = 28;
const UNDERLINE_WIDTH = 18;
const UNDERLINE_TRAVEL = TAB_WIDTH + TAB_GAP;

export default function HomeScreen() {
  const router = useRouter();
  const themeName = useThemeName();
  const insets = useSafeAreaInsets();
  const isDark = themeName === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const tabProgress = useRef(new Animated.Value(0)).current;

  const [contentType, setContentType] = useState<DoubanContentType>('movie');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [movies, setMovies] = useState<DoubanMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const pageStart = useRef(0);
  const hasMore = useRef(true);
  const loadingMoreRef = useRef(false);
  const tagRequestRef = useRef(new LatestRequest());
  const movieRequestRef = useRef(new LatestRequest());

  const selectedTagIndex = useMemo(() => Math.max(0, tags.indexOf(selectedTag)), [selectedTag, tags]);

  const handleSelectContentType = useCallback((type: DoubanContentType) => {
    setContentType(type);
  }, []);

  const handleSwipeTab = useCallback(
    (direction: 'next' | 'prev') => {
      if (direction === 'next') {
        if (selectedTagIndex < tags.length - 1) {
          setSelectedTag(tags[selectedTagIndex + 1]);
          return;
        }
        if (contentType === 'movie') {
          handleSelectContentType('tv');
        }
        return;
      }

      if (selectedTagIndex > 0) {
        setSelectedTag(tags[selectedTagIndex - 1]);
        return;
      }
      if (contentType === 'tv') {
        handleSelectContentType('movie');
      }
    },
    [contentType, handleSelectContentType, selectedTagIndex, tags]
  );

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const horizontal = Math.abs(gestureState.dx) > 36;
          const intentional = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35;
          return horizontal && intentional;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -48) {
            handleSwipeTab('next');
          } else if (gestureState.dx > 48) {
            handleSwipeTab('prev');
          }
        },
      }),
    [handleSwipeTab]
  );

  useEffect(() => {
    Animated.timing(tabProgress, {
      toValue: contentType === 'movie' ? 0 : 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentType, tabProgress]);

  useEffect(() => {
    setLoading(true);
    setMovies([]);
    setSelectedTag('');
    pageStart.current = 0;
    hasMore.current = true;
    const requestId = tagRequestRef.current.next();
    fetchMovieTags(contentType).then((nextTags) => {
      if (!tagRequestRef.current.isCurrent(requestId)) return;
      console.log('[Home] Tags loaded:', contentType, nextTags);
      setTags(nextTags);
      setSelectedTag(nextTags[0] ?? '');
    }).catch((error) => {
      if (!tagRequestRef.current.isCurrent(requestId)) return;
      console.error('[Home] Tags load error:', error);
      setErrorMsg('标签加载失败，请检查网络');
    });
  }, [contentType]);

  // Load movies when tag changes
  const loadMovies = useCallback(async (tag: string, start = 0) => {
    if (!tag) return;
    const requestId = movieRequestRef.current.next();
    if (start === 0) {
      setLoading(true);
      setErrorMsg('');
    }
    try {
      const data = await fetchRecommendedMovies(tag, start, contentType);
      if (!movieRequestRef.current.isCurrent(requestId)) return false;
      if (start === 0) {
        setMovies(data);
      } else {
        setMovies((prev) => [...prev, ...data]);
      }
      hasMore.current = data.length >= 20;
      pageStart.current = start + data.length;
      if (data.length === 0 && start === 0) {
        setErrorMsg('暂无推荐内容');
      }
      return true;
    } catch (err) {
      if (!movieRequestRef.current.isCurrent(requestId)) return false;
      console.error('[Home] Load movies error:', err);
      if (start === 0) {
        setErrorMsg('加载失败，请检查网络');
      }
      return false;
    } finally {
      if (movieRequestRef.current.isCurrent(requestId)) {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [contentType]);

  useEffect(() => {
    if (!selectedTag) return;
    pageStart.current = 0;
    hasMore.current = true;
    movieRequestRef.current.invalidate();
    loadMovies(selectedTag, 0);
  }, [selectedTag, loadMovies]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMoreRef.current || !hasMore.current || !selectedTag) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    await loadMovies(selectedTag, pageStart.current);
  }, [loading, selectedTag, loadMovies]);

  const handleMoviePress = useCallback(
    (movie: DoubanMovie) => {
      router.push({ pathname: '/search', params: { keyword: movie.title } });
    },
    [router]
  );

  const renderItem = ({ item, index }: { item: DoubanMovie; index: number }) => (
    <HomeFeedCard
      movie={item}
      contentType={contentType}
      selectedTag={selectedTag}
      index={index}
      onPress={handleMoviePress}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]} {...swipeResponder.panHandlers}>
      <View style={[styles.topSection, { paddingTop: insets.top + 10 }]}>
        <ContentTypeTabs
          contentType={contentType}
          onSelect={handleSelectContentType}
          progress={tabProgress}
          palette={palette}
        />

        <TagSelector tags={tags} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
      </View>

      {loading ? (
        <PosterGridSkeleton contentContainerStyle={styles.feedContent} />
      ) : errorMsg ? (
        <StateView
          palette={palette}
          message={errorMsg}
          actionLabel="重新加载"
          onAction={() => loadMovies(selectedTag, 0)}
        />
      ) : (
        <FlashList
          style={styles.list}
          data={movies}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={3}
          key="poster-grid"
          contentContainerStyle={styles.feedContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={palette.text} style={styles.footerLoader} />
            ) : null
          }
        />
      )}
    </View>
  );
}

type Palette = typeof lightPalette;

type ContentTypeTabsProps = {
  contentType: DoubanContentType;
  onSelect: (type: DoubanContentType) => void;
  progress: Animated.Value;
  palette: Palette;
};

function ContentTypeTabs({ contentType, onSelect, progress, palette }: ContentTypeTabsProps) {
  const underlineTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [(TAB_WIDTH - UNDERLINE_WIDTH) / 2, UNDERLINE_TRAVEL + (TAB_WIDTH - UNDERLINE_WIDTH) / 2],
  });

  return (
    <View style={styles.tabsWrap}>
      <View style={styles.tabsRow}>
        <Pressable style={styles.tabButton} onPress={() => onSelect('movie')} hitSlop={10}>
          <Text style={[styles.tabText, { color: contentType === 'movie' ? palette.text : palette.secondaryText }]}>电影</Text>
        </Pressable>
        <Pressable style={styles.tabButton} onPress={() => onSelect('tv')} hitSlop={10}>
          <Text style={[styles.tabText, { color: contentType === 'tv' ? palette.text : palette.secondaryText }]}>电视剧</Text>
        </Pressable>
        <Animated.View
          style={[
            styles.tabUnderline,
            {
              backgroundColor: palette.text,
              transform: [{ translateX: underlineTranslateX }],
            },
          ]}
        />
      </View>
    </View>
  );
}

type StateViewProps = {
  palette: Palette;
  message: string;
  spinner?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

function StateView({ palette, message, spinner, actionLabel, onAction }: StateViewProps) {
  return (
    <View style={styles.centerContainer}>
      <View style={[styles.stateCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
        {spinner ? <ActivityIndicator size="large" color={palette.text} /> : null}
        <Text style={[styles.stateText, { color: palette.secondaryText, marginTop: spinner ? 18 : 0 }]}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable style={({ pressed }) => [styles.retryButton, { backgroundColor: palette.text }, pressed && { opacity: 0.75 }]} onPress={onAction}>
            <Text style={[styles.retryText, { color: palette.inverseText }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  card: '#FFFFFF',
  text: '#111111',
  inverseText: '#FFFFFF',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  skeleton: '#E7E7E4',
};

const darkPalette = {
  background: '#0F0F0F',
  card: '#171717',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  skeleton: '#232323',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    paddingBottom: 4,
  },
  tabsWrap: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  tabsRow: {
    width: TAB_WIDTH * 2 + TAB_GAP,
    height: 31,
    flexDirection: 'row',
    gap: TAB_GAP,
    position: 'relative',
  },
  tabButton: {
    width: TAB_WIDTH,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: UNDERLINE_WIDTH,
    height: 4,
    borderRadius: 4,
  },
  list: { flex: 1 },
  feedContent: {
    paddingTop: 1,
    paddingBottom: 136,
  },
  footerLoader: {
    marginVertical: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  stateCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.045,
    shadowRadius: 24,
    elevation: 2,
  },
  stateText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 22,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
