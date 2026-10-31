import { ScreenHeader } from '@/components/screen-header';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { FavoriteRecord, LiveFavoriteRecord } from '@/models/user-data';
import { normalizeImageUrl } from '@/utils/image-url';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Trash2, Tv } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type FavoriteRow =
  | { type: 'vod'; item: FavoriteRecord; updatedAt: number }
  | { type: 'live'; item: LiveFavoriteRecord; updatedAt: number };

export default function FavoritesScreen() {
  const router = useRouter();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { favorites, liveFavorites, toggleFavorite, toggleLiveFavorite, isHydrating } = useUserData();

  const rows = useMemo<FavoriteRow[]>(() => {
    const vod = favorites.map((item) => ({ type: 'vod' as const, item, updatedAt: item.updatedAt }));
    const live = liveFavorites.map((item) => ({ type: 'live' as const, item, updatedAt: item.updatedAt }));
    return [...vod, ...live].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [favorites, liveFavorites]);

  const handleVodPress = useCallback((item: FavoriteRecord) => {
    router.push({
      pathname: '/detail',
      params: { id: String(item.vodId), siteUrl: item.siteUrl, detailUrl: item.detailUrl },
    });
  }, [router]);

  const handleLivePress = useCallback((item: LiveFavoriteRecord) => {
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

  const removeVod = useCallback((item: FavoriteRecord) => {
    void toggleFavorite({
      siteUrl: item.siteUrl,
      detailUrl: item.detailUrl,
      vodId: item.vodId,
      vodName: item.vodName,
      vodPic: item.vodPic,
      vodYear: item.vodYear,
      vodArea: item.vodArea,
      vodRemarks: item.vodRemarks,
      typeName: item.typeName,
    });
  }, [toggleFavorite]);

  const removeLive = useCallback((item: LiveFavoriteRecord) => {
    void toggleLiveFavorite({
      kind: item.kind,
      channelId: item.channelId,
      channelName: item.channelName,
      channelUrl: item.channelUrl,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      logo: item.logo,
    });
  }, [toggleLiveFavorite]);

  const renderItem = useCallback(({ item }: { item: FavoriteRow }) => {
    if (item.type === 'live') {
      return (
        <View style={[styles.row, { borderBottomColor: palette.border }]}>
          <View style={[styles.avatar, { backgroundColor: palette.segmentBackground }]}>
            <Tv size={18} color={palette.secondaryText} strokeWidth={1.6} />
          </View>
          <Pressable style={styles.rowMain} onPress={() => handleLivePress(item.item)}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{item.item.channelName}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.badge, { color: palette.accent, borderColor: palette.accent }]}>直播</Text>
              <Text style={[styles.meta, { color: palette.secondaryText }]} numberOfLines={1}>{item.item.sourceName || '我的直播源'}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => removeLive(item.item)} hitSlop={8}>
            <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.row, { borderBottomColor: palette.border }]}>
        <View style={[styles.poster, { backgroundColor: palette.segmentBackground }]}>
          {item.item.vodPic ? (
            <Image
              source={{ uri: normalizeImageUrl(item.item.vodPic, item.item.siteUrl) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
        </View>
        <Pressable style={styles.rowMain} onPress={() => handleVodPress(item.item)}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{item.item.vodName}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.badge, { color: palette.secondaryText, borderColor: palette.border }]}>影视</Text>
            <Text style={[styles.meta, { color: palette.secondaryText }]} numberOfLines={1}>
              {item.item.vodRemarks || [item.item.typeName, item.item.vodYear, item.item.vodArea].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => removeVod(item.item)} hitSlop={8}>
          <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
        </Pressable>
      </View>
    );
  }, [handleLivePress, handleVodPress, palette, removeLive, removeVod]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title="我的收藏" subtitle={isHydrating ? undefined : `${rows.length} 个收藏`} />
      {isHydrating ? (
        <ListSkeleton rows={5} variant="site" contentContainerStyle={styles.listContent} />
      ) : rows.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无收藏</Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => (item.type === 'live' ? `live-${item.item.id}` : `vod-${item.item.id}`)}
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
  poster: {
    width: 44,
    height: 44,
    borderRadius: 0,
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
