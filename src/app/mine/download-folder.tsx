import { DownloadItem } from '@/components/movie/download-item';
import { ScreenHeader } from '@/components/screen-header';
import { useAppDialog } from '@/context/app-dialog-context';
import { useDownloads } from '@/context/download-context';
import { useThemeName } from '@/hooks/use-theme';
import type { DownloadRecord } from '@/models/download';
import { downloadFolderKey } from '@/utils/media-groups';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function DownloadFolderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string; title?: string }>();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const dialog = useAppDialog();
  const { downloads, pauseDownload, resumeDownload, cancelDownload } = useDownloads();
  const folderKey = firstParam(params.key) ?? '';
  const title = firstParam(params.title) ?? '下载剧集';

  const folderDownloads = useMemo(() => {
    return downloads.filter((item) => downloadFolderKey(item) === folderKey);
  }, [downloads, folderKey]);

  const handlePlay = useCallback((record: DownloadRecord) => {
    router.push({
      pathname: '/player',
      params: {
        url: record.destPath,
        title: `${record.vodName} - ${record.episodeName}`,
        vodName: record.vodName,
        episodeName: record.episodeName,
      },
    });
  }, [router]);

  const handleClear = useCallback(() => {
    if (folderDownloads.length === 0) return;
    void dialog.confirm({
      title: '清空下载',
      message: `确定删除「${title}」下的 ${folderDownloads.length} 个下载任务吗？`,
      confirmText: '清空',
      cancelText: '取消',
      destructive: true,
      onConfirm: () => {
        void Promise.all(folderDownloads.map((item) => cancelDownload(item.id)));
      },
    });
  }, [cancelDownload, dialog, folderDownloads, title]);

  const renderItem = ({ item }: { item: DownloadRecord }) => (
    <DownloadItem
      record={item}
      onPause={pauseDownload}
      onResume={resumeDownload}
      onCancel={cancelDownload}
      onPlay={handlePlay}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title={title}
        subtitle={`${folderDownloads.length} 集下载`}
        right={folderDownloads.length > 0 ? (
          <Pressable onPress={handleClear} hitSlop={10}>
            <Trash2 size={18} color={palette.secondaryText} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      />
      {folderDownloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无下载剧集</Text>
        </View>
      ) : (
        <FlashList
          data={folderDownloads}
          keyExtractor={(item) => item.id}
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
  container: {
    flex: 1,
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
});
