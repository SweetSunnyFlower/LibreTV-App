import { MinimalPosterCard } from '@/components/movie/minimal-poster-card';
import type { DoubanContentType } from '@/constants/api';
import type { DoubanMovie } from '@/models/douban';
import { DOUBAN_IMAGE_HEADERS } from '@/utils/image-url';
import { memo } from 'react';

type HomeFeedCardProps = {
  movie: DoubanMovie;
  contentType: DoubanContentType;
  selectedTag?: string;
  index?: number;
  onPress: (movie: DoubanMovie) => void;
};

function HomeFeedCardComponent({ movie, index = 0, onPress }: HomeFeedCardProps) {
  const rating = movie.rate && movie.rate !== '0' ? `豆瓣 ${movie.rate}` : undefined;

  return (
    <MinimalPosterCard
      imageUrl={movie.cover}
      imageHeaders={DOUBAN_IMAGE_HEADERS}
      title={movie.title}
      meta={rating}
      index={index}
      onPress={() => onPress(movie)}
    />
  );
}

export const HomeFeedCard = memo(HomeFeedCardComponent);
