import React from 'react';
import { MinimalPosterCard } from '@/components/movie/minimal-poster-card';
import { CMS_IMAGE_HEADERS, normalizeImageUrl } from '@/utils/image-url';
import type { VodItem } from '@/models/vod';

interface VodCardProps {
  vod: VodItem;
  onPress: (vod: VodItem) => void;
  baseUrl?: string;
  index?: number;
  topRight?: React.ReactNode;
}

export function VodCard({ vod, onPress, baseUrl, index = 0, topRight }: VodCardProps) {
  const meta = vod.vod_remarks || [vod.vod_year, vod.vod_area, vod.type_name].filter(Boolean).join(' · ');

  return (
    <MinimalPosterCard
      imageUrl={normalizeImageUrl(vod.vod_pic, baseUrl)}
      imageHeaders={CMS_IMAGE_HEADERS}
      title={vod.vod_name}
      meta={meta}
      index={index}
      onPress={() => onPress(vod)}
      topRight={topRight}
    />
  );
}
