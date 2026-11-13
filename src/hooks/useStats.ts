import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  fetchAbilityOrders,
  fetchBuildById,
  fetchBuilds,
  fetchCounterStats,
  fetchHeroBuildStats,
  fetchHeroStats,
  fetchHeroStatsWindow,
  fetchItemStats,
  fetchItemStatsBucket,
  fetchLeaderboard,
  fetchLaneStats,
  fetchSteamProfiles,
  fetchSynergyStats,
  type BuildQuery,
} from '../lib/api';
import { useFilters } from '../lib/filters';
import { buildHeroRows } from '../lib/heroes';
import type { HeroBuild, Region } from '../lib/types';
import { useHeroes } from './useAssets';

/* Analytics refresh hourly on the API side; 10 min client cache is plenty. */
const LIVE = { staleTime: 10 * 60_000, placeholderData: keepPreviousData } as const;

export function useHeroStats() {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['hero-stats', filters],
    queryFn: ({ signal }) => fetchHeroStats(filters, signal),
    ...LIVE,
  });
}

/** Hero stats joined with hero assets + derived metrics (win rate, pick rate, KDA, tier). */
export function useHeroRows() {
  const heroes = useHeroes();
  const stats = useHeroStats();
  const rows = useMemo(
    () => (heroes.list.length && stats.data ? buildHeroRows(heroes.list, stats.data) : []),
    [heroes.list, stats.data],
  );
  return {
    rows,
    isLoading: heroes.isLoading || stats.isLoading,
    isFetching: stats.isFetching,
    error: heroes.error ?? stats.error,
  };
}

export function useItemStats(heroId?: number) {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['item-stats', filters, heroId ?? 'all'],
    queryFn: ({ signal }) => fetchItemStats(filters, heroId, signal),
    ...LIVE,
  });
}

/** Item stats per hero or per buy minute, for every item at once (shared by all item pages). */
export function useItemStatsBucket(bucket: 'hero' | 'game_time_min') {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['item-stats-bucket', bucket, filters],
    queryFn: ({ signal }) => fetchItemStatsBucket(filters, bucket, signal),
    ...LIVE,
  });
}

/** Hero stats in a fixed window — past windows never change, so they are cached for an hour. */
export function useHeroStatsWindow(win: { min: number; max: number } | undefined) {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['hero-stats-window', win?.min, win?.max, filters.minBadge],
    queryFn: ({ signal }) => fetchHeroStatsWindow(win!.min, win!.max, filters.minBadge, signal),
    enabled: !!win && win.max > win.min,
    staleTime: 60 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLeaderboard(region: Region, heroId?: number) {
  return useQuery({
    queryKey: ['leaderboard', region, heroId ?? 'all'],
    queryFn: ({ signal }) => fetchLeaderboard(region, heroId, signal),
    staleTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useCounterStats() {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['counter-stats', filters],
    queryFn: ({ signal }) => fetchCounterStats(filters, signal),
    ...LIVE,
  });
}

export function useSynergyStats() {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['synergy-stats', filters],
    queryFn: ({ signal }) => fetchSynergyStats(filters, signal),
    ...LIVE,
  });
}

export function useAbilityOrders(heroId: number) {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['ability-orders', filters, heroId],
    queryFn: ({ signal }) => fetchAbilityOrders(filters, heroId, signal),
    ...LIVE,
  });
}

export function useHeroBuildStats(heroId: number) {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['hero-build-stats', filters, heroId],
    queryFn: ({ signal }) => fetchHeroBuildStats(filters, heroId, signal),
    ...LIVE,
  });
}

export function useLaneStats() {
  const { filters } = useFilters();
  return useQuery({
    queryKey: ['lane-stats', filters],
    queryFn: ({ signal }) => fetchLaneStats(filters, signal),
    ...LIVE,
  });
}

export function useBuilds(opts: Parameters<typeof fetchBuilds>[0]) {
  return useQuery({
    queryKey: ['builds', opts],
    queryFn: ({ signal }) => fetchBuilds(opts, signal),
    staleTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Paginated build search (start/limit). `fetchNextPage()` loads the next `pageSize` builds;
 * `hasNextPage` is false once the API returns a short page.
 */
export function useBuildPages(opts: Omit<BuildQuery, 'start' | 'limit'> & { pageSize: number }, enabled = true) {
  const { pageSize, ...query } = opts;
  return useInfiniteQuery({
    queryKey: ['build-pages', opts],
    queryFn: ({ pageParam, signal }) => fetchBuilds({ ...query, start: pageParam, limit: pageSize }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === pageSize ? all.length * pageSize : undefined),
    enabled,
    staleTime: 15 * 60_000,
  });
}

/** Fetches full build definitions for a list of build ids (one request each, cached forever per id). */
export function useBuildsByIds(ids: number[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['build', id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchBuildById(id, signal),
      staleTime: 60 * 60_000,
    })),
  });
  const builds = results.map((r) => r.data).filter((b): b is HeroBuild => !!b);
  return { builds, isLoading: results.some((r) => r.isLoading) };
}

export function useSteamProfiles(accountIds: number[]) {
  const ids = useMemo(() => [...new Set(accountIds)].sort((a, b) => a - b), [accountIds]);
  const q = useQuery({
    queryKey: ['steam', ids],
    queryFn: ({ signal }) => fetchSteamProfiles(ids, signal),
    enabled: ids.length > 0,
    staleTime: 60 * 60_000,
  });
  return useMemo(() => new Map((q.data ?? []).map((p) => [p.account_id, p])), [q.data]);
}
