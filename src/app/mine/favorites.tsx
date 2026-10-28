import { MinimalPosterCard } from '@/components/movie/minimal-poster-card';
import { PosterGridSkeleton } from '@/components/movie/poster-grid-skeleton';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import type { FavoriteRecord } from '@/models/user-data';
import { CMS_IMAGE_HEADERS, normalizeImageUrl } from '@/utils/image-url';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const NUM_COLUMNS = 3;

export default function FavoritesScreen() {
  const router = useRouter();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { favorites, toggleFavorite, isHydrating } = useUserData();

  const handlePress = useCallback((item: FavoriteRecord) => {
    router.push({
      pathname: '/detail',
      params: { id: String(item.vodId), siteUrl: item.siteUrl, detailUrl: item.detailUrl },
    });
  }, [router]);

  const handleRemove = useCallback((item: FavoriteRecord) => {
    toggleFavorite({
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

  const renderItem = ({ item, index }: { item: FavoriteRecord; index: number }) => (
    <MinimalPosterCard
      imageUrl={normalizeImageUrl(item.vodPic, item.siteUrl)}
      imageHeaders={CMS_IMAGE_HEADERS}
      title={item.vodName}
      meta={item.vodRemarks || [item.typeName, item.vodYear, item.vodArea].filter(Boolean).join(' · ')}
      index={index}
      onPress={() => handlePress(item)}
      topRight={
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          onPress={() => handleRemove(item)}
          hitSlop={8}>
          <Trash2 size={15} color="#fff" strokeWidth={1.8} />
        </Pressable>
      }
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title="我的收藏" subtitle={isHydrating ? undefined : `${favorites.length} 个收藏`} />
      {isHydrating ? (
        <PosterGridSkeleton contentContainerStyle={styles.listContent} />
      ) : favorites.length === 0 ? (
        <EmptyState text="暂无收藏" />
      ) : (
        <FlashList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={NUM_COLUMNS}
          key="favorites-poster-grid"
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyContainer}>
      <ThemedText type="defaultSemiBold" themeColor="textSecondary" style={styles.emptyText}>{text}</ThemedText>
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
};

const darkPalette = {
  background: '#0F0F0F',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingTop: 1,
    paddingBottom: 136,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.42)',
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
    marginTop: 8,
  },
});
