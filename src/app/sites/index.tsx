import { ScreenHeader } from '@/components/screen-header';
import { ListSkeleton } from '@/components/skeletons/page-skeletons';
import { useAppDialog } from '@/context/app-dialog-context';
import { useSite } from '@/context/site-context';
import { useThemeName } from '@/hooks/use-theme';
import type { CmsSite } from '@/models/site';
import { deleteSite as dbDeleteSite } from '@/services/database';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSQLiteContext } from 'expo-sqlite';
import { Check, Database, Plus, Trash2 } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function SitesScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { sites, site, setActiveSite, refreshSites, isHydrating } = useSite();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const dialog = useAppDialog();

  const handleSelect = useCallback(
    async (item: CmsSite) => {
      await setActiveSite(item.id);
      router.back();
    },
    [setActiveSite, router]
  );

  const handleDelete = useCallback(
    (item: CmsSite) => {
      if (sites.length <= 1) {
        void dialog.alert('无法删除', '至少需要保留一个站点。');
        return;
      }
      void dialog.confirm({
        title: '删除站点',
        message: `确定删除「${item.name}」吗？`,
        confirmText: '删除',
        cancelText: '取消',
        destructive: true,
        onConfirm: async () => {
          await dbDeleteSite(db, item.id);
          await refreshSites();
        },
      });
    },
    [db, dialog, refreshSites, sites.length]
  );

  const handleEdit = useCallback(
    (item?: CmsSite) => {
      if (item) {
        router.push({ pathname: '/sites/edit', params: { id: String(item.id) } });
      } else {
        router.push('/sites/edit');
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

  const renderItem = ({ item }: { item: CmsSite }) => {
    const isActive = site?.id === item.id;

    return (
      <Pressable
        style={({ pressed }) => [styles.siteItem, { borderBottomColor: palette.border }, pressed && { opacity: 0.65 }]}
        onPress={() => handleSelect(item)}>
        <View style={styles.iconSlot}>
          {isActive ? <Check size={19} color={palette.text} strokeWidth={2} /> : <Database size={18} color={palette.secondaryText} strokeWidth={1.75} />}
        </View>
        <View style={styles.siteTitleGroup}>
          <View style={styles.siteNameRow}>
            <Text style={[styles.siteName, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
            {item.isDefault ? <Text style={[styles.badgeText, { color: palette.secondaryText }]}>预置</Text> : null}
          </View>
          <Text style={[styles.siteUrl, { color: palette.secondaryText }]} numberOfLines={1}>{item.url}</Text>
          {item.detail ? <Text style={[styles.siteUrl, { color: palette.secondaryText }]} numberOfLines={1}>详情 · {item.detail}</Text> : null}
        </View>
        <View style={styles.siteActions}>
          <Pressable onPress={() => handleEdit(item)} hitSlop={8}>
            <Text style={[styles.actionText, { color: palette.text }]}>编辑</Text>
          </Pressable>
          <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
            <Trash2 size={16} color={palette.secondaryText} strokeWidth={1.75} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title="站点管理"
        subtitle={isHydrating ? undefined : `${sites.length} 个资源站`}
        right={addButton}
      />
      <Text style={[styles.hintText, { color: palette.secondaryText }]}>
        选择资源站后，首页搜索和分类内容会使用该站点。
      </Text>
      {isHydrating ? (
        <ListSkeleton rows={5} variant="site" contentContainerStyle={styles.listContent} />
      ) : (
        <FlashList
          data={sites}
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
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
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
  siteItem: {
    minHeight: 88,
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
  siteTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  siteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  siteName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  siteUrl: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  siteActions: {
    width: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
});
