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
  visits: VisitStats;
}

export interface Count {
  key: string;
  n: number;
}

/** Visits (sessions): the same daily visitor hash with less than 30 minutes between pages. */
export interface VisitStats {
  since: string | null;
  sessions: number;
  visitors: number;
  views: number;
  bounces: number;
  /** total seconds of the visits with 2+ pages */
  seconds: number;
  signedIn: number;
  pages: { path: string; views: number; visitors: number; sessions: number; top: number }[];
  people: {
    id: string;
    day: string;
    username: string | null;
    views: number;
    sessions: number;
    pages: number;
    country: string | null;
    device: string;
    browser: string;
    os: string;
    lastAt: number;
  }[];
  sources: Count[];
  countries: Count[];
  devices: Count[];
  browsers: Count[];
  systems: Count[];
  recent: {
    id: number;
    visitor: string;
    username: string | null;
    startedAt: number;
    lastAt: number;
    views: number;
    lang: string;
    country: string | null;
    device: string;
    browser: string;
    os: string;
    ref: string | null;
    pages: { path: string; t: number }[];
  }[];
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

/** localStorage flag: this browser is the owner's — its views are not sent (set when /admin opens). */
const SKIP_KEY = 'deadbuff.nostats';

export function skipThisBrowser() {
  try {
    localStorage.setItem(SKIP_KEY, '1');
  } catch {
    /* private mode — the server still skips the owner's account */
  }
}

const skipped = () => {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
};

/** The external referrer goes with the first view of a page load only (later views are clicks inside the site). */
let referrerSent = false;

/**
 * One page view for the owner's stats. Production builds only (dev has no Functions); a plain-text Blob
 * keeps it a simple request. Never throws — statistics must not break the page.
 */
export function sendPageView(path: string) {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function' || skipped()) return;
  try {
    const r = referrerSent ? undefined : document.referrer || undefined;
    referrerSent = true;
    navigator.sendBeacon('/api/nav', new Blob([JSON.stringify({ p: path, r })], { type: 'text/plain' }));
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
