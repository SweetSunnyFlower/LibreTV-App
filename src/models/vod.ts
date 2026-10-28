export interface CmsApiResponse<T> {
  code: number;
  msg: string;
  page: string;
  pagecount: number;
  limit: string;
  total: number;
  list: T[];
}

export interface VodItem {
  vod_id: number;
  vod_name: string;
  vod_pic: string;
  vod_year: string;
  vod_area: string;
  vod_remarks: string;
  type_name: string;
  type_id?: number;
}

export interface VodDetail extends VodItem {
  vod_content: string;
  vod_actor: string;
  vod_director: string;
  vod_lang: string;
  vod_play_url: string;
  vod_play_from?: string;
}

export interface Episode {
  name: string;
  url: string;
  source?: string;
  sourceIndex?: number;
  rawUrl?: string;
  /** Online episode playback is intentionally restricted to m3u8/HLS. */
  kind?: 'm3u8';
}

export interface VodClass {
  type_id: number;
  type_name: string;
  type_pid?: number;
}
