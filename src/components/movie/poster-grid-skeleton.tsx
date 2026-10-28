import { POSTER_GRID_COLUMNS, POSTER_GRID_GAP, POSTER_GRID_ITEM_HEIGHT, POSTER_GRID_ITEM_WIDTH } from '@/components/movie/minimal-poster-card';
import { SkeletonBlock, SkeletonGroup } from '@/components/skeletons/skeleton';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

const SKELETON_ITEMS = Array.from({ length: 18 }, (_, index) => `skeleton-${index}`);

type PosterGridSkeletonProps = {
  contentContainerStyle?: object;
};

export function PosterGridSkeleton({ contentContainerStyle }: PosterGridSkeletonProps) {
  return (
    <SkeletonGroup>
      <FlashList
        style={styles.list}
        data={SKELETON_ITEMS}
        keyExtractor={(item) => item}
        numColumns={POSTER_GRID_COLUMNS}
        key="poster-grid-skeleton"
        contentContainerStyle={[styles.content, contentContainerStyle]}
        renderItem={({ index }) => (
          <View style={index % POSTER_GRID_COLUMNS !== POSTER_GRID_COLUMNS - 1 && styles.gap}>
            <SkeletonBlock style={styles.item} />
          </View>
        )}
      />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingTop: 1,
    paddingBottom: 136,
  },
  item: {
    width: POSTER_GRID_ITEM_WIDTH,
    height: POSTER_GRID_ITEM_HEIGHT,
    marginBottom: POSTER_GRID_GAP,
    overflow: 'hidden',
  },
  gap: {
    marginRight: POSTER_GRID_GAP,
  },
});
