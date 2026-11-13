import { useSyncExternalStore } from 'react';

/*
 * "It's me" — stage 1 stand-in for Steam login: the visitor marks a player page as their own and
 * we remember the account id in this browser. Stage 2 (Steam OpenID via a Cloudflare Function)
 * will set the same value from the server session instead.
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

/** The account id marked as "me" in this browser, or null. */
export const useMe = () => useSyncExternalStore(subscribe, read, () => null);
