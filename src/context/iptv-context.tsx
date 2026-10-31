import { getAllIptvSources, setActiveIptvSource as dbSetActiveIptvSource } from '@/services/database';
import type { IptvSource } from '@/models/iptv';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface IptvContextValue {
  isHydrating: boolean;
  source: IptvSource | null;
  sources: IptvSource[];
  setActiveSource: (id: number) => Promise<void>;
  refreshSources: () => Promise<void>;
}

const IptvContext = createContext<IptvContextValue>({
  isHydrating: true,
  source: null,
  sources: [],
  setActiveSource: async () => {},
  refreshSources: async () => {},
});

export function IptvProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [source, setSource] = useState<IptvSource | null>(null);
  const [sources, setSources] = useState<IptvSource[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  const refreshSources = useCallback(async () => {
    const allSources = await getAllIptvSources(db);
    const mapped: IptvSource[] = allSources.map((item) => ({
      ...item,
      isActive: item.isActive === 1,
    }));
    setSources(mapped);
    setSource(mapped.find((item) => item.isActive) ?? mapped[0] ?? null);
  }, [db]);

  useEffect(() => {
    let mounted = true;
    refreshSources()
      .catch((error) => {
        console.warn('[IPTV] Initial load failed:', error);
      })
      .finally(() => {
        if (mounted) setIsHydrating(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshSources]);

  const handleSetActiveSource = useCallback(
    async (id: number) => {
      await dbSetActiveIptvSource(db, id);
      await refreshSources();
    },
    [db, refreshSources]
  );

  return (
    <IptvContext.Provider
      value={{
        isHydrating,
        source,
        sources,
        setActiveSource: handleSetActiveSource,
        refreshSources,
      }}>
      {children}
    </IptvContext.Provider>
  );
}

export function useIptv() {
  return useContext(IptvContext);
}
