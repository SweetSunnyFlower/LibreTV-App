export interface IptvSource {
  id: number;
  url: string;
  name: string;
  isActive: boolean;
  createdAt: number;
}

export type IptvSourceInput = Omit<IptvSource, 'id' | 'isActive' | 'createdAt'>;

export interface IptvChannel {
  name: string;
  url: string;
  logo?: string;
  group?: string;
}
