import { ScreenHeader } from '@/components/screen-header';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { WatchHistoryRecord } from '@/models/user-data';
import { watchHistoryFolderKey } from '@/utils/media-groups';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function WatchHistoryFolderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string; title?: string }>();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const { watchHistory, deleteWatchHistory } = useUserData();
  const folderKey = firstParam(params.key) ?? '';
  const title = firstParam(params.title) ?? '观看记录';

  const folderHistory = useMemo(() => {
    return watchHistory.filter((item) => watchHistoryFolderKey(item) === folderKey);
  }, [watchHistory, folderKey]);

  const handlePress = useCallback((item: WatchHistoryRecord) => {
    router.push({
      pathname: '/player',
      params: {
        url: item.episodeUrl,
        title: `${item.vodName}${item.episodeName ? ` - ${item.episodeName}` : ''}`,
        vodId: item.vodId ? String(item.vodId) : '',
        siteUrl: item.siteUrl,
        detailUrl: item.detailUrl,
        episodeName: item.episodeName,
        vodName: item.vodName,
        sourceName: item.sourceName,
      },
    });
  }, [router]);

  const renderItem = ({ item }: { item: WatchHistoryRecord }) => (
    <Pressable
      style={({ pressed }) => [styles.row, { borderBottomColor: palette.border }, pressed && { opacity: 0.65 }]}
      onPress={() => handlePress(item)}>
      <Clock size={18} color={palette.secondaryText} strokeWidth={1.75} />
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{item.episodeName || '继续观看'}</Text>
        <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>{item.sourceName || '默认线路'}</Text>
      </View>
      <Pressable style={styles.iconButton} onPress={() => deleteWatchHistory(item.id)} hitSlop={8}>
        <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title={title} subtitle={`${folderHistory.length} 条观看记录`} />
      {folderHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无观看记录</Text>
        </View>
      ) : (
        <FlashList
          data={folderHistory}
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
