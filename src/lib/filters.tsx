import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_FILTERS, type StatFilters } from './api';

/*
 * Rank brackets offered in the filter bar. `minBadge` = tier*10 + 1 (lowest subrank).
 * Display names come from /assets/ranks (localised); `fallback` is used until it loads.
 * Tiers: 0 Obscurus · 1 Initiate · 2 Seeker · 3 Acolyte · 4 Sentinel · 5 Mystic ·
 *        6 Ritualist · 7 Emissary · 8 Oracle · 9 Phantom · 10 Ascendant · 11 Eternus
 */
export const RANK_OPTIONS = [
  { id: 'all', tier: 0, minBadge: undefined, fallback: 'All ranks' },
  { id: 'ritualist', tier: 6, minBadge: 61, fallback: 'Ritualist' },
  { id: 'emissary', tier: 7, minBadge: 71, fallback: 'Emissary' },
  { id: 'oracle', tier: 8, minBadge: 81, fallback: 'Oracle' },
  { id: 'phantom', tier: 9, minBadge: 91, fallback: 'Phantom' },
  { id: 'ascendant', tier: 10, minBadge: 101, fallback: 'Ascendant' },
  { id: 'eternus', tier: 11, minBadge: 111, fallback: 'Eternus' },
] as const;

export const PERIOD_DAYS = [3, 7, 14, 30] as const;

export type RankId = (typeof RANK_OPTIONS)[number]['id'];

interface FilterState {
  rank: RankId;
  days: number;
  setRank: (r: RankId) => void;
  setDays: (d: number) => void;
  /** API-ready filters (memoised) */
  filters: StatFilters;
}

const Ctx = createContext<FilterState | null>(null);
const KEY = 'deadbuff.filters.v2';

function load(): { rank: RankId; days: number } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (RANK_OPTIONS.some((r) => r.id === v.rank) && (PERIOD_DAYS as readonly number[]).includes(v.days)) return v;
    }
  } catch {
    /* storage unavailable */
  }
  return { rank: 'all', days: DEFAULT_FILTERS.days };
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, []);
  const [rank, setRank] = useState<RankId>(initial.rank);
  const [days, setDays] = useState<number>(initial.days);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ rank, days }));
    } catch {
      /* ignore */
    }
  }, [rank, days]);

  const filters = useMemo<StatFilters>(
    () => ({ days, minBadge: RANK_OPTIONS.find((r) => r.id === rank)?.minBadge }),
    [rank, days],
  );

  const value = useMemo(() => ({ rank, days, setRank, setDays, filters }), [rank, days, filters]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFilters must be used inside <FilterProvider>');
  return v;
}
