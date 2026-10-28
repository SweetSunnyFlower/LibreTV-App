import { SkeletonBlock, SkeletonGroup } from '@/components/skeletons/skeleton';
import { useTheme } from '@/hooks/use-theme';
import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';

interface AppImageProps {
  uri?: string;
  headers?: Record<string, string>;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

export function AppImage({ uri, headers, style, contentFit = 'cover', transition = 200 }: AppImageProps) {
  const colors = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [uri]);

  const showSkeleton = !uri || !loaded || failed;

  return (
    <SkeletonGroup>
      <View style={[styles.container, { backgroundColor: colors.backgroundElement }, style]}>
        {uri && !failed ? (
          <Image
            source={{ uri, headers }}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            transition={transition}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : null}
        {showSkeleton ? <SkeletonBlock style={StyleSheet.absoluteFill} /> : null}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
