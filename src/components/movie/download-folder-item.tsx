import { ChevronRight, DownloadCloud, Folder } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeName } from '@/hooks/use-theme';
import type { DownloadFolderGroup } from '@/utils/media-groups';

interface DownloadFolderItemProps {
  group: DownloadFolderGroup;
  onPress: (group: DownloadFolderGroup) => void;
}

export function DownloadFolderItem({ group, onPress }: DownloadFolderItemProps) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const statusText = [
    group.activeCount ? `下载中 ${group.activeCount}` : '',
    group.completedCount ? `已完成 ${group.completedCount}` : '',
    group.pausedCount ? `已暂停 ${group.pausedCount}` : '',
    group.errorCount ? `失败 ${group.errorCount}` : '',
  ].filter(Boolean).join(' · ') || '暂无任务状态';

  return (
    <Pressable
      style={({ pressed }) => [styles.container, { borderBottomColor: palette.border }, pressed && { opacity: 0.65 }]}
      onPress={() => onPress(group)}>
      <Folder size={19} color={palette.secondaryText} strokeWidth={1.75} />
      <View style={styles.textGroup}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{group.vodName}</Text>
        <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>
          共 {group.count} 集 · {statusText}
        </Text>
      </View>
      <DownloadCloud size={16} color={palette.secondaryText} strokeWidth={1.75} />
      <ChevronRight size={17} color={palette.secondaryText} strokeWidth={1.8} />
    </Pressable>
  );
}

const lightPalette = {
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
};

const darkPalette = {
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
};

const styles = StyleSheet.create({
  container: {
    minHeight: 70,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textGroup: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
