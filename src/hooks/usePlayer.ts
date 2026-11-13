import { useQuery } from '@tanstack/react-query';
import { fetchMatchHistory, fetchMateStats, fetchPlayerHeroStats, fetchPlayerRank, fetchSteamSearch } from '../lib/api';

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

export function useMatchHistory(accountId: number) {
  return useQuery({ queryKey: ['match-history', accountId], queryFn: ({ signal }) => fetchMatchHistory(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

export function usePlayerHeroStats(accountId: number) {
  return useQuery({ queryKey: ['player-hero-stats', accountId], queryFn: ({ signal }) => fetchPlayerHeroStats(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

export function usePlayerRank(accountId: number) {
  return useQuery({ queryKey: ['player-rank', accountId], queryFn: ({ signal }) => fetchPlayerRank(accountId, signal), enabled: ok(accountId), ...PLAYER });
}

export function useMateStats(accountId: number) {
  return useQuery({ queryKey: ['mate-stats', accountId], queryFn: ({ signal }) => fetchMateStats(accountId, signal), enabled: ok(accountId), ...PLAYER });
}
