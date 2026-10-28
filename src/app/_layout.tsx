import '@/tasks/background-download-task';
import { AppVersionUpdateChecker } from '@/components/app-version-update-checker';
import { AppDialogProvider } from '@/context/app-dialog-context';
import { configureDownloadNotificationHandler } from '@/services/download-notification-service';
import { AppThemeProvider } from '@/context/app-theme-context';
import { DownloadProvider } from '@/context/download-context';
import { SiteProvider } from '@/context/site-context';
import { UserDataProvider } from '@/context/user-data-context';
import { useThemeName } from '@/hooks/use-theme';
import { migrateDb } from '@/services/database';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

configureDownloadNotificationHandler();

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="movie.db" onInit={migrateDb}>
      <AppThemeProvider>
        <ThemedRoot />
      </AppThemeProvider>
    </SQLiteProvider>
  );
}

function ThemedRoot() {
  const themeName = useThemeName();

  return (
    <ThemeProvider value={themeName === 'dark' ? DarkTheme : DefaultTheme}>
      <AppDialogProvider>
        <AppVersionUpdateChecker />
        <SiteProvider>
          <UserDataProvider>
            <DownloadProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="search" options={{ animation: 'none' }} />
                <Stack.Screen name="aggregate-search" options={{ animation: 'none' }} />
                <Stack.Screen name="detail" />
                <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'none' }} />
                <Stack.Screen name="sites" />
                <Stack.Screen name="mine" />
              </Stack>
            </DownloadProvider>
          </UserDataProvider>
        </SiteProvider>
      </AppDialogProvider>
    </ThemeProvider>
  );
}
