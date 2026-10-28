import { useThemeName } from '@/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface TagSelectorProps {
  tags: string[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
}

const TAG_GAP = 20;
const UNDERLINE_WIDTH = 16;

type TabMetric = {
  x: number;
  width: number;
};

export function TagSelector({ tags, selectedTag, onSelectTag }: TagSelectorProps) {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const textColor = isDark ? '#FAFAFA' : '#111111';
  const mutedColor = isDark ? '#8E8E8E' : '#8A8A8A';
  const underlineX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [metrics, setMetrics] = useState<Record<string, TabMetric>>({});
  const selectedIndex = useMemo(() => Math.max(0, tags.indexOf(selectedTag)), [selectedTag, tags]);

  const selectTag = useCallback(
    (tag: string) => {
      if (tag && tag !== selectedTag) {
        onSelectTag(tag);
      }
    },
    [onSelectTag, selectedTag]
  );

  useEffect(() => {
    const metric = metrics[selectedTag];
    if (!metric) return;
    const nextX = metric.x + (metric.width - UNDERLINE_WIDTH) / 2;

    Animated.timing(underlineX, {
      toValue: nextX,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    scrollRef.current?.scrollTo({
      x: Math.max(0, metric.x - 24),
      animated: true,
    });
  }, [metrics, selectedTag, underlineX]);

  if (!tags.length) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.tabsRow}>
          {tags.map((tag, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Pressable
                key={tag}
                style={styles.tabButton}
                onPress={() => selectTag(tag)}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  setMetrics((current) => {
                    const previous = current[tag];
                    if (previous?.x === x && previous.width === width) return current;
                    return { ...current, [tag]: { x, width } };
                  });
                }}
                hitSlop={10}>
                <Text style={[styles.tabText, { color: isSelected ? textColor : mutedColor }]} numberOfLines={1}>
                  {tag}
                </Text>
              </Pressable>
            );
          })}
          <Animated.View
            style={[
              styles.underline,
              {
                backgroundColor: textColor,
                transform: [{ translateX: underlineX }],
              },
            ]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: TAG_GAP,
    minHeight: 30,
    position: 'relative',
  },
  tabButton: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tabText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  underline: {
    position: 'absolute',
    left: 0,
    top: 22,
    width: UNDERLINE_WIDTH,
    height: 4,
    borderRadius: 4,
  },
});
