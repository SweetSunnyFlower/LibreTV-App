import { useThemeName } from '@/hooks/use-theme';
import { Modal, StyleSheet, Text, View, type DimensionValue } from 'react-native';

type UpdateDownloadProgressModalProps = {
  visible: boolean;
  progress: number | null;
};

function formatProgress(progress: number | null) {
  if (progress === null) return '正在下载更新包...';
  return `正在下载更新包 ${Math.round(progress * 100)}%`;
}

export function UpdateDownloadProgressModal({ visible, progress }: UpdateDownloadProgressModalProps) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const progressWidth = `${Math.max(0, Math.min(1, progress ?? 0)) * 100}%` as DimensionValue;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.text }]}>正在更新</Text>
          <Text style={[styles.message, { color: palette.secondaryText }]}>{formatProgress(progress)}</Text>
          <View style={[styles.progressTrack, { backgroundColor: palette.track }]}>
            <View style={[styles.progressBar, { backgroundColor: palette.text, width: progressWidth }]} />
          </View>
          <Text style={[styles.tip, { color: palette.secondaryText }]}>下载完成后将自动打开系统安装器</Text>
        </View>
      </View>
    </Modal>
  );
}

const lightPalette = {
  card: '#FFFFFF',
  text: '#111111',
  secondaryText: '#737373',
  border: '#E8E8E6',
  track: '#ECECEA',
};

const darkPalette = {
  card: '#171717',
  text: '#FAFAFA',
  secondaryText: '#A3A3A3',
  border: '#2A2A2A',
  track: '#2A2A2A',
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 6,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressTrack: {
    height: 8,
    marginTop: 18,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 999,
  },
  tip: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
});
