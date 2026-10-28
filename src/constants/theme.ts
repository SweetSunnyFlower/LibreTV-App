/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111111',
    background: '#F5F5F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECEEF2',
    textSecondary: '#6B7078',
    accent: '#E53935',
    primary: '#1976D2',
    card: '#FFFFFF',
    cardBorder: 'transparent',
    ratingHigh: '#E53935',
    ratingMid: '#FF9800',
    ratingLow: '#9E9E9E',
    progressTrack: '#E0E0E0',
    progressFill: '#4CAF50',
  },
  dark: {
    text: '#F7F7F8',
    background: '#111214',
    backgroundElement: '#24262B',
    backgroundSelected: '#30333A',
    textSecondary: '#B0B4BA',
    accent: '#EF5350',
    primary: '#42A5F5',
    card: '#1D1F24',
    cardBorder: 'transparent',
    ratingHigh: '#EF5350',
    ratingMid: '#FFA726',
    ratingLow: '#757575',
    progressTrack: '#333333',
    progressFill: '#66BB6A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
