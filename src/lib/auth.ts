/* ------------------------------------------------------------------ *
 * Accounts (own backend: functions/api/auth, /api/me, /api/favorites).
 *
 * The session lives in an HttpOnly cookie the page can't read; a second
 * cookie `db_auth=1` only says "a session exists", so guests never call
 * /api/me. Everything here talks to relative /api/... URLs (same origin).
 * ------------------------------------------------------------------ */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface User {
  id: number;
  username: string;
  email: string | null;
  /** linked Steam account (Deadlock account_id) */
  accountId: number | null;
  hasPassword: boolean;
  createdAt: number;
}

/** Error codes the backend returns (translated as `auth.err.<code>`). */
export type AuthError =
  | 'username_invalid'
  | 'email_invalid'
  | 'password_short'
  | 'password_long'
  | 'username_taken'
  | 'email_taken'
  | 'bad_credentials'
  | 'too_many'
  | 'not_configured'
  | 'needs_password'
  | 'unknown';

export class AuthFailure extends Error {
  constructor(public code: AuthError, public status: number) {
    super(code);
  }
}

export const hasSessionHint = () => typeof document !== 'undefined' && /(?:^|;\s*)db_auth=1/.test(document.cookie);

/** fetch() for our own JSON endpoints; a non-2xx answer becomes an AuthFailure with the server's code. */
export async function own<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AuthFailure('unknown', 0);
  }
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new AuthFailure((data?.error as AuthError) ?? (res.status === 503 ? 'not_configured' : 'unknown'), res.status);
  return data as T;
}

export const AUTH_KEY = ['auth', 'me'] as const;

/** The logged-in user (null for guests). No request at all without the session hint cookie. */
export function useAuth() {
  const hint = hasSessionHint();
  const q = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async ({ signal }) => (await own<{ user: User | null }>('/api/me', { signal })).user,
    enabled: hint,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return { user: hint ? q.data ?? null : null, isLoading: hint && q.isLoading };
}

/** Puts the user into the cache after login / register / Steam link changes. */
export const setUser = (qc: QueryClient, user: User | null) => qc.setQueryData(AUTH_KEY, user);

export function useAuthActions() {
  const qc = useQueryClient();
  const done = useCallback(
    (user: User | null) => {
      setUser(qc, user);
      // favourites of the previous user (or the guest copy) are no longer valid
      qc.invalidateQueries({ queryKey: ['favorites'] });
      return user;
    },
    [qc],
  );
  return {
    login: (login: string, password: string) => own<{ user: User }>('/api/auth/login', { method: 'POST', body: { login, password } }).then((r) => done(r.user)),
    register: (username: string, email: string, password: string) =>
      own<{ user: User }>('/api/auth/register', { method: 'POST', body: { username, email, password } }).then((r) => done(r.user)),
    logout: () => own('/api/auth/logout', { method: 'POST' }).finally(() => done(null)),
    unlinkSteam: () => own<{ user: User }>('/api/me/steam', { method: 'DELETE' }).then((r) => done(r.user)),
    deleteAccount: () => own('/api/me', { method: 'DELETE' }).then(() => done(null)),
  };
}

/**
 * Steam sign-in starts with a full page navigation (Steam's OpenID page), so it's a URL, not a fetch.
 * `next` is a path inside the app WITH the language prefix ("/uk/me").
 */
export const steamUrl = (mode: 'login' | 'link', next: string) =>
  `/api/auth/steam/login?mode=${mode}&next=${encodeURIComponent(next)}`;
