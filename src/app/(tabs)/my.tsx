import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useDownloads } from '@/context/download-context';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';
import { BarChart3, ChevronRight, Clock, Download, Heart, Search, Settings, type LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { downloads, isHydrating: downloadsHydrating } = useDownloads();
  const {
    favorites,
    liveFavorites,
    searchHistory,
    watchHistory,
    liveWatchHistory,
    isHydrating: userDataHydrating,
  } = useUserData();
  const isHydrating = downloadsHydrating || userDataHydrating;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: palette.text }]}>我的</Text>
          <Pressable onPress={() => router.push('/mine/settings')} hitSlop={10}>
            <Settings size={21} color={palette.text} strokeWidth={1.8} />
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: palette.secondaryText }]}>收藏、历史记录和下载内容都在这里</Text>

        {isHydrating ? (
          <View style={[styles.menuList, { borderColor: palette.border }]}>
            <ListSkeleton rows={4} variant="menu" />
          </View>
        ) : (
          <View style={[styles.menuList, { borderColor: palette.border }]}>
            <MenuItem
              title="我的收藏"
              subtitle="已收藏的影视"
              count={favorites.length + liveFavorites.length}
              icon={Heart}
              onPress={() => router.push('/mine/favorites')}
              palette={palette}
            />
            <MenuItem
              title="搜索历史"
              subtitle="最近搜索过的关键词"
              count={searchHistory.length}
              icon={Search}
              onPress={() => router.push('/mine/search-history')}
              palette={palette}
            />
            <MenuItem
              title="观看历史"
              subtitle="继续上次观看"
              count={watchHistory.length + liveWatchHistory.length}
              icon={Clock}
              onPress={() => router.push('/mine/watch-history')}
              palette={palette}
            />
            <MenuItem
              title="播放统计"
              subtitle="最常看的频道和最近观看时间轴"
              count={watchHistory.length + liveWatchHistory.length}
              icon={BarChart3}
              onPress={() => router.push('/mine/playback-stats')}
              palette={palette}
            />
            <MenuItem
              title="我的下载"
              subtitle="下载任务和离线内容"
              count={downloads.length}
              icon={Download}
              onPress={() => router.push('/mine/downloads')}
              palette={palette}
              last
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MenuItem({
  title,
  subtitle,
  count,
  icon: Icon,
  onPress,
  palette,
  last,
}: {
  title: string;
  subtitle: string;
  count: number;
  icon: LucideIcon;
  onPress: () => void;
  palette: typeof lightPalette;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        { borderBottomColor: palette.border },
        last && styles.lastMenuItem,
        pressed && { opacity: 0.65 },
      ]}
      onPress={onPress}>
      <Icon size={19} color={palette.secondaryText} strokeWidth={1.75} />
      <View style={styles.menuText}>
        <Text style={[styles.menuTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.menuSubtitle, { color: palette.secondaryText }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={[styles.count, { color: palette.secondaryText }]}>{count}</Text>
      <ChevronRight size={17} color={palette.secondaryText} strokeWidth={1.8} />
    </Pressable>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 136,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  menuList: {
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuItem: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuText: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  menuSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  count: {
    minWidth: 24,
    textAlign: 'right',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
});
