import { ScreenHeader } from '@/components/screen-header';
import { UpdateDownloadProgressModal } from '@/components/update-download-progress-modal';
import { useAppDialog } from '@/context/app-dialog-context';
import {
  APP_THEME_DARK,
  APP_THEME_LIGHT,
  APP_THEME_SYSTEM,
  DEFAULT_HLS_CONCURRENT_DOWNLOADS,
  HLS_CONCURRENT_DOWNLOADS_SETTING_KEY,
  MAX_HLS_CONCURRENT_DOWNLOADS,
  MIN_HLS_CONCURRENT_DOWNLOADS,
  PLAYER_AUTO_NEXT_EPISODE_SETTING_KEY,
  PLAYER_AUTO_PLAY_SETTING_KEY,
  PLAYER_RECORD_PROGRESS_SETTING_KEY,
  type AppThemePreference,
} from '@/constants/app-settings';
import { useAppTheme } from '@/context/app-theme-context';
import { useThemeName } from '@/hooks/use-theme';
import type { AppVersionUpdateInfo } from '@/models/app-version';
import { downloadAndInstallApk } from '@/services/apk-update-service';
import { getAppSetting, setAppSetting } from '@/services/database';
import { fetchLatestAppVersion, getCurrentAppVersion, isVersionNewer } from '@/services/app-version-service';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronRight, Minus, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

function settingToBoolean(value: string | null, fallback: boolean) {
  if (value === '1') return true;
  if (value === '0') return false;
  return fallback;
}

function settingToNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

const THEME_OPTIONS: Array<{ label: string; value: AppThemePreference }> = [
  { label: '跟随系统', value: APP_THEME_SYSTEM },
  { label: '浅色', value: APP_THEME_LIGHT },
  { label: '深色', value: APP_THEME_DARK },
];

function getUpdateMessage(latestVersion: string, releaseNotes?: string) {
  const currentVersion = getCurrentAppVersion();
  const lines = [`当前版本：${currentVersion}`, `最新版本：${latestVersion}`];

  if (releaseNotes) {
    lines.push('', releaseNotes);
  }

  return lines.join('\n');
}

function getInstallErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `更新包下载或安装失败，请确认服务已启动、更新包地址可访问，并允许本应用安装未知来源应用。\n\n${message}`;
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const dialog = useAppDialog();
  const { themePreference, setThemePreference } = useAppTheme();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoNextEpisode, setAutoNextEpisode] = useState(true);
  const [recordProgress, setRecordProgress] = useState(true);
  const [hlsConcurrency, setHlsConcurrency] = useState(DEFAULT_HLS_CONCURRENT_DOWNLOADS);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadVisible, setDownloadVisible] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting(db, PLAYER_AUTO_PLAY_SETTING_KEY),
      getAppSetting(db, PLAYER_AUTO_NEXT_EPISODE_SETTING_KEY),
      getAppSetting(db, PLAYER_RECORD_PROGRESS_SETTING_KEY),
      getAppSetting(db, HLS_CONCURRENT_DOWNLOADS_SETTING_KEY),
    ]).then(([autoPlayValue, autoNextEpisodeValue, recordProgressValue, hlsConcurrencyValue]) => {
      if (cancelled) return;
      setAutoPlay(settingToBoolean(autoPlayValue, true));
      setAutoNextEpisode(settingToBoolean(autoNextEpisodeValue, true));
      setRecordProgress(settingToBoolean(recordProgressValue, true));
      setHlsConcurrency(settingToNumber(
        hlsConcurrencyValue,
        DEFAULT_HLS_CONCURRENT_DOWNLOADS,
        MIN_HLS_CONCURRENT_DOWNLOADS,
        MAX_HLS_CONCURRENT_DOWNLOADS
      ));
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const toggleAutoPlay = useCallback(async (value: boolean) => {
    setAutoPlay(value);
    await setAppSetting(db, PLAYER_AUTO_PLAY_SETTING_KEY, value ? '1' : '0');
  }, [db]);

  const toggleAutoNextEpisode = useCallback(async (value: boolean) => {
    setAutoNextEpisode(value);
    await setAppSetting(db, PLAYER_AUTO_NEXT_EPISODE_SETTING_KEY, value ? '1' : '0');
  }, [db]);

  const toggleRecordProgress = useCallback(async (value: boolean) => {
    setRecordProgress(value);
    await setAppSetting(db, PLAYER_RECORD_PROGRESS_SETTING_KEY, value ? '1' : '0');
  }, [db]);

  const updateHlsConcurrency = useCallback(async (nextValue: number) => {
    const value = Math.min(MAX_HLS_CONCURRENT_DOWNLOADS, Math.max(MIN_HLS_CONCURRENT_DOWNLOADS, nextValue));
    setHlsConcurrency(value);
    await setAppSetting(db, HLS_CONCURRENT_DOWNLOADS_SETTING_KEY, String(value));
  }, [db]);

  const installUpdate = useCallback(async (updateInfo: AppVersionUpdateInfo) => {
    try {
      setDownloadProgress(null);
      setDownloadVisible(true);
      await downloadAndInstallApk(updateInfo.updateUrl, {
        onProgress: ({ progress }) => {
          setDownloadProgress(progress);
        },
      });
    } catch (error) {
      console.error('[Settings] Install update failed:', error);
      await dialog.alert('更新失败', getInstallErrorMessage(error));
    } finally {
      setDownloadVisible(false);
      setDownloadProgress(null);
    }
  }, [dialog]);

  const showUpdateDialog = useCallback(async (updateInfo: AppVersionUpdateInfo) => {
    await dialog.showDialog({
      title: updateInfo.forceUpdate ? '发现重要更新' : '发现新版本',
      message: getUpdateMessage(updateInfo.latestVersion, updateInfo.releaseNotes),
      cancelable: !updateInfo.forceUpdate,
      buttons: updateInfo.forceUpdate
        ? [
            {
              text: '立即更新',
              closeOnPress: false,
              onPress: () => installUpdate(updateInfo),
            },
          ]
        : [
            { text: '稍后再说', style: 'cancel' },
            { text: '立即更新', onPress: () => installUpdate(updateInfo) },
          ],
    });
  }, [dialog, installUpdate]);

  const checkVersionUpdate = useCallback(async () => {
    if (checkingUpdate) return;

    setCheckingUpdate(true);
    try {
      const latestInfo = await fetchLatestAppVersion();
      const currentVersion = getCurrentAppVersion();

      if (!latestInfo?.latestVersion) {
        await dialog.alert('检查失败', '暂时无法获取最新版本信息，请稍后再试。');
        return;
      }

      if (!isVersionNewer(latestInfo.latestVersion, currentVersion)) {
        await dialog.alert('当前已是最新版本', `当前版本：${currentVersion}`);
        return;
      }

      if (!latestInfo.updateUrl) {
        await dialog.alert('检查失败', '发现新版本，但缺少更新包下载地址。');
        return;
      }

      await showUpdateDialog(latestInfo);
    } finally {
      setCheckingUpdate(false);
    }
  }, [checkingUpdate, dialog, showUpdateDialog]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <UpdateDownloadProgressModal visible={downloadVisible} progress={downloadProgress} />
      <ScreenHeader title="设置" subtitle="应用偏好" />
      <ScrollView contentContainerStyle={styles.content}>
        <ChoiceSettingItem
          title="主题外观"
          subtitle="跟随系统、浅色或深色模式"
          value={themePreference}
          options={THEME_OPTIONS}
          onChange={setThemePreference}
          palette={palette}
        />
        <SettingItem
          title="自动播放"
          subtitle="进入播放页后自动开始播放"
          value={autoPlay}
          onValueChange={toggleAutoPlay}
          palette={palette}
        />
        <SettingItem
          title="自动播放下一集"
          subtitle="当前剧集播放结束后自动切换到下一集"
          value={autoNextEpisode}
          onValueChange={toggleAutoNextEpisode}
          palette={palette}
        />
        <SettingItem
          title="记录播放进度"
          subtitle="保存当前播放位置，下次打开同一集时继续观看"
          value={recordProgress}
          onValueChange={toggleRecordProgress}
          palette={palette}
        />
        <NumberSettingItem
          title="切片并发下载数"
          subtitle="m3u8 分片同时下载数量，过高可能被资源站限速"
          value={hlsConcurrency}
          min={MIN_HLS_CONCURRENT_DOWNLOADS}
          max={MAX_HLS_CONCURRENT_DOWNLOADS}
          onChange={updateHlsConcurrency}
          palette={palette}
        />
        <ActionSettingItem
          title="版本更新"
          subtitle={checkingUpdate ? '正在检查最新版本...' : `当前版本：${getCurrentAppVersion()}`}
          disabled={checkingUpdate}
          onPress={checkVersionUpdate}
          palette={palette}
        />
      </ScrollView>
    </View>
  );
}

function ChoiceSettingItem({ title, subtitle, value, options, onChange, palette }: {
  title: string;
  subtitle: string;
  value: AppThemePreference;
  options: Array<{ label: string; value: AppThemePreference }>;
  onChange: (value: AppThemePreference) => void;
  palette: typeof lightPalette;
}) {
  return (
    <View style={[styles.choiceSettingItem, { borderBottomColor: palette.border }]}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: palette.secondaryText }]}>{subtitle}</Text>
      </View>
      <View style={[styles.choiceGroup, { backgroundColor: palette.segmentBackground }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.choiceButton,
                selected && { backgroundColor: palette.text },
                pressed && !selected && { opacity: 0.62 },
              ]}
              onPress={() => onChange(option.value)}>
              <Text style={[styles.choiceText, { color: selected ? palette.inverseText : palette.secondaryText }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingItem({ title, subtitle, value, onValueChange, palette }: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  palette: typeof lightPalette;
}) {
  return (
    <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: palette.secondaryText }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.border, true: palette.text }}
        thumbColor={palette.inverseText}
      />
    </View>
  );
}

