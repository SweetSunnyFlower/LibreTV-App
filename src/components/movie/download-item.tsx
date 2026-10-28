import { useThemeName } from '@/hooks/use-theme';
import type { DownloadRecord, DownloadState } from '@/models/download';
import { AlertCircle, CheckCircle2, DownloadCloud, Pause, Play, RotateCcw, Trash2, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface DownloadItemProps {
  record: DownloadRecord;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onPlay: (record: DownloadRecord) => void;
}

function stateLabel(state: DownloadState) {
  switch (state) {
    case 'active':
      return '下载中';
    case 'recovering':
      return '恢复中';
    case 'paused':
      return '已暂停';
    case 'completed':
      return '已完成';
    case 'error':
      return '下载失败';
    default:
      return '等待中';
  }
}

function formatBytes(value: number) {
  if (!value) return '0B';
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

export function DownloadItem({ record, onPause, onResume, onCancel, onPlay }: DownloadItemProps) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const progress = record.totalBytes > 0 ? Math.min(record.bytesWritten / record.totalBytes, 1) : 0;
  const percentStr = `${Math.round(progress * 100)}%`;
  const isHls = record.destPath.toLowerCase().endsWith('.m3u8');
  const progressText = isHls
    ? `${record.bytesWritten}${record.totalBytes > 0 ? ` / ${record.totalBytes}` : ''} 个分片`
    : `${formatBytes(record.bytesWritten)}${record.totalBytes > 0 ? ` / ${formatBytes(record.totalBytes)}` : ''}`;
  const isCompleted = record.state === 'completed';
  const isPaused = record.state === 'paused';
  const isRecovering = record.state === 'recovering';
  const isActive = record.state === 'active' || isRecovering;
  const isError = record.state === 'error';
  const semanticColor = isError ? palette.error : isCompleted ? palette.text : palette.secondaryText;
  const StatusIcon = isCompleted ? CheckCircle2 : isError ? AlertCircle : isPaused ? Pause : DownloadCloud;
  const SecondaryIcon = isCompleted ? Trash2 : X;

  return (
    <View style={[styles.container, { borderBottomColor: palette.border }]}>
      <View style={styles.headerRow}>
        <StatusIcon size={18} color={semanticColor} strokeWidth={1.75} />
        <View style={styles.textGroup}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{record.vodName}</Text>
            <Text style={[styles.statusText, { color: semanticColor }]}>{stateLabel(record.state)}</Text>
          </View>
          <Text style={[styles.subtitle, { color: palette.secondaryText }]} numberOfLines={1}>
            {record.episodeName || '离线视频'} · {progressText}
          </Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: palette.track }]}>
          <View style={[styles.progressFill, { backgroundColor: semanticColor, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.percentText, { color: semanticColor }]}>{percentStr}</Text>
      </View>

      <View style={styles.actions}>
        {isCompleted ? (
          <ActionButton icon={Play} label="播放" color={palette.text} onPress={() => onPlay(record)} fill />
        ) : isActive ? (
          <ActionButton icon={Pause} label="暂停" color={palette.text} onPress={() => onPause(record.id)} />
        ) : isPaused || isError ? (
          <ActionButton icon={RotateCcw} label={isError ? '重试' : '继续'} color={isError ? palette.error : palette.text} onPress={() => onResume(record.id)} />
        ) : null}

        <ActionButton
          icon={SecondaryIcon}
          label={isCompleted ? '删除' : '取消'}
          color={isCompleted ? palette.error : palette.secondaryText}
          onPress={() => onCancel(record.id)}
        />
      </View>
    </View>
  );
}

function ActionButton({
  icon: Icon,
  label,
  color,
  onPress,
  fill,
}: {
  icon: typeof Play;
  label: string;
  color: string;
  onPress: () => void;
  fill?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.6 }]} onPress={onPress} hitSlop={8}>
      <Icon size={15} color={color} fill={fill ? color : 'transparent'} strokeWidth={1.8} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const lightPalette = {
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  track: '#E4E4E1',
  error: '#9A2F2F',
};

const darkPalette = {
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  track: '#2A2A2A',
  error: '#E06B6B',
};

const styles = StyleSheet.create({
  container: {
    minHeight: 116,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  textGroup: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  statusText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 28,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  percentText: {
    width: 38,
    textAlign: 'right',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    paddingLeft: 28,
  },
  actionButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
});
