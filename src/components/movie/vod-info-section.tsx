import { useThemeName } from '@/hooks/use-theme';
import type { VodDetail } from '@/models/vod';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface VodInfoSectionProps {
  detail?: VodDetail | null;
  fallbackTitle?: string;
  episodeName?: string;
  compact?: boolean;
  contentNumberOfLines?: number;
  right?: ReactNode;
}

function cleanText(value?: string | null) {
  return value?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() ?? '';
}

export function VodInfoSection({
  detail,
  fallbackTitle,
  episodeName,
  compact = false,
  contentNumberOfLines = 4,
  right,
}: VodInfoSectionProps) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflow, setDescriptionOverflow] = useState(false);
  const title = detail?.vod_name || fallbackTitle || '正在播放';
  const description = cleanText(detail?.vod_content);
  const descriptionLines = descriptionExpanded ? undefined : contentNumberOfLines;
  const metaItems = [detail?.vod_year, detail?.vod_area, detail?.type_name, detail?.vod_remarks, detail?.vod_lang].filter(Boolean) as string[];

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <View style={styles.titleRow}>
        <Text style={[styles.titleText, compact && styles.compactTitle, { color: palette.text }]} numberOfLines={2}>
          {title}
        </Text>
        {right ? <View style={styles.titleRight}>{right}</View> : null}
      </View>

      {episodeName ? <Text style={[styles.inlineMeta, { color: palette.secondaryText }]}>正在播放：{episodeName}</Text> : null}
      {metaItems.length > 0 ? <Text style={[styles.inlineMeta, { color: palette.secondaryText }]}>{metaItems.join(' · ')}</Text> : null}

      {detail?.vod_director ? <InfoRow label="导演" value={detail.vod_director} palette={palette} /> : null}
      {detail?.vod_actor ? <InfoRow label="演员" value={detail.vod_actor} palette={palette} numberOfLines={compact ? 3 : undefined} /> : null}

      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: palette.secondaryText }]}>简介</Text>
        <View style={styles.descriptionValue}>
          <Text style={[styles.infoValue, { color: palette.text }]} numberOfLines={descriptionLines}>
            {description || '暂无影片简介'}
          </Text>
          <Text
            style={styles.measureDescription}
            onTextLayout={(event) => {
              setDescriptionOverflow(event.nativeEvent.lines.length > contentNumberOfLines);
            }}>
            {description || '暂无影片简介'}
          </Text>
          {descriptionOverflow ? (
            <Pressable
              style={styles.expandButton}
              onPress={() => setDescriptionExpanded((value) => !value)}>
              {descriptionExpanded ? (
                <ChevronUp size={16} color={palette.secondaryText} />
              ) : (
                <ChevronDown size={16} color={palette.secondaryText} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function InfoRow({ label, value, palette, numberOfLines }: { label: string; value: string; palette: typeof lightPalette; numberOfLines?: number }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: palette.secondaryText }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: palette.text }]} numberOfLines={numberOfLines}>{value}</Text>
    </View>
  );
}

const lightPalette = {
  text: '#111111',
  secondaryText: '#8A8A8A',
};

const darkPalette = {
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 12,
  },
  compactContainer: {
    paddingTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleText: {
    flex: 1,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  titleRight: {
    flexShrink: 0,
  },
  compactTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  inlineMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  infoLabel: {
    width: 34,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '800',
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  descriptionValue: {
    flex: 1,
  },
  measureDescription: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
  },
  expandButton: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
