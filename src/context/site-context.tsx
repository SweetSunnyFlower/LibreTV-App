import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSites, setActiveSite as dbSetActiveSite } from '@/services/database';
import type { CmsSite } from '@/models/site';

interface SiteContextValue {
  isHydrating: boolean;
  site: CmsSite | null;
  sites: CmsSite[];
  setActiveSite: (id: number) => Promise<void>;
  refreshSites: () => Promise<void>;
}

const SiteContext = createContext<SiteContextValue>({
  isHydrating: true,
  site: null,
  sites: [],
  setActiveSite: async () => {},
  refreshSites: async () => {},
});

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [site, setSite] = useState<CmsSite | null>(null);
  const [sites, setSites] = useState<CmsSite[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  const refreshSites = useCallback(async () => {
    const allSites = await getAllSites(db);
    const mapped: CmsSite[] = allSites.map((s) => ({
      ...s,
      isDefault: s.isDefault === 1,
      isActive: s.isActive === 1,
    }));
    setSites(mapped);
    const active = mapped.find((s) => s.isActive) ?? mapped[0] ?? null;
    setSite(active);
  }, [db]);

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshSites sets state only after awaiting SQLite queries, not synchronously
    refreshSites()
      .catch((error) => {
        console.warn('[Site] Initial load failed:', error);
      })
      .finally(() => {
        if (mounted) setIsHydrating(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshSites]);

  const handleSetActiveSite = useCallback(
    async (id: number) => {
      await dbSetActiveSite(db, id);
      await refreshSites();
    },
    [db, refreshSites]
  );

  const value = useMemo(
    () => ({ isHydrating, site, sites, setActiveSite: handleSetActiveSite, refreshSites }),
    [isHydrating, site, sites, handleSetActiveSite, refreshSites]
  );

  return (
    <SiteContext.Provider value={value}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
