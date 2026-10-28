import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  clearSearchHistory as dbClearSearchHistory,
  clearWatchHistory as dbClearWatchHistory,
  deleteFavorite as dbDeleteFavorite,
  deleteSearchHistory as dbDeleteSearchHistory,
  deleteWatchHistory as dbDeleteWatchHistory,
  getFavorites,
  getSearchHistory,
  getWatchHistory,
  upsertFavorite,
  upsertSearchHistory,
  upsertWatchHistory,
} from '@/services/database';
import type { FavoriteInput, FavoriteRecord, SearchHistoryRecord, WatchHistoryInput, WatchHistoryRecord } from '@/models/user-data';

interface UserDataContextValue {
  isHydrating: boolean;
  favorites: FavoriteRecord[];
  searchHistory: SearchHistoryRecord[];
  watchHistory: WatchHistoryRecord[];
  refreshUserData: () => Promise<void>;
  isFavorite: (siteUrl: string, vodId: number) => boolean;
  toggleFavorite: (input: FavoriteInput) => Promise<void>;
  addSearchHistory: (keyword: string, siteUrl: string, siteName: string, resultCount: number) => Promise<void>;
  addWatchHistory: (input: WatchHistoryInput) => Promise<void>;
  deleteSearchHistory: (id: string) => Promise<void>;
  deleteWatchHistory: (id: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  clearWatchHistory: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue>({
  isHydrating: true,
  favorites: [],
  searchHistory: [],
  watchHistory: [],
  refreshUserData: async () => {},
  isFavorite: () => false,
  toggleFavorite: async () => {},
  addSearchHistory: async () => {},
  addWatchHistory: async () => {},
  deleteSearchHistory: async () => {},
  deleteWatchHistory: async () => {},
  clearSearchHistory: async () => {},
  clearWatchHistory: async () => {},
});

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryRecord[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryRecord[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  const refreshUserData = useCallback(async () => {
    const [fav, searches, watches] = await Promise.all([
      getFavorites(db),
      getSearchHistory(db),
      getWatchHistory(db),
    ]);
    setFavorites(fav);
    setSearchHistory(searches);
    setWatchHistory(watches);
  }, [db]);

  useEffect(() => {
    let mounted = true;
    refreshUserData()
      .catch((error) => {
        console.warn('[UserData] Initial load failed:', error);
      })
      .finally(() => {
        if (mounted) setIsHydrating(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshUserData]);

  const isFavorite = useCallback(
    (siteUrl: string, vodId: number) => favorites.some((item) => item.siteUrl === siteUrl && item.vodId === vodId),
    [favorites]
  );

  const toggleFavorite = useCallback(async (input: FavoriteInput) => {
    if (isFavorite(input.siteUrl, input.vodId)) {
      await dbDeleteFavorite(db, input.siteUrl, input.vodId);
    } else {
      await upsertFavorite(db, input);
    }
    await refreshUserData();
  }, [db, isFavorite, refreshUserData]);

  const addSearchHistory = useCallback(async (keyword: string, siteUrl: string, siteName: string, resultCount: number) => {
    await upsertSearchHistory(db, keyword, siteUrl, siteName, resultCount);
    await refreshUserData();
  }, [db, refreshUserData]);

  const addWatchHistory = useCallback(async (input: WatchHistoryInput) => {
    await upsertWatchHistory(db, input);
    await refreshUserData();
  }, [db, refreshUserData]);

  const deleteSearchHistory = useCallback(async (id: string) => {
    await dbDeleteSearchHistory(db, id);
    await refreshUserData();
  }, [db, refreshUserData]);

  const deleteWatchHistory = useCallback(async (id: string) => {
    await dbDeleteWatchHistory(db, id);
    await refreshUserData();
  }, [db, refreshUserData]);

  const clearSearchHistory = useCallback(async () => {
    await dbClearSearchHistory(db);
    await refreshUserData();
  }, [db, refreshUserData]);

  const clearWatchHistory = useCallback(async () => {
    await dbClearWatchHistory(db);
    await refreshUserData();
  }, [db, refreshUserData]);

  return (
    <UserDataContext.Provider
      value={{
        isHydrating,
        favorites,
        searchHistory,
        watchHistory,
        refreshUserData,
        isFavorite,
        toggleFavorite,
        addSearchHistory,
        addWatchHistory,
        deleteSearchHistory,
        deleteWatchHistory,
        clearSearchHistory,
        clearWatchHistory,
      }}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData() {
  return useContext(UserDataContext);
}
