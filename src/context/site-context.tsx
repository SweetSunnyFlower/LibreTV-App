import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSites, setActiveSite as dbSetActiveSite } from '@/services/database';
import type { CmsSite } from '@/models/site';

interface SiteContextValue {
  site: CmsSite | null;
  sites: CmsSite[];
  setActiveSite: (id: number) => Promise<void>;
  refreshSites: () => Promise<void>;
}

const SiteContext = createContext<SiteContextValue>({
  site: null,
  sites: [],
  setActiveSite: async () => {},
  refreshSites: async () => {},
});

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [site, setSite] = useState<CmsSite | null>(null);
  const [sites, setSites] = useState<CmsSite[]>([]);

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
    refreshSites();
  }, [refreshSites]);

  const handleSetActiveSite = useCallback(
    async (id: number) => {
      await dbSetActiveSite(db, id);
      await refreshSites();
    },
    [db, refreshSites]
  );

  return (
    <SiteContext.Provider
      value={{ site, sites, setActiveSite: handleSetActiveSite, refreshSites }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
