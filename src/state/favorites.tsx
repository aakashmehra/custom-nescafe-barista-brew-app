import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import type { BaristaDrinkId } from '../data/baristaMenu';
import type { BaristaOptions, TemperatureMode } from '../machine/types';

/** Dolce Gusto favorites have no `kind` (older saved entries too); Barista ones carry drink id + options. */
export interface Favorite {
  id: string;
  kind?: 'barista';
  capsuleId: number;
  name: string;
  level: number;
  temperature: TemperatureMode;
  iced: boolean;
  baristaDrinkId?: BaristaDrinkId;
  baristaOptions?: BaristaOptions;
}

const KEY = 'brew.favorites.v1';

interface FavoritesValue {
  favorites: Favorite[];
  add(f: Omit<Favorite, 'id'>): void;
  remove(id: string): void;
}

const Ctx = createContext<FavoritesValue | null>(null);

export function useFavorites() {
  const v = use(Ctx);
  if (!v) throw new Error('useFavorites must be used inside FavoritesProvider');
  return v;
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setFavorites(JSON.parse(raw) as Favorite[]))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    // don't overwrite storage with the empty initial list before the load finishes
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(favorites)).catch(() => {});
  }, [favorites, loaded]);

  return (
    <Ctx
      value={{
        favorites,
        add: (f) => setFavorites((list) => [{ ...f, id: `${Date.now()}-${f.baristaDrinkId ?? f.capsuleId}` }, ...list]),
        remove: (id) => setFavorites((list) => list.filter((f) => f.id !== id)),
      }}>
      {children}
    </Ctx>
  );
}
