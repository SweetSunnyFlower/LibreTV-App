import { PosterGridSkeleton } from '@/components/movie/poster-grid-skeleton';
import { TagSelector } from '@/components/movie/tag-selector';
import { VodCard } from '@/components/movie/vod-card';
import { ThemedText } from '@/components/themed-text';
import { useSite } from '@/context/site-context';
import { useThemeName } from '@/hooks/use-theme';
import type { VodClass, VodItem } from '@/models/vod';
import { fetchCategories, fetchVodByCategory } from '@/services/cms-api';
import { LatestRequest } from '@/utils/latest-request';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NUM_COLUMNS = 3;
const ALL_YEARS_LABEL = '全部年份';
const YEAR_OPTIONS = [
  ALL_YEARS_LABEL,
  ...Array.from({ length: 16 }, (_, index) => String(new Date().getFullYear() - index)),
];

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { site } = useSite();

  const [categories, setCategories] = useState<VodClass[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<VodClass | null>(null);
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_LABEL);
  const [items, setItems] = useState<VodItem[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const pageRef = useRef(1);
  const pageCountRef = useRef(1);
  const categoryRequestRef = useRef(new LatestRequest());
  const itemRequestRef = useRef(new LatestRequest());

  const parents = useMemo(() => {
    const parentIds = new Set(categories.map((item) => item.type_pid).filter(Boolean));
    const explicitParents = categories.filter((item) => !item.type_pid || item.type_pid === 0);
    return explicitParents.length > 0 ? explicitParents : categories.filter((item) => parentIds.has(item.type_id));
  }, [categories]);

  const childCategories = useMemo(() => {
    if (!selectedParentId) return categories.filter((item) => item.type_pid && item.type_pid !== 0);
    const children = categories.filter((item) => item.type_pid === selectedParentId);
    return children.length > 0 ? children : categories.filter((item) => item.type_id === selectedParentId);
  }, [categories, selectedParentId]);

  const parentNames = useMemo(() => parents.map((item) => item.type_name), [parents]);
  const selectedParentName = useMemo(
    () => parents.find((item) => item.type_id === selectedParentId)?.type_name ?? '',
    [parents, selectedParentId]
  );
  const childNames = useMemo(() => childCategories.map((item) => item.type_name), [childCategories]);
  const selectedChildName = selectedType?.type_name ?? '';
  const selectedYearParam = selectedYear === ALL_YEARS_LABEL ? undefined : selectedYear;

  const loadCategoryItems = useCallback(async (type: VodClass, page = 1, append = false, year?: string) => {
    if (!site) return;
    const requestId = itemRequestRef.current.next();
    if (page === 1 && !append) setLoadingItems(true);
    if (page > 1) setLoadingMore(true);
    setErrorMsg('');
    try {
      const data = await fetchVodByCategory(site.url, type.type_id, page, year);
      if (!itemRequestRef.current.isCurrent(requestId)) return false;
      pageRef.current = Number(data.page || page);
      pageCountRef.current = Number(data.pagecount || 1);
      setItems((prev) => (append ? [...prev, ...(data.list ?? [])] : data.list ?? []));
      if (!data.list?.length && page === 1) setErrorMsg('暂无分类内容');
      return true;
    } catch (err) {
      if (!itemRequestRef.current.isCurrent(requestId)) return false;
      console.error('[Categories] Load items error:', err);
      setErrorMsg(err instanceof Error ? err.message : '分类内容加载失败');
      return false;
    } finally {
      if (itemRequestRef.current.isCurrent(requestId)) {
        setLoadingItems(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [site]);

  const loadCategories = useCallback(async () => {
    if (!site) return;
    const requestId = categoryRequestRef.current.next();
    itemRequestRef.current.invalidate();
    setLoadingCategories(true);
    setErrorMsg('');
    try {
      const data = await fetchCategories(site.url);
      if (!categoryRequestRef.current.isCurrent(requestId)) return;
      setCategories(data);
      const firstParent = data.find((item) => !item.type_pid || item.type_pid === 0) ?? data[0] ?? null;
      const firstChild = firstParent
        ? data.find((item) => item.type_pid === firstParent.type_id) ?? firstParent
        : null;
      setSelectedParentId(firstParent?.type_id ?? null);
      setSelectedType(firstChild);
      setSelectedYear(ALL_YEARS_LABEL);
      setItems([]);
      if (firstChild) await loadCategoryItems(firstChild, 1, false);
      if (!data.length) setErrorMsg('当前站点暂无分类');
    } catch (err) {
      if (!categoryRequestRef.current.isCurrent(requestId)) return;
      console.error('[Categories] Load categories error:', err);
      setErrorMsg(err instanceof Error ? err.message : '分类加载失败');
    } finally {
      if (categoryRequestRef.current.isCurrent(requestId)) {
        setLoadingCategories(false);
      }
    }
  }, [site, loadCategoryItems]);

  useEffect(() => {
    void Promise.resolve().then(loadCategories);
  }, [loadCategories]);

  const handleParentSelect = useCallback((name: string) => {
    const parent = parents.find((item) => item.type_name === name);
    if (!parent) return;
    setSelectedParentId(parent.type_id);
    const firstChild = categories.find((item) => item.type_pid === parent.type_id) ?? parent;
    setSelectedType(firstChild);
    loadCategoryItems(firstChild, 1, false, selectedYearParam);
  }, [categories, loadCategoryItems, parents, selectedYearParam]);

  const handleChildSelect = useCallback((name: string) => {
    const child = childCategories.find((item) => item.type_name === name);
    if (!child) return;
    setSelectedType(child);
    loadCategoryItems(child, 1, false, selectedYearParam);
  }, [childCategories, loadCategoryItems, selectedYearParam]);

  const handleYearSelect = useCallback((year: string) => {
    setSelectedYear(year);
    if (!selectedType) return;
    const nextYear = year === ALL_YEARS_LABEL ? undefined : year;
    loadCategoryItems(selectedType, 1, false, nextYear);
  }, [loadCategoryItems, selectedType]);

  const handleRefresh = useCallback(() => {
    if (!selectedType) return;
    setRefreshing(true);
    loadCategoryItems(selectedType, 1, false, selectedYearParam);
  }, [selectedType, loadCategoryItems, selectedYearParam]);

  const handleLoadMore = useCallback(() => {
    if (!selectedType || loadingMore || loadingItems || pageRef.current >= pageCountRef.current) return;
    loadCategoryItems(selectedType, pageRef.current + 1, true, selectedYearParam);
  }, [selectedType, loadingMore, loadingItems, loadCategoryItems, selectedYearParam]);

  const handleVodPress = useCallback((vod: VodItem) => {
    if (!site) return;
    router.push({
      pathname: '/detail',
      params: { id: String(vod.vod_id), siteUrl: site.url, detailUrl: site.detail || site.url },
    });
  }, [router, site]);

  const handleSitePress = useCallback(() => {
    router.push('/sites');
  }, [router]);

  const renderItem = ({ item, index }: { item: VodItem; index: number }) => (
    <VodCard vod={item} baseUrl={site?.url} onPress={handleVodPress} index={index} />
  );

  if (!site) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.siteText, { color: palette.text }]}>分类</Text>
        </View>
        <View style={styles.centerContainer}>
          <ThemedText type="defaultSemiBold" style={{ color: palette.secondaryText }}>请先选择站点</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={handleSitePress} hitSlop={10}>
          <Text style={[styles.siteText, { color: palette.secondaryText }]} numberOfLines={1}>
            当前站点 · {site.name}
          </Text>
        </Pressable>
      </View>

      <View style={styles.categoryPanel}>
        <TagSelector tags={parentNames} selectedTag={selectedParentName} onSelectTag={handleParentSelect} />
        <TagSelector tags={childNames} selectedTag={selectedChildName} onSelectTag={handleChildSelect} />
        <TagSelector tags={YEAR_OPTIONS} selectedTag={selectedYear} onSelectTag={handleYearSelect} />
      </View>

      {loadingCategories || loadingItems ? (
        <PosterGridSkeleton contentContainerStyle={styles.listContent} />
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: palette.secondaryText }]}>{errorMsg}</Text>
          <Pressable style={({ pressed }) => [styles.retryBtn, { backgroundColor: palette.text }, pressed && { opacity: 0.75 }]} onPress={loadCategories}>
            <Text style={[styles.retryText, { color: palette.inverseText }]}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item, index) => `${item.vod_id}-${index}`}
          renderItem={renderItem}
          numColumns={NUM_COLUMNS}
          key="categories-poster-grid"
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={palette.text} style={styles.footer} /> : null}
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
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  siteText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  categoryPanel: {
    paddingBottom: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '700',
  },
  retryBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: 1,
    paddingBottom: 136,
  },
  footer: {
    marginVertical: 24,
  },
});
