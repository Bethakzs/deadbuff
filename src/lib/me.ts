import { useSyncExternalStore } from 'react';
import { useAuth } from './auth';

/*
 * "Me" = the Steam account linked to the logged-in user (lib/auth.ts). Guests — and users who
 * haven't linked Steam — can still mark a player page with "It's me": that account id is kept in
 * this browser's localStorage. The linked account always wins.
 */
const KEY = 'deadbuff.me.v1';
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setMe(accountId: number | null) {
  try {
    if (accountId) localStorage.setItem(KEY, String(accountId));
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

/** The account id marked as "me" in this browser (ignores the login), or null. */
export const useLocalMe = () => useSyncExternalStore(subscribe, read, () => null);

/** "My" Deadlock account: the logged-in user's Steam account, else the one marked "It's me" here. */
export function useMe(): number | null {
  const local = useLocalMe();
  const { user } = useAuth();
  return user?.accountId ?? local;
}
