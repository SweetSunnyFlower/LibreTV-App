import { SearchBar } from '@/components/movie/search-bar';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { SkeletonBlock, SkeletonGroup } from '@/components/skeletons/skeleton';
import { useSite } from '@/context/site-context';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { SearchHistoryRecord } from '@/models/user-data';
import { useRouter } from 'expo-router';
import { Layers, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SearchEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { site, isHydrating: siteHydrating } = useSite();
  const {
    searchHistory,
    deleteSearchHistory,
    clearSearchHistory,
    isHydrating: userDataHydrating,
  } = useUserData();
  const [keyword, setKeyword] = useState('');

  const openSearch = useCallback((nextKeyword: string) => {
    const text = nextKeyword.trim();
    if (!text) return;
    router.push({ pathname: '/search', params: { keyword: text } });
  }, [router]);

  const handleSubmit = useCallback(() => {
    openSearch(keyword);
  }, [keyword, openSearch]);

  const handleHistoryPress = useCallback((item: SearchHistoryRecord) => {
    setKeyword(item.keyword);
  }, []);

  const handleAggregateSearchPress = useCallback(() => {
    const text = keyword.trim();
    if (text) {
      router.push({ pathname: '/aggregate-search', params: { keyword: text } });
      return;
    }
    router.push('/aggregate-search');
  }, [keyword, router]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
        <SearchBar
          value={keyword}
          onChangeText={setKeyword}
          onSubmit={handleSubmit}
          placeholder="搜索电影、剧集、演员"
          autoFocus={false}
        />

        {siteHydrating ? (
          <SkeletonGroup>
            <SkeletonBlock style={styles.siteTextSkeleton} />
          </SkeletonGroup>
        ) : (
          <Text style={[styles.siteText, { color: palette.secondaryText }]} numberOfLines={1}>
            {site ? `当前站点 · ${site.name}` : '请选择站点'}
          </Text>
        )}

        <View style={styles.historyHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>近期搜索</Text>
          {!userDataHydrating && searchHistory.length > 0 ? (
            <Pressable onPress={clearSearchHistory} hitSlop={10}>
              <Text style={[styles.clearText, { color: palette.secondaryText }]}>清空</Text>
            </Pressable>
          ) : null}
        </View>

        {userDataHydrating ? (
          <ListSkeleton rows={2} variant="history" inset={0} />
        ) : searchHistory.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无搜索记录</Text>
          </View>
        ) : (
          <View style={[styles.historyList, { borderColor: palette.border }]}>
            {searchHistory.map((item, index) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.historyRow,
                  { borderBottomColor: palette.border },
                  index === searchHistory.length - 1 && styles.lastRow,
                  pressed && { opacity: 0.65 },
                ]}
                onPress={() => handleHistoryPress(item)}>
                <View style={styles.historyTextGroup}>
                  <Text style={[styles.historyKeyword, { color: palette.text }]} numberOfLines={1}>{item.keyword}</Text>
                  <Text style={[styles.historyMeta, { color: palette.secondaryText }]} numberOfLines={1}>
                    {item.siteName || '历史搜索'} · {item.resultCount ?? 0} 个结果
                  </Text>
                </View>
                <Pressable style={styles.deleteButton} onPress={() => deleteSearchHistory(item.id)} hitSlop={8}>
                  <X size={16} color={palette.secondaryText} strokeWidth={1.8} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="全站点搜索"
        onPress={handleAggregateSearchPress}
        style={({ pressed }) => [
          styles.aggregateButton,
          { bottom: insets.bottom + 92, backgroundColor: palette.text },
          pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
        ]}>
        <Layers size={18} color={palette.inverseText} strokeWidth={2.2} />
        <Text style={[styles.aggregateButtonText, { color: palette.inverseText }]}>全站点搜索</Text>
      </Pressable>
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  inverseText: '#FFFFFF',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 136,
    gap: 12,
  },
  siteText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  siteTextSkeleton: {
    width: 190,
    height: 12,
  },
  historyHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  clearText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  historyList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  historyRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  historyTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  historyKeyword: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  historyMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  deleteButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  aggregateButton: {
    position: 'absolute',
    right: 18,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  aggregateButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
});
