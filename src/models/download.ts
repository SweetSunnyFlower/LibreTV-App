export type DownloadState = 'idle' | 'active' | 'recovering' | 'paused' | 'completed' | 'error';
export type DownloadType = 'file' | 'hls';
export type DownloadRequestedState = 'running' | 'paused' | 'cancelled';

export interface DownloadRecord {
  id: string;
  vodName: string;
  episodeName: string;
  url: string;
  destPath: string;
  bytesWritten: number;
  totalBytes: number;
  state: DownloadState;
  downloadType: DownloadType;
  siteUrl: string;
  detailUrl: string;
  sourceName: string;
  headersJson: string;
  hlsDirPath: string;
  hlsManifestJson: string;
  requestedState: DownloadRequestedState;
  leaseOwner: string;
  leaseUntil: number;
  lastError: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}
