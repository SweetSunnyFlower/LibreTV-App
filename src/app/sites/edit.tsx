import { useAppDialog } from '@/context/app-dialog-context';
import { useSite } from '@/context/site-context';
import { SiteFormSkeleton } from '@/components/skeletons/page-skeletons';
import { useThemeName } from '@/hooks/use-theme';
import { addSite, updateSite } from '@/services/database';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SiteEditScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { sites, refreshSites, isHydrating } = useSite();
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const insets = useSafeAreaInsets();
  const dialog = useAppDialog();

  const existingSite = id ? sites.find((s) => s.id === Number(id)) : null;
  const isEdit = Boolean(id);

  const [url, setUrl] = useState(existingSite?.url ?? '');
  const [name, setName] = useState(existingSite?.name ?? '');
  const [detail, setDetail] = useState(existingSite?.detail ?? '');

  useEffect(() => {
    if (!existingSite) return;
    setName(existingSite.name);
    setUrl(existingSite.url);
    setDetail(existingSite.detail);
  }, [existingSite]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/sites');
    }
  };

  const handleSave = async () => {
    if (!url.trim() || !name.trim()) {
      void dialog.alert('提示', '请填写站点地址和名称');
      return;
    }

    try {
      if (isEdit && existingSite) {
        await updateSite(db, existingSite.id, url.trim(), name.trim(), detail.trim());
      } else {
        await addSite(db, url.trim(), name.trim(), detail.trim());
      }
      await refreshSites();
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
          <Text style={[styles.headerTitle, { color: palette.text }]}>{isEdit ? '编辑站点' : '添加站点'}</Text>
          <Text style={[styles.headerSubtitle, { color: palette.secondaryText }]}>CMS 资源站配置</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            isHydrating && styles.saveButtonDisabled,
            pressed && !isHydrating && { opacity: 0.6 },
          ]}
          onPress={handleSave}
          disabled={isHydrating || (isEdit && !existingSite)}
          hitSlop={8}>
          <Text style={[styles.saveText, { color: palette.text }]}>保存</Text>
        </Pressable>
      </View>

      {isHydrating ? (
        <SiteFormSkeleton />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <Field
            label="站点名称"
            value={name}
            onChangeText={setName}
            placeholder="例: 测试资源"
            palette={palette}
          />
          <Field
            label="站点地址"
            value={url}
            onChangeText={setUrl}
            placeholder="例: https://example.com"
            palette={palette}
            keyboardType="url"
          />
          <Field
            label="详情地址"
            hint="可选"
            value={detail}
            onChangeText={setDetail}
            placeholder="例: https://example.com"
            palette={palette}
            keyboardType="url"
          />

          <Text style={[styles.helper, { color: palette.secondaryText }]}>站点地址为 CMS 采集接口的根地址，搜索接口为：{'{地址}/api.php/provide/vod/?ac=detail&wd=关键词'}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function Field({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  palette,
  keyboardType,
}: {
  label: string;
  hint?: string;
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
        {hint ? <Text style={[styles.hint, { color: palette.secondaryText }]}>{hint}</Text> : null}
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
    paddingBottom: 136,
    gap: 26,
  },
  field: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  input: {
    minHeight: 42,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  helper: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
});
