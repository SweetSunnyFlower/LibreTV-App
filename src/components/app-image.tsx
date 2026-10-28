import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { ImageIcon } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

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
      {showSkeleton ? (
        <View style={[styles.skeleton, { backgroundColor: colors.backgroundElement }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.card }]}>
            <ImageIcon size={22} color={colors.textSecondary} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  skeleton: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.72,
  },
});
