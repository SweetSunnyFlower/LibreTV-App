import { DownloadFolderItem } from '@/components/movie/download-folder-item';
import { useDownloads } from '@/context/download-context';
import { useThemeName } from '@/hooks/use-theme';
import { groupDownloadFolders, type DownloadFolderGroup } from '@/utils/media-groups';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DownloadsScreen() {
  const router = useRouter();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { downloads } = useDownloads();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>下载</Text>
          <Text style={[styles.summary, { color: palette.secondaryText }]} numberOfLines={1}>
            全部 {downloads.length} · 下载中 {stats.active} · 已完成 {stats.completed} · 已暂停 {stats.paused}
          </Text>
        </View>

        {downloads.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={[styles.emptyTitle, { color: palette.secondaryText }]}>暂无下载任务</Text>
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
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  summary: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 136,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
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
