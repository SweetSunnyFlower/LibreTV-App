import { AppImage } from '@/components/app-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

export const POSTER_GRID_GAP = 1;
export const POSTER_GRID_COLUMNS = 3;
export const POSTER_GRID_ITEM_WIDTH = (Dimensions.get('window').width - POSTER_GRID_GAP * (POSTER_GRID_COLUMNS - 1)) / POSTER_GRID_COLUMNS;
export const POSTER_GRID_ITEM_HEIGHT = POSTER_GRID_ITEM_WIDTH * 1.48;

type MinimalPosterCardProps = {
  imageUrl?: string;
  imageHeaders?: Record<string, string>;
  title: string;
  meta?: string;
  index?: number;
  onPress: () => void;
  topRight?: ReactNode;
};

function MinimalPosterCardComponent({ imageUrl, imageHeaders, title, meta, index = 0, onPress, topRight }: MinimalPosterCardProps) {
  const isLastColumn = index % POSTER_GRID_COLUMNS === POSTER_GRID_COLUMNS - 1;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        !isLastColumn && styles.cardGap,
        pressed && styles.pressed,
      ]}>
      <AppImage uri={imageUrl} headers={imageHeaders} style={styles.poster} />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.78)']}
        locations={[0, 0.38, 1]}
        style={styles.overlay}
      />
      <View pointerEvents="none" style={styles.info}>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
      </View>
      {topRight ? <View style={styles.topRight}>{topRight}</View> : null}
    </Pressable>
  );
}

export const MinimalPosterCard = memo(MinimalPosterCardComponent);

const styles = StyleSheet.create({
  card: {
    width: POSTER_GRID_ITEM_WIDTH,
    height: POSTER_GRID_ITEM_HEIGHT,
    marginBottom: POSTER_GRID_GAP,
    overflow: 'hidden',
    backgroundColor: '#EDEDED',
  },
  cardGap: {
    marginRight: POSTER_GRID_GAP,
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
  },
  info: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
  },
  meta: {
    marginBottom: 3,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  topRight: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  pressed: {
    opacity: 0.82,
  },
});
