import { ScreenHeader } from '@/components/screen-header';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { LiveWatchHistoryRecord } from '@/models/user-data';
import { groupWatchHistoryFolders, type WatchHistoryFolderGroup } from '@/utils/media-groups';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Clock, Trash2, Tv } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type HistoryRow =
  | { type: 'vod'; folder: WatchHistoryFolderGroup; updatedAt: number }
  | { type: 'live'; item: LiveWatchHistoryRecord; updatedAt: number };

export default function WatchHistoryScreen() {
  const router = useRouter();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const {
    watchHistory,
    liveWatchHistory,
    deleteLiveWatchHistory,
    clearWatchHistory,
    clearLiveWatchHistory,
    isHydrating,
  } = useUserData();

  const rows = useMemo<HistoryRow[]>(() => {
    const vod = groupWatchHistoryFolders(watchHistory).map((folder) => ({
      type: 'vod' as const,
      folder,
      updatedAt: folder.updatedAt,
    }));
    const live = liveWatchHistory.map((item) => ({ type: 'live' as const, item, updatedAt: item.updatedAt }));
    return [...vod, ...live].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [watchHistory, liveWatchHistory]);

  const openVodFolder = useCallback((folder: WatchHistoryFolderGroup) => {
    router.push({
      pathname: '/mine/watch-history-folder',
      params: { key: folder.key, title: folder.vodName },
    });
  }, [router]);

  const openLive = useCallback((item: LiveWatchHistoryRecord) => {
    router.push({
      pathname: '/live-player',
      params: {
        kind: item.kind,
        url: item.kind === 'm3u' ? item.channelUrl : '',
        channelId: item.kind === 'library' ? (item.channelId ?? '') : '',
        name: item.channelName,
        sourceId: item.kind === 'm3u' && item.sourceId != null ? String(item.sourceId) : '',
        sourceName: item.sourceName,
        logo: item.logo,
      },
    });
  }, [router]);

  const clearAll = useCallback(() => {
    void clearWatchHistory();
    void clearLiveWatchHistory();
  }, [clearLiveWatchHistory, clearWatchHistory]);

  const clearButton = !isHydrating && rows.length ? (
    <Pressable onPress={clearAll} hitSlop={10}>
      <Text style={[styles.clearText, { color: palette.secondaryText }]}>清空</Text>
    </Pressable>
  ) : null;

  const renderItem = useCallback(({ item }: { item: HistoryRow }) => {
    if (item.type === 'live') {
      return (
        <View style={[styles.row, { borderBottomColor: palette.border }]}>
          <View style={[styles.avatar, { backgroundColor: palette.segmentBackground }]}>
            <Tv size={18} color={palette.secondaryText} strokeWidth={1.6} />
          </View>
          <Pressable style={styles.rowMain} onPress={() => openLive(item.item)}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{item.item.channelName}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.badge, { color: palette.accent, borderColor: palette.accent }]}>直播</Text>
              <Text style={[styles.meta, { color: palette.secondaryText }]} numberOfLines={1}>{item.item.sourceName || '我的直播源'}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => deleteLiveWatchHistory(item.item.id)} hitSlop={8}>
            <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.row, { borderBottomColor: palette.border }]}>
        <View style={[styles.avatar, { backgroundColor: palette.segmentBackground }]}>
          <Clock size={18} color={palette.secondaryText} strokeWidth={1.6} />
        </View>
        <Pressable style={styles.rowMain} onPress={() => openVodFolder(item.folder)}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{item.folder.vodName}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.badge, { color: palette.secondaryText, borderColor: palette.border }]}>影视</Text>
            <Text style={[styles.meta, { color: palette.secondaryText }]} numberOfLines={1}>
              共 {item.folder.count} 集 · 最近 {item.folder.latestEpisodeName || '—'}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  }, [deleteLiveWatchHistory, openLive, openVodFolder, palette]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title="观看历史"
        subtitle={isHydrating ? undefined : `${rows.length} 条记录`}
        right={clearButton}
      />
      {isHydrating ? (
        <ListSkeleton rows={5} variant="history" contentContainerStyle={styles.listContent} />
      ) : rows.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无观看历史</Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => (item.type === 'live' ? `live-${item.item.id}` : `vod-${item.folder.key}`)}
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
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  segmentBackground: '#F2F2F0',
  accent: '#2563EB',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  segmentBackground: '#1D1D1D',
  accent: '#60A5FA',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 136 },
  clearText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  row: {
    minHeight: 72,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  meta: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
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
