import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  clearSearchHistory as dbClearSearchHistory,
  clearWatchHistory as dbClearWatchHistory,
  clearLiveWatchHistory as dbClearLiveWatchHistory,
  deleteFavorite as dbDeleteFavorite,
  deleteLiveFavorite as dbDeleteLiveFavorite,
  deleteLiveWatchHistory as dbDeleteLiveWatchHistory,
  deleteSearchHistory as dbDeleteSearchHistory,
  deleteWatchHistory as dbDeleteWatchHistory,
  getFavorites,
  getLiveFavorites,
  getLiveWatchHistory,
  getSearchHistory,
  getWatchHistory,
  upsertLiveFavorite,
  upsertLiveWatchHistory,
  upsertFavorite,
  upsertSearchHistory,
  upsertWatchHistory,
  updateWatchHistoryProgress as dbUpdateWatchHistoryProgress,
} from '@/services/database';
import type {
  FavoriteInput,
  FavoriteRecord,
  LiveFavoriteInput,
  LiveFavoriteRecord,
  LiveWatchHistoryInput,
  LiveWatchHistoryRecord,
  SearchHistoryRecord,
  WatchHistoryInput,
  WatchHistoryRecord,
} from '@/models/user-data';

interface UserDataContextValue {
  isHydrating: boolean;
  favorites: FavoriteRecord[];
  liveFavorites: LiveFavoriteRecord[];
  searchHistory: SearchHistoryRecord[];
  watchHistory: WatchHistoryRecord[];
  liveWatchHistory: LiveWatchHistoryRecord[];
  refreshUserData: () => Promise<void>;
  isFavorite: (siteUrl: string, vodId: number) => boolean;
  isLiveFavorite: (channelUrl: string) => boolean;
  toggleFavorite: (input: FavoriteInput) => Promise<void>;
  toggleLiveFavorite: (input: LiveFavoriteInput) => Promise<void>;
  addSearchHistory: (keyword: string, siteUrl: string, siteName: string, resultCount: number) => Promise<void>;
  addWatchHistory: (input: WatchHistoryInput) => Promise<string>;
  addLiveWatchHistory: (input: LiveWatchHistoryInput) => Promise<void>;
  updateWatchHistoryProgress: (id: string, positionMillis: number, durationMillis: number) => Promise<void>;
  deleteSearchHistory: (id: string) => Promise<void>;
  deleteWatchHistory: (id: string) => Promise<void>;
  deleteLiveWatchHistory: (id: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  clearWatchHistory: () => Promise<void>;
  clearLiveWatchHistory: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue>({
  isHydrating: true,
  favorites: [],
  liveFavorites: [],
  searchHistory: [],
  watchHistory: [],
  liveWatchHistory: [],
  refreshUserData: async () => {},
  isFavorite: () => false,
  isLiveFavorite: () => false,
  toggleFavorite: async () => {},
  toggleLiveFavorite: async () => {},
  addSearchHistory: async () => {},
  addWatchHistory: async () => '',
  addLiveWatchHistory: async () => {},
  updateWatchHistoryProgress: async () => {},
  deleteSearchHistory: async () => {},
  deleteWatchHistory: async () => {},
  deleteLiveWatchHistory: async () => {},
  clearSearchHistory: async () => {},
  clearWatchHistory: async () => {},
  clearLiveWatchHistory: async () => {},
});

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [liveFavorites, setLiveFavorites] = useState<LiveFavoriteRecord[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryRecord[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryRecord[]>([]);
  const [liveWatchHistory, setLiveWatchHistory] = useState<LiveWatchHistoryRecord[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  const refreshUserData = useCallback(async () => {
    const [fav, liveFav, searches, watches, liveWatches] = await Promise.all([
      getFavorites(db),
      getLiveFavorites(db),
      getSearchHistory(db),
      getWatchHistory(db),
      getLiveWatchHistory(db),
    ]);
    setFavorites(fav);
    setLiveFavorites(liveFav);
    setSearchHistory(searches);
    setWatchHistory(watches);
    setLiveWatchHistory(liveWatches);
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

  const isLiveFavorite = useCallback(
    (channelUrl: string) => liveFavorites.some((item) => item.channelUrl === channelUrl),
    [liveFavorites]
  );

  const toggleLiveFavorite = useCallback(async (input: LiveFavoriteInput) => {
    if (isLiveFavorite(input.channelUrl)) {
      await dbDeleteLiveFavorite(db, input.channelUrl);
    } else {
      await upsertLiveFavorite(db, input);
    }
    await refreshUserData();
  }, [db, isLiveFavorite, refreshUserData]);

  const addSearchHistory = useCallback(async (keyword: string, siteUrl: string, siteName: string, resultCount: number) => {
    await upsertSearchHistory(db, keyword, siteUrl, siteName, resultCount);
    await refreshUserData();
  }, [db, refreshUserData]);

  const addWatchHistory = useCallback(async (input: WatchHistoryInput) => {
    const id = await upsertWatchHistory(db, input);
    await refreshUserData();
    return id;
  }, [db, refreshUserData]);

  const addLiveWatchHistory = useCallback(async (input: LiveWatchHistoryInput) => {
    await upsertLiveWatchHistory(db, input);
    await refreshUserData();
  }, [db, refreshUserData]);

  const updateWatchHistoryProgress = useCallback(async (
    id: string,
    positionMillis: number,
    durationMillis: number
  ) => {
    await dbUpdateWatchHistoryProgress(db, id, positionMillis, durationMillis);
    setWatchHistory((current) => current.map((item) => (
      item.id === id
        ? {
            ...item,
            positionMillis: Math.max(0, Math.floor(positionMillis)),
            durationMillis: Math.max(0, Math.floor(durationMillis)),
          }
        : item
    )));
  }, [db]);

  const deleteSearchHistory = useCallback(async (id: string) => {
    await dbDeleteSearchHistory(db, id);
    await refreshUserData();
  }, [db, refreshUserData]);

  const deleteWatchHistory = useCallback(async (id: string) => {
    await dbDeleteWatchHistory(db, id);
    await refreshUserData();
  }, [db, refreshUserData]);

  const deleteLiveWatchHistory = useCallback(async (id: string) => {
    await dbDeleteLiveWatchHistory(db, id);
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

  const clearLiveWatchHistory = useCallback(async () => {
    await dbClearLiveWatchHistory(db);
    await refreshUserData();
  }, [db, refreshUserData]);

  return (
    <UserDataContext.Provider
      value={{
        isHydrating,
        favorites,
        liveFavorites,
        searchHistory,
        watchHistory,
        liveWatchHistory,
        refreshUserData,
        isFavorite,
        isLiveFavorite,
        toggleFavorite,
        toggleLiveFavorite,
        addSearchHistory,
        addWatchHistory,
        addLiveWatchHistory,
        updateWatchHistoryProgress,
        deleteSearchHistory,
        deleteWatchHistory,
        deleteLiveWatchHistory,
        clearSearchHistory,
        clearWatchHistory,
        clearLiveWatchHistory,
      }}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData() {
  return useContext(UserDataContext);
}
