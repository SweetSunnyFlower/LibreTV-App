import { TagSelector } from '@/components/movie/tag-selector';
import { useThemeName } from '@/hooks/use-theme';
import type { Episode } from '@/models/vod';
import { Play } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface EpisodeListProps {
  episodes: Episode[];
  vodName: string;
  activeEpisode?: Episode | null;
  onPlay: (episode: Episode) => void;
  onDownload: (vodName: string, episode: Episode) => void;
}

export const EPISODE_LIST_LAYOUT = {
  marginTop: 18,
  sectionGap: 12,
  horizontalPadding: 16,
  columns: 3,
  gap: 1,
  itemWidth: '33.02%',
  buttonHeight: 38,
} as const;

function isSameEpisode(episode: Episode, activeEpisode?: Episode | null) {
  if (!activeEpisode) return false;
  return episode.url === activeEpisode.url || (
    episode.name === activeEpisode.name &&
    (episode.sourceIndex ?? 0) === (activeEpisode.sourceIndex ?? 0)
  );
}

export function EpisodeList({ episodes, vodName, activeEpisode, onPlay, onDownload }: EpisodeListProps) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const sources = useMemo(() => {
    const seen = new Map<number, string>();
    episodes.forEach((episode) => {
      const index = episode.sourceIndex ?? 0;
      if (!seen.has(index)) seen.set(index, episode.source || `线路 ${index + 1}`);
    });
    return Array.from(seen.entries()).map(([index, name]) => ({ index, name }));
  }, [episodes]);
  const [activeSource, setActiveSource] = useState(sources[0]?.index ?? 0);
  const activeEpisodeSource = activeEpisode?.sourceIndex ?? 0;

  const [prevActiveEpisode, setPrevActiveEpisode] = useState(activeEpisode);
  const [prevActiveEpisodeSource, setPrevActiveEpisodeSource] = useState(activeEpisodeSource);
  const [syncedInitial, setSyncedInitial] = useState(false);
  if (!syncedInitial || prevActiveEpisode !== activeEpisode || prevActiveEpisodeSource !== activeEpisodeSource) {
    setSyncedInitial(true);
    setPrevActiveEpisode(activeEpisode);
    setPrevActiveEpisodeSource(activeEpisodeSource);
    if (activeEpisode) setActiveSource(activeEpisodeSource);
  }

  const visibleEpisodes = sources.length > 1
    ? episodes.filter((episode) => (episode.sourceIndex ?? 0) === activeSource)
    : episodes;
  const sourceNames = sources.map((source) => source.name);
  const selectedSourceName = sources.find((source) => source.index === activeSource)?.name ?? sourceNames[0] ?? '';

  if (episodes.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>播放列表</Text>
        <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无播放资源</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>选集播放</Text>
        <Text style={[styles.headerMeta, { color: palette.secondaryText }]}>共 {visibleEpisodes.length} 集 · 长按下载</Text>
      </View>

      {sources.length > 1 ? (
        <TagSelector
          tags={sourceNames}
          selectedTag={selectedSourceName}
          onSelectTag={(name) => {
            const source = sources.find((item) => item.name === name);
            if (source) setActiveSource(source.index);
          }}
        />
      ) : null}

      <View style={styles.grid}>
        {visibleEpisodes.map((episode, index) => {
          const active = isSameEpisode(episode, activeEpisode);
          return (
            <View key={`${episode.sourceIndex ?? 0}-${episode.name}-${index}`} style={styles.episodeCell}>
              <Pressable
                style={({ pressed }) => [
                  styles.episodeButton,
                  { borderColor: active ? palette.text : palette.border },
                  active && { backgroundColor: palette.text },
                  pressed && !active && { opacity: 0.65 },
                ]}
                disabled={active}
                onPress={() => {
                  if (!active) onPlay(episode);
                }}
                onLongPress={() => onDownload(vodName, episode)}>
                {active ? <Play size={12} color={palette.inverseText} fill={palette.inverseText} /> : null}
                <Text
                  numberOfLines={1}
                  style={[styles.episodeText, { color: active ? palette.inverseText : palette.text }]}>
                  {episode.name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const lightPalette = {
  text: '#111111',
  inverseText: '#FFFFFF',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
};

const darkPalette = {
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
};

const styles = StyleSheet.create({
  container: {
    marginTop: EPISODE_LIST_LAYOUT.marginTop,
    gap: EPISODE_LIST_LAYOUT.sectionGap,
  },
  headerRow: {
    paddingHorizontal: EPISODE_LIST_LAYOUT.horizontalPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  headerMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  grid: {
    paddingHorizontal: EPISODE_LIST_LAYOUT.horizontalPadding,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: EPISODE_LIST_LAYOUT.gap,
    columnGap: EPISODE_LIST_LAYOUT.gap,
  },
  episodeCell: {
    width: EPISODE_LIST_LAYOUT.itemWidth,
  },
  episodeButton: {
    minHeight: EPISODE_LIST_LAYOUT.buttonHeight,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
  },
  episodeText: {
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  emptyText: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
