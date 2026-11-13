/* ------------------------------------------------------------------ *
 * Favourite heroes and builds.
 *   logged in → stored on the server (/api/favorites, D1), same on every device
 *   guest     → stored in this browser (localStorage); merged into the
 *               account on the next login (<FavoritesSync/> in Layout)
 * ------------------------------------------------------------------ */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { own, useAuth } from './auth';

export type FavKind = 'hero' | 'build';
export interface Fav {
  kind: FavKind;
  id: number;
}

const KEY = 'deadbuff.favs.v1';
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function parse(raw: string): Fav[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((f) => (f?.kind === 'hero' || f?.kind === 'build') && Number.isInteger(f?.id)) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Fav[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
};

const same = (a: Fav, kind: FavKind, id: number) => a.kind === kind && a.id === id;

export function useFavorites() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  const local = useMemo(() => parse(raw), [raw]);
  const key = useMemo(() => ['favorites', user?.id ?? 0] as const, [user?.id]);
  const server = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await own<{ items: Fav[] }>('/api/favorites', { signal })).items,
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const list = user ? server.data ?? [] : local;

  const has = useCallback((kind: FavKind, id: number) => list.some((f) => same(f, kind, id)), [list]);

  const toggle = useCallback(
    async (kind: FavKind, id: number) => {
      const on = list.some((f) => same(f, kind, id));
      const next = on ? list.filter((f) => !same(f, kind, id)) : [{ kind, id }, ...list];
      if (!user) return writeLocal(next);
      qc.setQueryData(key, next); // optimistic
      try {
        const res = await own<{ items: Fav[] }>('/api/favorites', { method: on ? 'DELETE' : 'POST', body: { kind, id } });
        qc.setQueryData(key, res.items);
      } catch {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    [list, user, qc, key],
  );

  return { list, has, toggle, synced: !!user, isLoading: !!user && server.isLoading };
}

/** Mounted once: after a login, moves the favourites collected as a guest into the account. */
export function FavoritesSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  useEffect(() => {
    const items = parse(raw);
    if (!user || !items.length) return;
    let cancelled = false;
    own<{ items: Fav[] }>('/api/favorites', { method: 'POST', body: { items } })
      .then((res) => {
        if (cancelled) return;
        qc.setQueryData(['favorites', user.id], res.items);
        writeLocal([]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, raw, qc]);
  return null;
}
