import { PosterGridSkeleton } from '@/components/movie/poster-grid-skeleton';
import { SearchBar } from '@/components/movie/search-bar';
import { VodCard } from '@/components/movie/vod-card';
import { ThemedText } from '@/components/themed-text';
import { useSite } from '@/context/site-context';
import { useThemeName } from '@/hooks/use-theme';
import type { CmsSite } from '@/models/site';
import type { VodItem } from '@/models/vod';
import { searchVod } from '@/services/cms-api';
import { aggregateSearchError, aggregateSearchStatus } from '@/utils/search-status';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AggregateSearchResult = {
  vod: VodItem;
  site: CmsSite;
  key: string;
};

export default function AggregateSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { keyword: initialKeyword } = useLocalSearchParams<{ keyword?: string }>();
  const { sites } = useSite();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const requestIdRef = useRef(0);

  const [keyword, setKeyword] = useState(initialKeyword ?? '');
  const [results, setResults] = useState<AggregateSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [completedSites, setCompletedSites] = useState(0);
  const [totalSites, setTotalSites] = useState(0);
  const [failedSites, setFailedSites] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const targetSites = useMemo(() => sites.filter((item) => item.url), [sites]);

  const doAggregateSearch = useCallback(async (kw: string) => {
    const text = kw.trim();
    if (!text) return;

    if (!targetSites.length) {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      setSearched(true);
      setLoading(false);
      setResults([]);
      setCompletedSites(0);
      setTotalSites(0);
      setFailedSites(0);
      setErrorMsg('暂无可用站点');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setSearched(true);
    setErrorMsg('');
    setResults([]);
    setCompletedSites(0);
    setTotalSites(targetSites.length);
    setFailedSites(0);
    let failedCount = 0;

    await Promise.all(targetSites.map(async (site) => {
      try {
        const data = await searchVod(site.url, text, controller.signal);
        if (requestIdRef.current !== requestId) return;

        const list = data.list ?? [];
        if (!list.length) return;

        setResults((prev) => [
          ...prev,
          ...list.map((vod, index) => ({
            vod,
            site,
            key: `${site.id}-${site.url}-${vod.vod_id}-${index}`,
          })),
        ]);
      } catch (error) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) return;
        failedCount += 1;
        setFailedSites((prev) => prev + 1);
        // 单个站点失败不应影响其他站点；记录失败数，全部失败时展示网络错误。
        console.warn('[AggregateSearch] Site search failed:', site.name, error);
      } finally {
        if (requestIdRef.current === requestId) {
          setCompletedSites((prev) => prev + 1);
        }
      }
    }));

    if (requestIdRef.current === requestId) {
      setLoading(false);
      setErrorMsg(aggregateSearchError(failedCount, targetSites.length));
    }
  }, [targetSites]);

  useEffect(() => {
    if (initialKeyword) {
      void doAggregateSearch(initialKeyword);
    }
  }, [doAggregateSearch, initialKeyword]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSubmit = useCallback(() => {
    void doAggregateSearch(keyword);
  }, [doAggregateSearch, keyword]);

  const handleVodPress = useCallback((item: AggregateSearchResult) => {
    router.push({
      pathname: '/detail',
      params: {
        id: String(item.vod.vod_id),
        siteUrl: item.site.url,
        detailUrl: item.site.detail || item.site.url,
      },
    });
  }, [router]);

  const statusText = useMemo(() => {
    if (!searched) return `搜索全部站点 · 共 ${targetSites.length} 个站点`;
    if (loading) return `已完成 ${completedSites}/${totalSites} · 已找到 ${results.length} 个结果`;
    if (errorMsg) return errorMsg;
    return aggregateSearchStatus(totalSites, failedSites, results.length);
  }, [completedSites, errorMsg, failedSites, loading, results.length, searched, targetSites.length, totalSites]);

  const renderItem = ({ item, index }: { item: AggregateSearchResult; index: number }) => (
    <VodCard
      vod={item.vod}
      baseUrl={item.site.url}
      onPress={() => handleVodPress(item)}
      index={index}
      topRight={<SourceBadge name={item.site.name} />}
    />
  );

  const renderContent = () => {
    if (loading && results.length === 0) {
      return <PosterGridSkeleton contentContainerStyle={styles.listContent} />;
    }

    if (results.length > 0) {
      return (
        <FlashList
          data={results}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          numColumns={3}
          key="aggregate-search-results-3-columns"
          ListFooterComponent={loading ? <ActivityIndicator color={palette.text} style={styles.footer} /> : null}
          contentContainerStyle={styles.listContent}
        />
      );
    }

    if (errorMsg) {
      return <CenterState title={errorMsg} hint="请检查网络或稍后重试" palette={palette} />;
    }

    return (
      <CenterState
        title={searched ? `未找到「${keyword.trim()}」` : '输入片名、演员或关键词'}
        hint={searched ? statusText : '将在所有站点中同时搜索'}
        palette={palette}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.searchArea, { paddingTop: insets.top + 16 }]}>
        <SearchBar
          value={keyword}
          onChangeText={setKeyword}
          onSubmit={handleSubmit}
          placeholder="全站点搜索电影、剧集、演员"
          autoFocus={!initialKeyword}
        />
        <Text style={[styles.siteText, { color: palette.secondaryText }]} numberOfLines={1}>{statusText}</Text>
      </View>
      {renderContent()}
    </View>
  );
}

function SourceBadge({ name }: { name: string }) {
  return (
    <View style={styles.sourceBadge}>
      <Text style={styles.sourceBadgeText} numberOfLines={1}>{name}</Text>
    </View>
  );
}

function CenterState({ title, hint, palette }: { title: string; hint?: string; palette: typeof lightPalette }) {
  return (
    <View style={styles.centerContainer}>
      <ThemedText type="defaultSemiBold" style={{ color: palette.text }}>{title}</ThemedText>
      {hint ? <Text style={[styles.centerHint, { color: palette.secondaryText }]}>{hint}</Text> : null}
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  secondaryText: '#8A8A8A',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchArea: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  siteText: {
    alignSelf: 'flex-start',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centerHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
  resultCount: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingTop: 1,
    paddingBottom: 136,
  },
  footer: {
    marginVertical: 24,
  },
  sourceBadge: {
    maxWidth: 74,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sourceBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
  },
});
