import { APP_VERSION_ENDPOINTS } from '@/constants/api';
import type { AppVersionUpdateInfo } from '@/models/app-version';
import Constants from 'expo-constants';

const FETCH_TIMEOUT = 8000;

// const MOCK_VERSION_INFO: AppVersionUpdateInfo = {
//   latestVersion: '1.0.1',
//   forceUpdate: false,
//   updateUrl: 'https://example.com/download',
//   releaseNotes: '修复已知问题，优化播放体验。',
// };

export function getCurrentAppVersion() {
  return Constants.expoConfig?.version ?? '0.0.0';
}

export async function fetchLatestAppVersion(): Promise<AppVersionUpdateInfo | null> {
  // return MOCK_VERSION_INFO;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(APP_VERSION_ENDPOINTS.latest, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[AppVersion] Fetch latest version failed:', res.status);
      return null;
    }

    const data = await res.json();
    return {
      latestVersion: String(data.latestVersion ?? ''),
      forceUpdate: Boolean(data.forceUpdate),
      updateUrl: String(data.updateUrl ?? ''),
      releaseNotes: data.releaseNotes ? String(data.releaseNotes) : undefined,
    };
  } catch (error) {
    console.error('[AppVersion] Fetch latest version error:', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseVersion(version: string) {
  return version
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function isVersionNewer(latestVersion: string, currentVersion: string) {
  if (!latestVersion || !currentVersion) return false;

  const latestParts = parseVersion(latestVersion);
  const currentParts = parseVersion(currentVersion);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const latest = latestParts[index] ?? 0;
    const current = currentParts[index] ?? 0;
    if (latest > current) return true;
    if (latest < current) return false;
  }

  return false;
}

export async function checkAppVersionUpdate(): Promise<AppVersionUpdateInfo | null> {
  const latestInfo = await fetchLatestAppVersion();
  if (!latestInfo?.latestVersion || !latestInfo.updateUrl) return null;

  const currentVersion = getCurrentAppVersion();
  if (!isVersionNewer(latestInfo.latestVersion, currentVersion)) return null;

  return latestInfo;
}
