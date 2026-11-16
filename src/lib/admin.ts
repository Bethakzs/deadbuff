/* ------------------------------------------------------------------ *
 * Owner-only site statistics (/admin ← GET /api/admin/stats) and the page-view beacon (POST /api/nav).
 * The shape mirrors server/stats.ts → AdminStats (the server file uses Workers types, so it is copied).
 * ------------------------------------------------------------------ */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { own } from './auth';

export type AuthEvent = 'register_password' | 'register_steam' | 'login_password' | 'login_steam' | 'link_steam';

export interface AdminStats {
  days: number;
  users: {
    total: number;
    steam: number;
    password: number;
    passwordLinked: number;
    newTotal: number;
    newSteam: number;
    newPassword: number;
    active: number;
    favorites: number;
    favoriteUsers: number;
  };
  signups: { day: string; steam: number; password: number }[];
  events: Record<AuthEvent, number>;
  eventsSince: number | null;
  recent: { username: string; viaSteam: boolean; steamLinked: boolean; createdAt: number; lastLoginAt: number }[];
  traffic: {
    since: string | null;
    views: number;
    visitors: number;
    byDay: { day: string; views: number; visitors: number }[];
    top: { path: string; views: number }[];
    langs: { lang: string; views: number }[];
  };
}

export const ADMIN_PERIODS = [7, 30, 90, 0] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

export function useAdminStats(days: AdminPeriod, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-stats', days],
    queryFn: ({ signal }) => own<AdminStats>(`/api/admin/stats?days=${days}`, { signal }),
    enabled,
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * One page view for the owner's stats. Production builds only (dev has no Functions); a plain-text Blob
 * keeps it a simple request. Never throws — statistics must not break the page.
 */
export function sendPageView(path: string) {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
  try {
    navigator.sendBeacon('/api/nav', new Blob([JSON.stringify({ p: path })], { type: 'text/plain' }));
  } catch {
    /* ignore */
  }
}

/** UTC days from `from` to today ("2026-11-13", …) — the charts show empty days too. */
export function dayRange(from: string): string[] {
  const out: string[] = [];
  const end = new Date().toISOString().slice(0, 10);
  for (let d = new Date(`${from}T00:00:00Z`); out.length < 400; d = new Date(d.getTime() + 86400_000)) {
    const iso = d.toISOString().slice(0, 10);
    out.push(iso);
    if (iso >= end) break;
  }
  return out;
}
