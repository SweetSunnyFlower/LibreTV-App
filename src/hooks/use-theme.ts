/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { normalizeColorScheme, useAppTheme } from '@/context/app-theme-context';

export { normalizeColorScheme };

export function useThemeName() {
  return useAppTheme().themeName;
}

export function useTheme() {
  return Colors[useThemeName()];
}