function ActionSettingItem({ title, subtitle, disabled, onPress, palette }: {
  title: string;
  subtitle: string;
  disabled?: boolean;
  onPress: () => void;
  palette: typeof lightPalette;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingItem,
        { borderBottomColor: palette.border },
        pressed && !disabled && styles.settingPressed,
        disabled && styles.settingDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: palette.secondaryText }]}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={palette.secondaryText} strokeWidth={1.8} />
    </Pressable>
  );
}

function NumberSettingItem({ title, subtitle, value, min, max, onChange, palette }: {
  title: string;
  subtitle: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  palette: typeof lightPalette;
}) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={[styles.settingItem, { borderBottomColor: palette.border }]}>
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: palette.secondaryText }]}>{subtitle}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          style={({ pressed }) => [styles.stepperButton, { opacity: canDecrease ? 1 : 0.32 }, pressed && { opacity: 0.62 }]}
          onPress={() => onChange(value - 1)}
          disabled={!canDecrease}>
          <Minus size={16} color={palette.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={[styles.stepperValue, { color: palette.text }]}>{value}</Text>
        <Pressable
          style={({ pressed }) => [styles.stepperButton, { opacity: canIncrease ? 1 : 0.32 }, pressed && { opacity: 0.62 }]}
          onPress={() => onChange(value + 1)}
          disabled={!canIncrease}>
          <Plus size={16} color={palette.text} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  inverseText: '#FFFFFF',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  segmentBackground: '#ECECEA',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  segmentBackground: '#1D1D1D',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 136,
  },
  settingItem: {
    minHeight: 78,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingPressed: {
    opacity: 0.62,
  },
  settingDisabled: {
    opacity: 0.52,
  },
  choiceSettingItem: {
    minHeight: 92,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  settingText: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  settingSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  choiceGroup: {
    height: 38,
    borderRadius: 19,
    padding: 3,
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  choiceButton: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
});
