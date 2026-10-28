import { UpdateDownloadProgressModal } from '@/components/update-download-progress-modal';
import { useAppDialog } from '@/context/app-dialog-context';
import { downloadAndInstallApk } from '@/services/apk-update-service';
import { checkAppVersionUpdate, getCurrentAppVersion } from '@/services/app-version-service';
import { useEffect, useRef, useState } from 'react';
import { ToastAndroid } from 'react-native';

function getUpdateMessage(latestVersion: string, releaseNotes?: string) {
  const currentVersion = getCurrentAppVersion();
  const lines = [`当前版本：${currentVersion}`, `最新版本：${latestVersion}`];

  if (releaseNotes) {
    lines.push('', releaseNotes);
  }

  return lines.join('\n');
}

function getInstallErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `更新包下载或安装失败，请确认服务已启动、更新包地址可访问，并允许本应用安装未知来源应用。\n\n${message}`;
}

export function AppVersionUpdateChecker() {
  const dialog = useAppDialog();
  const checkedRef = useRef(false);
  const [downloadVisible, setDownloadVisible] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    let isMounted = true;

    async function checkUpdate() {
      const updateInfo = await checkAppVersionUpdate();
      if (!isMounted || !updateInfo) return;

      const installUpdate = async () => {
        try {
          setDownloadProgress(null);
          setDownloadVisible(true);
          await downloadAndInstallApk(updateInfo.updateUrl, {
            onProgress: ({ progress }) => {
              if (isMounted) {
                setDownloadProgress(progress);
              }
            },
          });
        } catch (error) {
          console.error('[AppVersion] Install update failed:', error);
          if (isMounted) {
            if (updateInfo.forceUpdate) {
              ToastAndroid.show('更新包下载或安装失败，请检查未知来源安装权限', ToastAndroid.LONG);
            } else {
              await dialog.alert('更新失败', getInstallErrorMessage(error));
            }
          }
        } finally {
          if (isMounted) {
            setDownloadVisible(false);
            setDownloadProgress(null);
          }
        }
      };

      await dialog.showDialog({
        title: updateInfo.forceUpdate ? '发现重要更新' : '发现新版本',
        message: getUpdateMessage(updateInfo.latestVersion, updateInfo.releaseNotes),
        cancelable: !updateInfo.forceUpdate,
        buttons: updateInfo.forceUpdate
          ? [
              {
                text: '立即更新',
                closeOnPress: false,
                onPress: installUpdate,
              },
            ]
          : [
              { text: '稍后再说', style: 'cancel' },
              { text: '立即更新', onPress: installUpdate },
            ],
      });
    }

    checkUpdate().catch((error) => {
      console.error('[AppVersion] Check update failed:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [dialog]);

  return <UpdateDownloadProgressModal visible={downloadVisible} progress={downloadProgress} />;
}
