import { useThemeName } from '@/hooks/use-theme';
import { Tabs } from 'expo-router';
import { House, LayoutGrid, Search, Tv, UserRound, type LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RouteIconMap = Record<string, LucideIcon>;

const ROUTE_ICONS: RouteIconMap = {
  index: House,
  categories: LayoutGrid,
  'search-entry': Search,
  tv: Tv,
  my: UserRound,
};

const BAR_HORIZONTAL_PADDING = 16;
const ITEM_INNER_WIDTH = 52;
const UNDERLINE_WIDTH = 18;

function MinimalTabBar({ state, descriptors, emitter, navigateToTab }: any) {
  const themeName = useThemeName();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDark = themeName === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const progress = useRef(new Animated.Value(state.index)).current;
  const barWidth = width - BAR_HORIZONTAL_PADDING * 2;
  const itemWidth = barWidth / state.routes.length;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: state.index,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, state.index]);

  const underlineTranslateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: state.routes.map((_: unknown, index: number) => index),
        outputRange: state.routes.map(
          (_: unknown, index: number) => index * itemWidth + (itemWidth - UNDERLINE_WIDTH) / 2
        ),
      }),
    [itemWidth, progress, state.routes]
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8),
          backgroundColor: palette.background,
        },
      ]}>
      <View style={[styles.bar, { width: barWidth }]}>
        {state.routes.map((route: any, index: number) => {
          const options = descriptors[route.key]?.options ?? {};
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const isFocused = state.index === index;
          const Icon = ROUTE_ICONS[route.name] ?? House;
          const color = isFocused ? palette.text : palette.secondaryText;

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          const onLongPress = () => {
            emitter.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.item, { width: itemWidth }]}
              hitSlop={8}>
              <View style={styles.itemInner}>
                <Icon size={21} strokeWidth={isFocused ? 1.95 : 1.65} color={color} />
                <Text style={[styles.label, isFocused && styles.labelFocused, { color }]} numberOfLines={1}>
                  {String(label)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.underline,
            {
              backgroundColor: palette.text,
              transform: [{ translateX: underlineTranslateX }],
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <MinimalTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen name="index" options={{ title: '首页' }} />
      <Tabs.Screen name="categories" options={{ title: '分类' }} />
      <Tabs.Screen name="search-entry" options={{ title: '搜索' }} />
      <Tabs.Screen name="tv" options={{ title: '电视' }} />
      <Tabs.Screen name="my" options={{ title: '我的' }} />
    </Tabs>
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
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 7,
    alignItems: 'center',
  },
  bar: {
    height: 54,
    flexDirection: 'row',
    position: 'relative',
  },
  item: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInner: {
    width: ITEM_INNER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  labelFocused: {
    fontWeight: '800',
  },
  underline: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: UNDERLINE_WIDTH,
    height: 4,
    borderRadius: 4,
  },
});
