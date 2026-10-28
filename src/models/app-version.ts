export type AppVersionUpdateInfo = {
  latestVersion: string;
  forceUpdate: boolean;
  updateUrl: string;
  releaseNotes?: string;
  md5?: string;
  size?: number;
};
