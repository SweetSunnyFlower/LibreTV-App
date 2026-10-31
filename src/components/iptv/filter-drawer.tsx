import type { FilterPickerOption } from '@/components/iptv/filter-picker';
import { useThemeName } from '@/hooks/use-theme';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

export interface IptvLibraryFilters {
  country: string;
  language: string;
  category: string;
}

export function FilterDrawer({
  visible,
  countryOptions,
  languageOptions,
  categoryOptions,
  country,
  language,
  category,
  onApply,
  onClose,
}: {
  visible: boolean;
  countryOptions: FilterPickerOption[];
  languageOptions: FilterPickerOption[];
  categoryOptions: FilterPickerOption[];
  country: string;
  language: string;
  category: string;
  onApply: (filters: IptvLibraryFilters) => void;
  onClose: () => void;
}) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const [rendered, setRendered] = useState(visible);
  const [countryQuery, setCountryQuery] = useState('');
  const [languageQuery, setLanguageQuery] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [pending, setPending] = useState<IptvLibraryFilters>({ country, language, category });

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setPending({ country, language, category });
      setCountryQuery('');
      setLanguageQuery('');
      setCategoryQuery('');
      Animated.timing(translateX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(translateX, {
        toValue: DRAWER_WIDTH,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, rendered, translateX, country, language, category]);

  const apply = useCallback(() => {
    onApply(pending);
    onClose();
  }, [onApply, onClose, pending]);

  const reset = useCallback(() => {
    setPending({ country: '', language: '', category: '' });
  }, []);

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.drawer, { backgroundColor: palette.background, transform: [{ translateX }] }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <Text style={[styles.title, { color: palette.text }]}>筛选</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={palette.secondaryText} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
            <FilterSection
              title="国家"
              query={countryQuery}
              onChangeQuery={setCountryQuery}
              options={countryOptions}
              selectedKey={pending.country}
              onSelect={(key) => setPending((prev) => ({ ...prev, country: key }))}
              palette={palette}
            />
            <FilterSection
              title="语言"
              query={languageQuery}
              onChangeQuery={setLanguageQuery}
              options={languageOptions}
              selectedKey={pending.language}
              onSelect={(key) => setPending((prev) => ({ ...prev, language: key }))}
              palette={palette}
            />
            <FilterSection
              title="分类"
              query={categoryQuery}
              onChangeQuery={setCategoryQuery}
              options={categoryOptions}
              selectedKey={pending.category}
              onSelect={(key) => setPending((prev) => ({ ...prev, category: key }))}
              palette={palette}
            />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: palette.border }]}>
            <Pressable style={[styles.resetButton, { borderColor: palette.border }]} onPress={reset}>
              <Text style={[styles.resetText, { color: palette.text }]}>重置</Text>
            </Pressable>
            <Pressable style={[styles.applyButton, { backgroundColor: palette.text }]} onPress={apply}>
              <Text style={[styles.applyText, { color: palette.inverseText }]}>完成</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function FilterSection({
  title,
  query,
  onChangeQuery,
  options,
  selectedKey,
  onSelect,
  palette,
}: {
  title: string;
  query: string;
  onChangeQuery: (value: string) => void;
  options: FilterPickerOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  palette: typeof lightPalette;
}) {
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      <TextInput
        style={[styles.search, { color: palette.text, backgroundColor: palette.segmentBackground }]}
        value={query}
        onChangeText={onChangeQuery}
        placeholder={`搜索${title}`}
        placeholderTextColor={palette.secondaryText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {filtered.map((option) => {
        const isSelected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            style={[styles.option, { borderBottomColor: palette.border }]}
            onPress={() => onSelect(option.key)}>
            <Text style={[styles.optionText, { color: isSelected ? palette.text : palette.secondaryText }]}>
              {option.label}
            </Text>
            {isSelected ? <Text style={[styles.check, { color: palette.text }]}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const lightPalette = {
  background: '#FFFFFF',
  text: '#111111',
  inverseText: '#FFFFFF',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  segmentBackground: '#ECECEA',
};

const darkPalette = {
  background: '#1A1A1A',
  text: '#FAFAFA',
  inverseText: '#111111',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  segmentBackground: '#242424',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
  },
  header: {
    height: 56,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  body: {
    flex: 1,
  },
  section: {
    paddingTop: 18,
  },
  sectionTitle: {
    paddingHorizontal: 18,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  search: {
    marginHorizontal: 18,
    marginTop: 10,
    height: 36,
    borderRadius: 0,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  option: {
    minHeight: 44,
    marginHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  check: {
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
  },
  resetButton: {
    flex: 1,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  applyButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
});
