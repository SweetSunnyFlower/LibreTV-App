import { ScreenHeader } from '@/components/screen-header';
import { useUserData } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

export default function PlaybackStatsScreen() {
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const { watchHistory, liveWatchHistory } = useUserData();

  const topLiveChannels = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of liveWatchHistory) {
      const current = counts.get(item.channelName) ?? { name: item.channelName, count: 0 };
      current.count += 1;
      counts.set(item.channelName, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [liveWatchHistory]);

  const timeline = useMemo(() => {
    const rows = [
      ...watchHistory.map((item) => ({
        key: `vod-${item.id}`,
        title: item.vodName,
        meta: item.episodeName || '影视',
        updatedAt: item.updatedAt,
      })),
      ...liveWatchHistory.map((item) => ({
        key: `live-${item.id}`,
        title: item.channelName,
        meta: '直播',
        updatedAt: item.updatedAt,
      })),
    ];
    return rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  }, [liveWatchHistory, watchHistory]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title="播放统计" subtitle="最常看频道与最近观看时间轴" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>最常看的直播频道</Text>
        {topLiveChannels.length === 0 ? (
          <Text style={[styles.empty, { color: palette.secondaryText }]}>暂无直播播放记录</Text>
        ) : (
          <View style={[styles.topList, { borderColor: palette.border }]}>
            {topLiveChannels.map((item, index) => (
              <View key={item.name} style={[styles.topRow, { borderBottomColor: palette.border }]}>
                <Text style={[styles.topRank, { color: palette.secondaryText }]}>{index + 1}</Text>
                <Text style={[styles.topName, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.topCount, { color: palette.secondaryText }]}>{item.count} 次</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: palette.text }]}>最近观看时间轴</Text>
        {timeline.length === 0 ? (
          <Text style={[styles.empty, { color: palette.secondaryText }]}>暂无观看记录</Text>
        ) : (
          <View style={[styles.timeline, { borderColor: palette.border }]}>
            {timeline.map((item) => (
              <View key={item.key} style={[styles.timelineRow, { borderBottomColor: palette.border }]}>
                <View style={styles.timelineText}>
                  <Text style={[styles.timelineTitle, { color: palette.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.timelineMeta, { color: palette.secondaryText }]} numberOfLines={1}>{item.meta}</Text>
                </View>
                <Text style={[styles.timelineTime, { color: palette.secondaryText }]}>{formatTimestamp(item.updatedAt)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
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
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  topList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRank: {
    width: 20,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  topName: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  topCount: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  timeline: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timelineRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timelineText: {
    flex: 1,
    minWidth: 0,
  },
  timelineTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  timelineMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  timelineTime: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
