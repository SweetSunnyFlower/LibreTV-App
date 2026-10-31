import { useThemeName } from '@/hooks/use-theme';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface FilterPickerOption {
  key: string;
  label: string;
}

export function FilterPicker({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: FilterPickerOption[];
  selectedKey?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const [query, setQuery] = useState('');

  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: palette.background }]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={palette.secondaryText} strokeWidth={1.8} />
            </Pressable>
          </View>
          <TextInput
            style={[styles.search, { color: palette.text, backgroundColor: palette.segmentBackground }]}
            value={query}
            onChangeText={setQuery}
            placeholder="搜索"
            placeholderTextColor={palette.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.option, { borderBottomColor: palette.border }]}
                onPress={() => {
                  onSelect(item.key);
                  onClose();
                  setQuery('');
                }}>
                <Text style={[styles.optionText, { color: item.key === selectedKey ? palette.accent : palette.text }]}>
                  {item.label}
                </Text>
                {item.key === selectedKey ? <Text style={[styles.check, { color: palette.accent }]}>✓</Text> : null}
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const lightPalette = {
  background: '#FFFFFF',
  text: '#111111',
  secondaryText: '#8A8A8A',
  border: '#E8E8E6',
  segmentBackground: '#ECECEA',
  accent: '#2563EB',
};

const darkPalette = {
  background: '#1A1A1A',
  text: '#FAFAFA',
  secondaryText: '#8E8E8E',
  border: '#2A2A2A',
  segmentBackground: '#242424',
  accent: '#60A5FA',
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '70%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: 20,
  },
  header: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  search: {
    marginHorizontal: 18,
    marginBottom: 8,
    height: 38,
    borderRadius: 0,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  option: {
    minHeight: 48,
    marginHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  check: {
    fontSize: 14,
    fontWeight: '800',
  },
});
