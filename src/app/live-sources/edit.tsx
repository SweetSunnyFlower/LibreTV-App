import { SiteFormSkeleton } from '@/components/skeletons/page-skeletons';
import { useAppDialog } from '@/context/app-dialog-context';
import { useIptv } from '@/context/iptv-context';
import { useThemeName } from '@/hooks/use-theme';
import { addIptvSource, updateIptvSource } from '@/services/database';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LiveSourceEditScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { sources, refreshSources, isHydrating } = useIptv();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const insets = useSafeAreaInsets();
  const dialog = useAppDialog();

  const existingSource = id ? sources.find((item) => item.id === Number(id)) : null;
  const isEdit = Boolean(id);

  const [url, setUrl] = useState(existingSource?.url ?? '');
  const [name, setName] = useState(existingSource?.name ?? '');

  useEffect(() => {
    if (!existingSource) return;
    setName(existingSource.name);
    setUrl(existingSource.url);
  }, [existingSource]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/live-sources');
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) {
      void dialog.alert('提示', '请填写直播源名称和地址');
      return;
    }

    try {
      if (isEdit && existingSource) {
        await updateIptvSource(db, existingSource.id, trimmedUrl, trimmedName);
      } else {
        await addIptvSource(db, trimmedUrl, trimmedName);
      }
      await refreshSources();
      router.back();
    } catch {
      void dialog.alert('错误', '保存失败，请重试');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
          <ChevronLeft size={27} color={palette.text} strokeWidth={2.15} />
        </Pressable>
        <View style={styles.titleGroup}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>{isEdit ? '编辑直播源' : '添加直播源'}</Text>
          <Text style={[styles.headerSubtitle, { color: palette.secondaryText }]}>M3U 播放列表配置</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            isHydrating && styles.saveButtonDisabled,
            pressed && !isHydrating && { opacity: 0.6 },
          ]}
          onPress={handleSave}
          disabled={isHydrating || (isEdit && !existingSource)}
          hitSlop={8}>
          <Text style={[styles.saveText, { color: palette.text }]}>保存</Text>
        </Pressable>
      </View>

      {isHydrating ? (
        <SiteFormSkeleton />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <Field
            label="直播源名称"
            value={name}
            onChangeText={setName}
            placeholder="例: 我的直播源"
            palette={palette}
          />
          <Field
            label="直播源地址"
            value={url}
            onChangeText={setUrl}
            placeholder="例: https://example.com/playlist.m3u"
            palette={palette}
            keyboardType="url"
          />

          <Text style={[styles.helper, { color: palette.secondaryText }]}>
            地址为 M3U 播放列表链接，文件内容应包含频道名称和流媒体地址。
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  palette,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  palette: typeof lightPalette;
  keyboardType?: 'default' | 'url';
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      </View>
      <TextInput
        style={[styles.input, { color: palette.text, borderBottomColor: palette.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.secondaryText}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const lightPalette = {
  background: '#F7F7F5',
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#DADAD7',
};

const darkPalette = {
  background: '#0F0F0F',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  saveButton: {
    minWidth: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.42,
  },
  saveText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  field: {
    paddingVertical: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  input: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  helper: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
});
