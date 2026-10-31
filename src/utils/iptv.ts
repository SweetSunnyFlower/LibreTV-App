import type { IptvChannel } from '@/models/iptv';

function unquote(value: string) {
  return value.replace(/^["']|["']$/g, '').trim();
}

function attributeValue(line: string, key: string) {
  const match = new RegExp(`${key}="([^"]*)"`, 'i').exec(line);
  return match ? unquote(match[1]) : '';
}

function displayName(line: string, tvgName: string) {
  const commaIndex = line.indexOf(',');
  const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';
  return name || tvgName || '未命名频道';
}

export function parseM3U(content: string): IptvChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: IptvChannel[] = [];
  let pending: IptvChannel | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const tvgName = attributeValue(line, 'tvg-name');
      pending = {
        name: displayName(line, tvgName),
        url: '',
        logo: attributeValue(line, 'tvg-logo') || undefined,
        group: attributeValue(line, 'group-title') || undefined,
      };
      continue;
    }

    if (line.startsWith('#')) continue;

    const url = line;
    if (pending) {
      channels.push({ ...pending, url });
      pending = null;
    } else {
      channels.push({ name: '未命名频道', url });
    }
  }

  return channels;
}

export function groupIptvChannels(channels: IptvChannel[]) {
  const map = new Map<string, IptvChannel[]>();
  const order: string[] = [];

  for (const channel of channels) {
    const group = channel.group || '未分组';
    const list = map.get(group);
    if (list) {
      list.push(channel);
    } else {
      map.set(group, [channel]);
      order.push(group);
    }
  }

  return order.map((name) => ({ name, channels: map.get(name) ?? [] }));
}
