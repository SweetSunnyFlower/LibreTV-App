import React from 'react';
import { Animated, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useThemeName } from '@/hooks/use-theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  floating?: boolean;
  right?: React.ReactNode;
  style?: StyleProp<Animated.WithAnimatedValue<ViewStyle>>;
}

export function ScreenHeader({ title, subtitle, floating = false, right, style }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useThemeName() === 'dark';
  const textColor = isDark ? '#FAFAFA' : '#111111';
  const mutedColor = isDark ? '#8E8E8E' : '#8A8A8A';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        floating && styles.floating,
        { paddingTop: insets.top + 8 },
        style,
      ]}>
      <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.72} hitSlop={8}>
        <ChevronLeft size={27} color={floating ? '#fff' : textColor} strokeWidth={2.15} />
      </TouchableOpacity>

      <View style={styles.titleGroup}>
        <ThemedText
          type="defaultSemiBold"
          numberOfLines={1}
          style={[styles.title, { color: floating ? '#fff' : textColor }]}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            type="small"
            numberOfLines={1}
            style={{ color: floating ? 'rgba(255,255,255,0.76)' : mutedColor }}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.rightSlot}>{right}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  floating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
});
