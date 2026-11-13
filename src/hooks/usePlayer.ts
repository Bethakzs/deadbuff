import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchMatch, fetchMatchHistory, fetchMateStats, fetchPlayerHeroStats, fetchPlayerRank, fetchPlayerRanks, fetchPlayersHeroStats, fetchSteamSearch } from '../lib/api';
import type { PlayerRankRow } from '../lib/types';

/* Player data changes after every match: short cache, no keepPreviousData (different players). */
const PLAYER = { staleTime: 2 * 60_000, retry: 1 } as const;
const ok = (id: number) => Number.isInteger(id) && id > 0;

export function useSteamSearch(query: string) {
  return useQuery({
    queryKey: ['steam-search', query],
    queryFn: ({ signal }) => fetchSteamSearch(query, signal),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
}

/** A parsed match never changes: cache it for the session. */
export function useMatch(matchId: number) {
  return useQuery({ queryKey: ['match', matchId], queryFn: ({ signal }) => fetchMatch(matchId, signal), enabled: ok(matchId), staleTime: Infinity, retry: 1 });
}

export function useMatchHistory(accountId: number) {
  return useQuery({ queryKey: ['match-history', accountId], queryFn: ({ signal }) => fetchMatchHistory(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

export function usePlayerHeroStats(accountId: number) {
  return useQuery({ queryKey: ['player-hero-stats', accountId], queryFn: ({ signal }) => fetchPlayerHeroStats(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

export function usePlayerRank(accountId: number) {
  return useQuery({ queryKey: ['player-rank', accountId], queryFn: ({ signal }) => fetchPlayerRank(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

/** Ranks for a list of accounts, in URL-sized chunks (the leaderboard resolves same-name accounts with it). */
export function usePlayerRanks(accountIds: number[]) {
  const chunks = useMemo(() => {
    const ids = [...new Set(accountIds)].sort((a, b) => a - b);
    const out: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) out.push(ids.slice(i, i + 200));
    return out;
  }, [accountIds]);
  const results = useQueries({
    queries: chunks.map((ids) => ({
      queryKey: ['player-ranks', ids],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPlayerRanks(ids, signal),
      staleTime: 30 * 60_000,
    })),
  });
  return useMemo(() => {
    const map = new Map<number, PlayerRankRow>();
    for (const r of results) for (const row of r.data ?? []) map.set(row.account_id, row);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join()]);
}

export function useMateStats(accountId: number) {
  return useQuery({ queryKey: ['mate-stats', accountId], queryFn: ({ signal }) => fetchMateStats(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

/** Per-hero stats of one or more accounts (dashboard, compare), optionally only the last `days`. */
export function usePlayersHeroStats(accountIds: number[], days?: number) {
  const ids = useMemo(() => [...new Set(accountIds.filter(ok))].sort((a, b) => a - b), [accountIds]);
  return useQuery({
    queryKey: ['players-hero-stats', ids, days ?? 0],
    queryFn: ({ signal }) => fetchPlayersHeroStats(ids, days, signal),
    enabled: ids.length > 0,
    ...PLAYER,
  });
}
