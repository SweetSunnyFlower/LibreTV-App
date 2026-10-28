import { WatchHistoryFolderItem } from '@/components/movie/watch-history-folder-item';
import { ScreenHeader } from '@/components/screen-header';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import { groupWatchHistoryFolders, type WatchHistoryFolderGroup } from '@/utils/media-groups';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function WatchHistoryScreen() {
  const router = useRouter();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { watchHistory, clearWatchHistory, isHydrating } = useUserData();
  const folders = useMemo(() => groupWatchHistoryFolders(watchHistory), [watchHistory]);

  const handlePress = useCallback((group: WatchHistoryFolderGroup) => {
    router.push({
      pathname: '/mine/watch-history-folder',
      params: {
        key: group.key,
        title: group.vodName,
      },
    });
  }, [router]);

  const renderItem = ({ item }: { item: WatchHistoryFolderGroup }) => (
    <WatchHistoryFolderItem group={item} onPress={handlePress} />
  );

  const clearButton = !isHydrating && watchHistory.length ? (
    <Pressable onPress={clearWatchHistory} hitSlop={10}>
      <Text style={[styles.clearText, { color: palette.secondaryText }]}>清空</Text>
    </Pressable>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title="观看历史"
        subtitle={isHydrating ? undefined : `${folders.length} 部影片 · ${watchHistory.length} 条记录`}
        right={clearButton}
      />
      {isHydrating ? (
        <ListSkeleton rows={4} variant="history" contentContainerStyle={styles.listContent} />
      ) : watchHistory.length === 0 ? (
        <EmptyState text="暂无观看历史" palette={palette} />
      ) : (
        <FlashList
          data={folders}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
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
  secondaryText: '#8A8A8A',
};

const darkPalette = {
  background: '#0F0F0F',
  secondaryText: '#8E8E8E',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingBottom: 136,
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
