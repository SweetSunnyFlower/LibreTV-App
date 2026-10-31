import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getIptvLibraryChannelIdsByCountry,
  saveIptvEpgProgrammes,
  type IptvEpgProgramme,
} from '@/services/iptv-library';
import { fetchJsonWithTimeout, fetchTextWithTimeout } from '@/services/http';

function parseTimestamp(value: string) {
  const match = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(value);
  if (!match) return 0;
  const [, year, month, day, hour, minute, second] = match;
  return Math.floor(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ) / 1000);
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseXmltv(content: string): IptvEpgProgramme[] {
  const programmes: IptvEpgProgramme[] = [];
  const programmeRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  let match: RegExpExecArray | null;

  while ((match = programmeRegex.exec(content)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const channel = /channel="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const startText = /start="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const stopText = /stop="([^"]+)"/.exec(attrs)?.[1] ?? '';
    if (!channel || !startText || !stopText) continue;

    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1] ?? '';
    const description = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(body)?.[1] ?? '';
    const category = /<category[^>]*>([\s\S]*?)<\/category>/.exec(body)?.[1] ?? '';

    programmes.push({
      channel,
      start: parseTimestamp(startText),
      stop: parseTimestamp(stopText),
      title: decodeEntities(title.trim()),
      description: decodeEntities(description.trim()),
      category: decodeEntities(category.trim()),
    });
  }

  return programmes;
}

const EPG_MAP_BASES = [
  'https://cdn.jsdelivr.net/gh/iptv-org/epg@master/sites/tv.cctv.com/tv.cctv.com.channels.xml',
  'https://gh-proxy.com/https://raw.githubusercontent.com/iptv-org/epg/master/sites/tv.cctv.com/tv.cctv.com.channels.xml',
];

// 来自 iptv-org/epg 的 CNTV 频道映射，用于网络不可用时的兜底。
const FALLBACK_CNTV_MAP: Record<string, string> = {
  'AnhuiTV.cn': 'anhui',
  'BeijingSatelliteTV.cn': 'btv1',
  'BRTVArtsChannel.cn': 'btv2',
  'BRTVScienceEducationChannel.cn': 'btv3',
  'BRTVFilmTelevisionChannel.cn': 'btv4',
  'BRTVFinancialChannel.cn': 'btv5',
  'BRTVLifeChannel.cn': 'btv7',
  'BRTVNewsChannel.cn': 'btv9',
  'BRTVKakuChildrensChannel.cn': 'btvchild',
  'BRTVWinterOlympicsDocumentaryChannel.cn': 'btvjishi',
  'CCTV1.cn': 'cctv1',
  'CCTV2.cn': 'cctv2',
  'CCTV3.cn': 'cctv3',
  'CCTV5.cn': 'cctv5',
  'CCTV5Plus.cn': 'cctv5plus',
  'CCTV6.cn': 'cctv6',
  'CCTV7.cn': 'cctv7',
  'CCTV8.cn': 'cctv8',
  'CCTV10.cn': 'cctv10',
  'CCTV11.cn': 'cctv11',
  'CCTV12.cn': 'cctv12',
  'CCTV13.cn': 'cctv13',
  'CCTV15.cn': 'cctv15',
  'CCTV4America.cn': 'cctvamerica',
  'CCTV14.cn': 'cctvchild',
  'CCTV4Europe.cn': 'cctveurope',
  'CCTVStormFootball.cn': 'cctvfyzq',
  'CCTVGolfTennis.cn': 'cctvgaowang',
  'CCTV9.cn': 'cctvjilu',
  'JiangsuLiangMakeUp.cn': 'cctvliangzhuang',
  'CCTVEntertainment.cn': 'cctvyule',
  'CDTV1.cn': 'cdtv1',
  'CDTV2.cn': 'cdtv2new',
  'CETV1.cn': 'cetv1',
  'CETV2.cn': 'cetv2',
  'CETV3.cn': 'cetv3',
  'CCTVChinaTelevisionShoppingChannel.cn': 'dianshigouwu',
  'CCTVTheFirstTheater.cn': 'diyijuchang',
  'DragonTV.cn': 'dongfang',
  'CCTVStormTheater.cn': 'fyjc',
  'CCTVStormMusic.cn': 'fyyy',
  'GansuTV.cn': 'gansu',
  'GuangdongSatelliteTV.cn': 'guangdong',
  'GuangxiTV.cn': 'guangxi',
  'GuizhouTV.cn': 'guizhou',
  'HebeiTV.cn': 'hebei',
  'HeilongjiangTV.cn': 'heilongjiang',
  'HenanTVSatellite.cn': 'henan',
  'CCTVNostalgiaTheater.cn': 'hjjc',
  'SuperChannel.cn': 'huanqiuqiguan',
  'HubeiSatelliteTV.cn': 'hubei',
  'HunanTV.cn': 'hunan',
  'JiangsuSatelliteTV.cn': 'jiangsu',
  'JiangxiTV.cn': 'jiangxi',
  'JilinTVStation.cn': 'jilin',
  'CCTVCultureofQuality.cn': 'jingpin',
  'LiaoningTV.cn': 'liaoning',
  'NBTV1.cn': 'nbtv1',
  'NBTV2.cn': 'nbtv2',
  'NBTV3.cn': 'nbtv3',
  'NBTV4.cn': 'nbtv4',
  'NBTV5.cn': 'nbtv5',
  'NeiMonggolChineseTV.cn': 'neimenggu',
  'NingxiaSatelliteChannel.cn': 'ningxia',
  'QinghaiTV.cn': 'qinghai',
  'ShandongEducationTV.cn': 'sdetv',
  'ShanxiTV.cn': 'shan1xi',
  'ShandongTV.cn': 'shandong',
  'ShenzhenTV.cn': 'shenzhen',
  'CCTVWorldGeography.cn': 'shijiedili',
  'CCTVWomensFashion.cn': 'shishang',
  'SichuanTV1.cn': 'sichuan',
  'CCTVBilliards.cn': 'taiqiu',
  'TianjinTV.cn': 'tianjin',
  'TianyuanIGoChannel.cn': 'tianyuanweiqi',
  'HainanSatelliteTV.cn': 'travel',
  'LiyuanTV.cn': 'wenwubaoku',
  'CCTVHealth.cn': 'wsjk',
  'MartialArtsWorld.cn': 'wushushijie',
  'XiamenStarTVChina.cn': 'xiamen',
  'XizangTVChinese.cn': 'xinjiang',
  'XizangTVTibetan.cn': 'xizang',
  'YanbianTV1.cn': 'yanbian',
  'GTV.cn': 'youxijingji',
  'YunnanTV1.cn': 'yunnan',
  'CETVEarlyEducation.cn': 'zaoqijiaoyu',
  'ZhejiangSatelliteTV.cn': 'zhejiang',
  'CCTVTVGuide.cn': 'zhinan',
};

