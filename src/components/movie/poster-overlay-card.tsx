import React from 'react';
import { Platform, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/components/app-image';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PosterOverlayCardProps {
  imageUrl?: string;
  imageHeaders?: Record<string, string>;
  title: string;
  subtitle?: string;
  tags?: string[];
  accentTag?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  topRight?: React.ReactNode;
  titleNumberOfLines?: number;
  compact?: boolean;
}

export function PosterOverlayCard({
  imageUrl,
  imageHeaders,
  title,
  subtitle,
  tags = [],
  accentTag,
  onPress,
  style,
  cardStyle,
  contentStyle,
  topRight,
  titleNumberOfLines = 2,
  compact = false,
}: PosterOverlayCardProps) {
  const colors = useTheme();
  const visibleTags = [accentTag, ...tags].filter(Boolean) as string[];

  return (
    <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.card, { backgroundColor: colors.card }, cardStyle]}>
        <AppImage
          uri={imageUrl}
          headers={imageHeaders}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.45, 1]}
          style={styles.gradient}
        />
        {topRight ? <View style={styles.topRight}>{topRight}</View> : null}
        <View style={[styles.content, compact && styles.compactContent, contentStyle]}>
          {visibleTags.length > 0 ? (
            <View style={styles.tagRow}>
              {visibleTags.map((tag, index) => (
                <View
                  key={`${tag}-${index}`}
                  style={[
                    styles.tag,
                    { backgroundColor: index === 0 && accentTag ? colors.accent : 'rgba(255,255,255,0.2)' },
                  ]}>
                  <ThemedText type="smallBold" style={[styles.tagText, compact && styles.compactTagText]} numberOfLines={1}>
                    {tag}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
          <ThemedText type="smallBold" style={[styles.title, compact && styles.compactTitle]} numberOfLines={titleNumberOfLines}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" style={[styles.subtitle, compact && styles.compactSubtitle]} numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 2 / 3,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 3 },
      web: { boxShadow: '0 10px 28px rgba(0,0,0,0.12)' },
    }),
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
  },
  topRight: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
  },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  compactContent: {
    padding: Spacing.one + 2,
    gap: Spacing.half,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tag: {
    maxWidth: '100%',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.five,
  },
  tagText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
  compactTagText: {
    fontSize: 9,
    lineHeight: 12,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
  },
  compactTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 16,
  },
  compactSubtitle: {
    fontSize: 10,
    lineHeight: 13,
  },
});
