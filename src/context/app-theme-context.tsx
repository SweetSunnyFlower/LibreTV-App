import {
  APP_THEME_DARK,
  APP_THEME_LIGHT,
  APP_THEME_SETTING_KEY,
  APP_THEME_SYSTEM,
  type AppThemePreference,
} from '@/constants/app-settings';
import type { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAppSetting, setAppSetting } from '@/services/database';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type AppColorScheme = keyof typeof Colors;
type ColorSchemeInput = AppColorScheme | 'unspecified' | null | undefined;

type AppThemeContextValue = {
  themePreference: AppThemePreference;
  themeName: AppColorScheme;
  systemThemeName: AppColorScheme;
  setThemePreference: (preference: AppThemePreference) => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function normalizeColorScheme(scheme: ColorSchemeInput): AppColorScheme {
  return scheme === APP_THEME_DARK ? APP_THEME_DARK : APP_THEME_LIGHT;
}

function normalizeThemePreference(value?: string | null): AppThemePreference {
  if (value === APP_THEME_LIGHT || value === APP_THEME_DARK || value === APP_THEME_SYSTEM) {
    return value;
  }
  return APP_THEME_SYSTEM;
}

function resolveThemeName(preference: AppThemePreference, systemThemeName: AppColorScheme): AppColorScheme {
  if (preference === APP_THEME_LIGHT || preference === APP_THEME_DARK) return preference;
  return systemThemeName;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const systemThemeName = normalizeColorScheme(useColorScheme());
  const [themePreference, setThemePreferenceState] = useState<AppThemePreference>(APP_THEME_SYSTEM);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(db, APP_THEME_SETTING_KEY).then((value) => {
      if (cancelled) return;
      setThemePreferenceState(normalizeThemePreference(value));
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const setThemePreference = useCallback(async (preference: AppThemePreference) => {
    setThemePreferenceState(preference);
    await setAppSetting(db, APP_THEME_SETTING_KEY, preference);
  }, [db]);

  const themeName = resolveThemeName(themePreference, systemThemeName);
  const value = useMemo(
    () => ({ themePreference, themeName, systemThemeName, setThemePreference }),
    [setThemePreference, systemThemeName, themeName, themePreference]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
}
