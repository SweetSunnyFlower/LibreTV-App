export interface CmsSite {
  id: number;
  url: string;
  name: string;
  detail: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: number;
}

export type CmsSiteInput = Omit<CmsSite, 'id' | 'isActive' | 'createdAt'>;
