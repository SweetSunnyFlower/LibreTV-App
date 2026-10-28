import React from 'react';
import { StyleSheet } from 'react-native';
import { PosterOverlayCard } from '@/components/movie/poster-overlay-card';
import { Spacing } from '@/constants/theme';
import { DOUBAN_IMAGE_HEADERS } from '@/utils/image-url';
import type { DoubanMovie } from '@/models/douban';

interface MovieCardProps {
  movie: DoubanMovie;
  onPress: (movie: DoubanMovie) => void;
  columns?: number;
}

export function MovieCard({ movie, onPress, columns = 2 }: MovieCardProps) {
  return (
    <PosterOverlayCard
      imageUrl={movie.cover}
      imageHeaders={DOUBAN_IMAGE_HEADERS}
      title={movie.title}
      accentTag={movie.rate && movie.rate !== '0' ? movie.rate : undefined}
      onPress={() => onPress(movie)}
      style={[styles.card, { width: `${100 / columns}%` }]}
      compact={columns >= 3}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.one,
  },
});
