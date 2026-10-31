import { useThemeName } from '@/hooks/use-theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function LivePlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const name = firstParam(params.name) ?? '频道';

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/tv'))} hitSlop={8}>
          <ChevronLeft size={27} color={palette.text} strokeWidth={2.15} />
        </Pressable>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{name}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.placeholder, { color: palette.secondaryText }]}>播放页开发中</Text>
      </View>
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  secondaryText: '#8A8A8A',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
