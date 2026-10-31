import { ScreenHeader } from '@/components/screen-header';
import { useThemeName } from '@/hooks/use-theme';
import { getEpgGuide, type IptvEpgGuideRow } from '@/services/iptv-library';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function EpgScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ country?: string }>();
  const country = firstParam(params.country) ?? 'CN';
  const themeName = useThemeName();
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  const [rows, setRows] = useState<IptvEpgGuideRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const now = Math.floor(Date.now() / 1000);
    getEpgGuide(db, country, now - 2 * 3600, now + 12 * 3600)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '节目表加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [country, db]);

  const grouped = useMemo(() => {
    const map = new Map<string, IptvEpgGuideRow[]>();
    for (const row of rows) {
      const list = map.get(row.channelName) ?? [];
      list.push(row);
      map.set(row.channelName, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader title="电视节目表" subtitle={`${country.toUpperCase()} · 未来 12 小时`} />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Text style={[styles.error, { color: palette.danger }]}>{error}</Text>
        ) : grouped.length === 0 ? (
          <Text style={[styles.empty, { color: palette.secondaryText }]}>暂无 EPG 数据，请先同步在线频道库。</Text>
        ) : (
          grouped.map(([channelName, programmes]) => (
            <View key={channelName} style={styles.channelSection}>
              <Text style={[styles.channelName, { color: palette.text }]}>{channelName}</Text>
              <View style={[styles.programmeList, { borderColor: palette.border }]}>
                {programmes.map((programme) => (
                  <View key={`${programme.channel}-${programme.start}`} style={[styles.programmeRow, { borderBottomColor: palette.border }]}>
                    <Text style={[styles.time, { color: palette.secondaryText }]}>
                      {formatTime(programme.start)} - {formatTime(programme.stop)}
                    </Text>
                    <Text style={[styles.title, { color: palette.text }]}>{programme.title}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
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
  danger: '#D64545',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  danger: '#E57373',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  error: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 13, fontWeight: '500' },
  channelSection: { marginBottom: 18 },
  channelName: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  programmeList: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  programmeRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  time: {
    width: 92,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
});
