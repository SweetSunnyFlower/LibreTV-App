import { DownloadFolderItem } from '@/components/movie/download-folder-item';
import { ScreenHeader } from '@/components/screen-header';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useDownloads } from '@/context/download-context';
import { useThemeName } from '@/hooks/use-theme';
import { groupDownloadFolders, type DownloadFolderGroup } from '@/utils/media-groups';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function MyDownloadsScreen() {
  const router = useRouter();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { downloads, isHydrating } = useDownloads();
  const folders = useMemo(() => groupDownloadFolders(downloads), [downloads]);

  const stats = useMemo(() => ({
    active: downloads.filter((item) => item.state === 'active').length,
    completed: downloads.filter((item) => item.state === 'completed').length,
    paused: downloads.filter((item) => item.state === 'paused').length,
  }), [downloads]);

  const handleOpenFolder = useCallback((group: DownloadFolderGroup) => {
    router.push({
      pathname: '/mine/download-folder',
      params: {
        key: group.key,
        title: group.vodName,
      },
    });
  }, [router]);

  const renderItem = ({ item }: { item: DownloadFolderGroup }) => (
    <DownloadFolderItem group={item} onPress={handleOpenFolder} />
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title="我的下载" subtitle={isHydrating ? undefined : `${downloads.length} 个任务`} />
      {isHydrating ? null : (
        <Text style={[styles.summary, { color: palette.secondaryText }]} numberOfLines={1}>
          下载中 {stats.active} · 已完成 {stats.completed} · 已暂停 {stats.paused}
        </Text>
      )}
      {isHydrating ? (
        <ListSkeleton rows={4} variant="download" contentContainerStyle={styles.listContent} />
      ) : downloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无下载内容</Text>
          <Text style={[styles.emptyHint, { color: palette.secondaryText }]}>在影视详情页点击下载按钮即可开始</Text>
        </View>
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
  summary: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 136,
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
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
