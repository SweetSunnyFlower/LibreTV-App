import { PosterGridSkeleton } from '@/components/movie/poster-grid-skeleton';
import { SearchBar } from '@/components/movie/search-bar';
import { VodCard } from '@/components/movie/vod-card';
import { ThemedText } from '@/components/themed-text';
import { useSite } from '@/context/site-context';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { VodItem } from '@/models/vod';
import { searchVod } from '@/services/cms-api';
import { LatestRequest } from '@/utils/latest-request';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { keyword: initialKeyword } = useLocalSearchParams<{ keyword?: string }>();
  const { site } = useSite();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { addSearchHistory } = useUserData();

  const [keyword, setKeyword] = useState(initialKeyword ?? '');
  const [results, setResults] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const requestRef = useRef(new LatestRequest());

  const doSearch = useCallback(async (kw: string, siteUrl: string) => {
    if (!kw.trim()) return;
    const requestId = requestRef.current.next();
    setLoading(true);
    setErrorMsg('');
    setSearched(true);
    try {
      console.log('[Search] Searching for:', kw, 'on site:', siteUrl);
      const data = await searchVod(siteUrl, kw.trim());
      if (!requestRef.current.isCurrent(requestId)) return;
      setResults(data.list ?? []);
      await addSearchHistory(kw.trim(), siteUrl, site?.name ?? '', data.list?.length ?? 0);
      if (!data.list || data.list.length === 0) {
        setErrorMsg(data.msg || '未找到相关影视');
      }
    } catch (err) {
      if (!requestRef.current.isCurrent(requestId)) return;
      console.error('[Search] Error:', err);
      setErrorMsg(err instanceof Error ? err.message : '搜索失败，请检查网络或切换站点');
      setResults([]);
    } finally {
      if (requestRef.current.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, [addSearchHistory, site?.name]);

  useEffect(() => {
    if (initialKeyword && site) {
      doSearch(initialKeyword, site.url);
    }
  }, [initialKeyword, site, doSearch]);

  const handleSubmit = useCallback(() => {
    if (keyword.trim() && site) {
      doSearch(keyword, site.url);
    } else if (!site) {
      setErrorMsg('请先选择站点');
    }
  }, [keyword, site, doSearch]);

  const handleVodPress = useCallback(
    (vod: VodItem) => {
      if (!site) return;
      router.push({
        pathname: '/detail',
        params: { id: String(vod.vod_id), siteUrl: site.url, detailUrl: site.detail || site.url },
      });
    },
    [router, site]
  );

  const renderItem = ({ item, index }: { item: VodItem; index: number }) => (
    <VodCard vod={item} baseUrl={site?.url} onPress={handleVodPress} index={index} />
  );

  const renderContent = () => {
    if (!site) {
      return <CenterState title="站点未就绪" hint="请稍候或回到首页切换站点" palette={palette} />;
    }

    if (loading) {
      return <PosterGridSkeleton contentContainerStyle={styles.listContent} />;
    }

    if (errorMsg) {
      return <CenterState title={errorMsg} hint={`当前站点：${site.name}`} palette={palette} />;
    }

    if (results.length > 0) {
      return (
        <FlashList
          data={results}
          keyExtractor={(item, index) => `${item.vod_id}-${index}`}
          renderItem={renderItem}
          numColumns={3}
          key="search-results-3-columns"
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: palette.secondaryText }]}>找到 {results.length} 个相关结果</Text>
          }
          contentContainerStyle={styles.listContent}
        />
      );
    }

    return (
      <CenterState
        title={searched ? `未找到「${keyword}」` : '输入片名、演员或关键词'}
        hint={site ? `当前站点：${site.name}` : undefined}
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
          placeholder="搜索电影、剧集、演员"
          autoFocus={!initialKeyword}
        />
        <Text style={[styles.siteText, { color: palette.secondaryText }]} numberOfLines={1}>
          {site ? `当前站点 · ${site.name}` : '请选择站点'}
        </Text>
      </View>
      {renderContent()}
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
});