type CntvChannelMap = Map<string, string>;

function readXmlAttr(attrs: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match?.[1] ?? '';
}

function parseCntvChannelMap(xml: string): CntvChannelMap {
  const map = new Map<string, string>();
  const channelRegex = /<channel\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = channelRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const site = readXmlAttr(attrs, 'site');
    const siteId = readXmlAttr(attrs, 'site_id');
    const xmltvId = readXmlAttr(attrs, 'xmltv_id');
    if (site !== 'tv.cctv.com' || !siteId) continue;
    const channel = xmltvId.split('@')[0];
    if (channel) map.set(channel, siteId);
  }
  return map;
}

async function fetchCntvChannelMap(): Promise<CntvChannelMap> {
  let lastError: unknown = null;
  for (const url of EPG_MAP_BASES) {
    try {
      const xml = await fetchTextWithTimeout(url, {}, 30000);
      const map = parseCntvChannelMap(xml);
      if (map.size > 0) return map;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('[EPG] Failed to fetch CNTV channel map, using fallback:', lastError);
  return new Map(Object.entries(FALLBACK_CNTV_MAP));
}

function formatCntvDate(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

type CntvProgramme = {
  title: string;
  startTime: number;
  endTime: number;
};

type CntvResponse = {
  data?: Record<string, { list?: CntvProgramme[] }>;
};

async function fetchCntvDay(siteId: string, date: string) {
  const url = `https://api.cntv.cn/epg/getEpgInfoByChannelNew?serviceId=tvcctv&c=${encodeURIComponent(
    siteId
  )}&d=${date}`;
  const json = await fetchJsonWithTimeout<CntvResponse>(url, {}, 30000);
  const data = json.data?.[siteId];
  return data?.list ?? [];
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function syncEpgForCountry(
  db: SQLiteDatabase,
  country: string,
  onProgress?: (percent: number) => void
) {
  const code = country.trim().toLowerCase();
  if (code !== 'cn') throw new Error('暂无该国家的 EPG 数据源（当前支持 CN）');

  onProgress?.(3);
  const map = await fetchCntvChannelMap();
  const localChannels = await getIptvLibraryChannelIdsByCountry(db, 'CN');
  const tasks: { channel: string; siteId: string; date: string }[] = [];

  for (const channel of localChannels) {
    const siteId = map.get(channel);
    if (!siteId) continue;
    const now = new Date();
    tasks.push({ channel, siteId, date: formatCntvDate(now) });
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tasks.push({ channel, siteId, date: formatCntvDate(tomorrow) });
  }

  if (tasks.length === 0) throw new Error('没有可同步的 EPG 频道，请先同步在线频道库');

  onProgress?.(5);
  const programmes: IptvEpgProgramme[] = [];
  let completed = 0;
  let failed = 0;

  await runWithConcurrency(tasks, 4, async (task) => {
    try {
      const list = await fetchCntvDay(task.siteId, task.date);
      for (const item of list) {
        if (!item.title || !item.startTime || !item.endTime) continue;
        programmes.push({
          channel: task.channel,
          start: item.startTime,
          stop: item.endTime,
          title: item.title.trim(),
          description: '',
          category: '',
        });
      }
    } catch (error) {
      failed += 1;
      console.warn(`[EPG] Failed to fetch ${task.channel} ${task.date}:`, error);
    } finally {
      completed += 1;
      onProgress?.(5 + Math.floor((completed / tasks.length) * 85));
    }
  });

  if (programmes.length === 0) {
    throw new Error(`EPG 同步失败（${failed} 个请求失败）`);
  }

  await saveIptvEpgProgrammes(db, programmes);
  onProgress?.(100);
}
