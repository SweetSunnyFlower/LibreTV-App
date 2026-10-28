export interface DoubanTagResponse {
  tags: string[];
}

export interface DoubanMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

export interface DoubanSubjectsResponse {
  subjects: DoubanMovie[];
  total: number;
  start: number;
}
