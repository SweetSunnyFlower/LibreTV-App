function safeFileStem(value: string) {
  return value.replace(/[^a-zA-Z0-9一-鿿]/g, '_');
}

function extensionFromUrl(url: string) {
  const cleanUrl = url.split('?')[0]?.split('#')[0] ?? '';
  const match = cleanUrl.match(/\.([a-z0-9]{2,5})$/i);
  const extension = match?.[1]?.toLowerCase();
  return extension && ['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(extension)
    ? extension
    : 'mp4';
}

export function buildFileDownloadName(
  vodName: string,
  episodeName: string,
  id: string,
  url: string
) {
  const stem = safeFileStem(`${vodName}_${episodeName}_${id}`);
  return `${stem}.${extensionFromUrl(url)}`;
}
