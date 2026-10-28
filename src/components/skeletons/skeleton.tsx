import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme, useThemeName } from '@/hooks/use-theme';
import { LinearGradient } from 'expo-linear-gradient';
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

const ShimmerContext = createContext<Animated.Value | null>(null);

export function SkeletonGroup({ children }: { children: React.ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1250,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    progress.setValue(0);
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  return (
    <ShimmerContext.Provider value={reducedMotion ? null : progress}>
      {children}
    </ShimmerContext.Provider>
  );
}

type SkeletonBlockProps = {
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({ style }: SkeletonBlockProps) {
  const progress = useContext(ShimmerContext);
  const colors = useTheme();
  const themeName = useThemeName();
  const [width, setWidth] = useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== width) setWidth(nextWidth);
  };

  const translateX = progress?.interpolate({
    inputRange: [0, 1],
    outputRange: [-Math.max(width, 120), Math.max(width, 120)],
  });
  const shimmerColors = themeName === 'dark'
    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.11)', 'rgba(255,255,255,0)'] as const
    : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'] as const;

  return (
    <View
      onLayout={handleLayout}
      style={[styles.block, { backgroundColor: colors.backgroundElement }, style, styles.square]}>
      {progress ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmerBand, { transform: [{ translateX: translateX! }] }]}>
          <LinearGradient
            colors={shimmerColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.gradient}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
  square: {
    borderRadius: 0,
  },
  shimmerBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '58%',
  },
  gradient: {
    flex: 1,
  },
});
