import { useThemeName } from '@/hooks/use-theme';
import { Search, X } from 'lucide-react-native';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({ value, onChangeText, onSubmit, placeholder = '搜索影视...', autoFocus }: SearchBarProps) {
  const isDark = useThemeName() === 'dark';
  const textColor = isDark ? '#FAFAFA' : '#111111';
  const mutedColor = isDark ? '#8E8E8E' : '#8A8A8A';
  const borderColor = isDark ? '#2A2A2A' : '#E8E8E6';
  const surfaceColor = isDark ? '#171717' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: surfaceColor, borderColor }]}>
      <Search size={19} color={mutedColor} strokeWidth={1.8} />
      <TextInput
        style={[styles.input, { color: textColor }]}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
      />
      {value ? (
        <TouchableOpacity style={styles.clearBtn} onPress={() => onChangeText('')} activeOpacity={0.7}>
          <X size={16} color={mutedColor} strokeWidth={1.8} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.searchBtn, { backgroundColor: textColor }]} onPress={onSubmit} activeOpacity={0.8}>
        <Text style={[styles.searchText, { color: isDark ? '#111111' : '#FFFFFF' }]}>搜索</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 4,
    gap: 6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 8,
  },
  clearBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
});
