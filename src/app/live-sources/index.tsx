import { ScreenHeader } from '@/components/screen-header';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useAppDialog } from '@/context/app-dialog-context';
import { useIptv } from '@/context/iptv-context';
import { useThemeName } from '@/hooks/use-theme';
import type { IptvSource } from '@/models/iptv';
import { deleteIptvSource as dbDeleteIptvSource } from '@/services/database';
import { fetchTextWithTimeout } from '@/services/http';
import { parseM3U } from '@/utils/iptv';
import { createProbeQueue } from '@/utils/probe-queue';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Plus, Tv, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function LiveSourcesScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { sources, refreshSources, isHydrating } = useIptv();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const dialog = useAppDialog();
  const [availability, setAvailability] = useState<Record<number, { status: 'checking' | 'available' | 'unavailable'; count?: number }>>({});

  // 记录已检测过的 sourceId -> url，仅对新增或地址变化的源重新检测
  const checkedUrlsRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    const queue = createProbeQueue(3);
    const checked = checkedUrlsRef.current;
    const pending = new Map<number, string>();
    const ids = new Set(sources.map((source) => source.id));
    for (const id of checked.keys()) {
      if (!ids.has(id)) checked.delete(id);
    }

    for (const source of sources) {
      if (checked.get(source.id) === source.url) continue;
      checked.set(source.id, source.url);
      setAvailability((prev) => ({ ...prev, [source.id]: { status: 'checking' } }));
      void queue.run(async () => {
        if (controller.signal.aborted) return;
        try {
          const content = await fetchTextWithTimeout(source.url, { signal: controller.signal }, 10000);
          const count = parseM3U(content).length;
          if (!controller.signal.aborted) setAvailability((prev) => ({ ...prev, [source.id]: { status: 'available', count } }));
        } catch {
          if (!controller.signal.aborted) setAvailability((prev) => ({ ...prev, [source.id]: { status: 'unavailable' } }));
        }
      }).finally(() => {
        pending.delete(source.id);
      });
      pending.set(source.id, source.url);
    }
    return () => {
      controller.abort();
      // 被取消的检测下次需要重新执行
      for (const [id, url] of pending) {
        if (checked.get(id) === url) checked.delete(id);
      }
    };
  }, [sources]);

  const handleDelete = useCallback(
    (item: IptvSource) => {
      void dialog.confirm({
        title: '删除直播源',
        message: `确定删除「${item.name}」吗？`,
        confirmText: '删除',
        cancelText: '取消',
        destructive: true,
        onConfirm: async () => {
          await dbDeleteIptvSource(db, item.id);
          await refreshSources();
        },
      });
    },
    [db, dialog, refreshSources]
  );

  const handleEdit = useCallback(
    (item?: IptvSource) => {
      if (item) {
        router.push({ pathname: '/live-sources/edit', params: { id: String(item.id) } });
      } else {
        router.push('/live-sources/edit');
      }
    },
    [router]
  );

  const addButton = (
    <Pressable onPress={() => handleEdit()} hitSlop={10} style={styles.headerAction}>
      <Plus size={18} color={palette.text} strokeWidth={1.9} />
      <Text style={[styles.headerActionText, { color: palette.text }]}>添加</Text>
    </Pressable>
  );

  const renderItem = ({ item }: { item: IptvSource }) => {
    const status = availability[item.id];
    const statusLabel = status?.status === 'checking'
      ? '检测中…'
      : status?.status === 'available'
        ? `可用 · ${status.count ?? 0} 个频道`
        : status?.status === 'unavailable'
          ? '失效'
          : '未检测';
    const statusColor = status?.status === 'available'
      ? palette.success
      : status?.status === 'unavailable'
        ? palette.danger
        : palette.secondaryText;

    return (
      <View style={[styles.sourceItem, { borderBottomColor: palette.border }]}>
        <View style={styles.iconSlot}>
          <Tv size={18} color={palette.secondaryText} strokeWidth={1.75} />
        </View>
        <View style={styles.sourceTitleGroup}>
          <Text style={[styles.sourceName, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.sourceUrl, { color: palette.secondaryText }]} numberOfLines={1}>{item.url}</Text>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <View style={styles.sourceActions}>
          <Pressable onPress={() => handleEdit(item)} hitSlop={8}>
            <Text style={[styles.actionText, { color: palette.text }]}>编辑</Text>
          </Pressable>
          <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
            <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title="直播源管理"
        subtitle={isHydrating ? undefined : `${sources.length} 个直播源`}
        right={addButton}
      />
      <Text style={[styles.hintText, { color: palette.secondaryText }]}>
        直播源为 M3U 播放列表地址，用于电视直播频道。
      </Text>
      {isHydrating ? (
        <ListSkeleton rows={4} variant="site" contentContainerStyle={styles.listContent} />
      ) : sources.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Tv size={30} color={palette.secondaryText} strokeWidth={1.5} />
          <Text style={[styles.emptyText, { color: palette.secondaryText }]}>暂无直播源</Text>
          <Text style={[styles.emptyHint, { color: palette.secondaryText }]}>点击右上角「添加」输入 M3U 地址</Text>
        </View>
      ) : (
        <FlashList
          data={sources}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  success: '#2E7D32',
  danger: '#C62828',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  success: '#81C784',
  danger: '#E57373',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerAction: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  listContent: {
    paddingBottom: 136,
  },
  hintText: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  sourceItem: {
    minHeight: 78,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  sourceName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  sourceUrl: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  statusText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  sourceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
});
