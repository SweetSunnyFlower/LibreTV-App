import { ScreenHeader } from '@/components/screen-header';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { SearchHistoryRecord } from '@/models/user-data';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Search, Trash2 } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function SearchHistoryScreen() {
  const router = useRouter();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { searchHistory, deleteSearchHistory, clearSearchHistory } = useUserData();

  const handlePress = useCallback((item: SearchHistoryRecord) => {
    router.push({ pathname: '/search', params: { keyword: item.keyword } });
  }, [router]);

  const renderItem = ({ item }: { item: SearchHistoryRecord }) => (
    <Pressable
      style={({ pressed }) => [styles.row, { borderBottomColor: palette.border }, pressed && { opacity: 0.65 }]}
      onPress={() => handlePress(item)}>
      <Search size={18} color={palette.secondaryText} strokeWidth={1.75} />
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{item.keyword}</Text>
        <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>
          {item.siteName || '未知站点'} · {item.resultCount} 个结果
        </Text>
      </View>
      <Pressable style={styles.iconButton} onPress={() => deleteSearchHistory(item.id)} hitSlop={8}>
        <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
      </Pressable>
    </Pressable>
  );

  const clearButton = searchHistory.length ? (
    <Pressable onPress={clearSearchHistory} hitSlop={10}>
      <Text style={[styles.clearText, { color: palette.secondaryText }]}>清空</Text>
    </Pressable>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title="搜索历史" subtitle={`${searchHistory.length} 条记录`} right={clearButton} />
      {searchHistory.length === 0 ? (
        <EmptyState text="暂无搜索历史" palette={palette} />
      ) : (
        <FlashList
          data={searchHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function EmptyState({ text, palette }: { text: string; palette: typeof lightPalette }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: palette.secondaryText }]}>{text}</Text>
    </View>
  );
}

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
  listContent: {
    paddingBottom: 136,
  },
  row: {
    minHeight: 70,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
});
