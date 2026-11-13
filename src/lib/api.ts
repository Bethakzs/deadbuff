/* ------------------------------------------------------------------ *
 * Thin client for https://api.deadlock-api.com (public, CORS: *).
 * Every function returns parsed JSON; caching is handled by React Query.
 * ------------------------------------------------------------------ */
import type {
  AbilityOrderStat,
  BuildTag,
  LaneInfo,
  LaneMatchupRow,
  MateStat,
  PlayerHeroStat,
  PlayerMatch,
  PlayerRank,
  PlayerRankRow,
  SteamSearchResult,
  CounterStat,
  Hero,
  HeroBuild,
  HeroBuildStat,
  HeroStat,
  Item,
  ItemBucketStat,
  ItemStat,
  LeaderboardEntry,
  MatchMetadata,
  Patch,
  Rank,
  Region,
  SteamProfile,
  SynergyStat,
} from './types';

export const API_BASE = 'https://api.deadlock-api.com/v1';

type Params = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const query = qs.toString();
  const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new ApiError(res.status, `Deadlock API ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------ filters ----------------------------- */

/** Global stat filters chosen in the filter bar (rank bracket + period). */
export interface StatFilters {
  /** min_average_badge (tier*10 + subtier). undefined = all ranks */
  minBadge?: number;
  /** look-back window in days */
  days: number;
}

/** Rounded to the hour so query keys (and the CDN cache) stay stable. */
export function filterParams(f: StatFilters): Params {
  const hour = 3600;
  const now = Math.floor(Date.now() / 1000 / hour) * hour;
  return {
    min_unix_timestamp: now - f.days * 86400,
    min_average_badge: f.minBadge,
  };
}

/* ------------------------------- assets ----------------------------- */

/* `language` = "english" | "ukrainian" | … — localises names, descriptions, lore and property labels. */

export const fetchHeroes = (language: string, signal?: AbortSignal) =>
  get<Hero[]>('/assets/heroes', { only_active: true, language }, signal);

export const fetchItems = (language: string, signal?: AbortSignal) => get<Item[]>('/assets/items', { language }, signal);

export const fetchRanks = (language: string, signal?: AbortSignal) => get<Rank[]>('/assets/ranks', { language }, signal);

export const fetchPatches = (signal?: AbortSignal) => get<Patch[]>('/patches', {}, signal);

/** ISO timestamps of the big (usually bi-weekly) gameplay patches, newest first. */
export const fetchBigPatchDays = (signal?: AbortSignal) => get<string[]>('/patches/big-days', {}, signal);

/** English names of shop upgrades only — item page slugs are English in every UI language. */
export const fetchUpgradesEn = (signal?: AbortSignal) => get<Item[]>('/assets/items/by-type/upgrade', { language: 'english' }, signal);

export const fetchBuildTags = (language: string, signal?: AbortSignal) =>
  get<BuildTag[]>('/assets/build-tags', { language }, signal);

/** Only lane_info is used (lane names + colours). */
export const fetchGenericData = (language: string, signal?: AbortSignal) =>
  get<{ lane_info: LaneInfo[] }>('/assets/generic-data', { language }, signal);

/* ------------------------------ analytics --------------------------- */

export const fetchHeroStats = (f: StatFilters, signal?: AbortSignal) =>
  get<HeroStat[]>('/analytics/hero-stats', filterParams(f), signal);

export const fetchItemStats = (f: StatFilters, heroId?: number, signal?: AbortSignal) =>
  get<ItemStat[]>('/analytics/item-stats', { ...filterParams(f), hero_id: heroId, min_matches: 50 }, signal);

/**
 * Item stats split by hero (`bucket=hero`, bucket = hero id) or by the minute the item was bought
 * (`bucket=game_time_min`). One call covers every item (~1.5–2 MB raw, ~0.5 MB gzipped), so it is
 * cached once and shared by all item pages.
 */
export const fetchItemStatsBucket = (f: StatFilters, bucket: 'hero' | 'game_time_min', signal?: AbortSignal) =>
  get<ItemBucketStat[]>('/analytics/item-stats', { ...filterParams(f), bucket, min_matches: 50 }, signal);

/** Hero stats inside a fixed time window (patch before/after comparison). */
export const fetchHeroStatsWindow = (min: number, max: number, minBadge: number | undefined, signal?: AbortSignal) =>
  get<HeroStat[]>('/analytics/hero-stats', { min_unix_timestamp: min, max_unix_timestamp: max, min_average_badge: minBadge }, signal);

export const fetchCounterStats = (f: StatFilters, signal?: AbortSignal) =>
  get<CounterStat[]>('/analytics/hero-counter-stats', { ...filterParams(f), min_matches: 100 }, signal);

export const fetchSynergyStats = (f: StatFilters, signal?: AbortSignal) =>
  get<SynergyStat[]>('/analytics/hero-synergy-stats', { ...filterParams(f), min_matches: 100 }, signal);

export const fetchAbilityOrders = (f: StatFilters, heroId: number, signal?: AbortSignal) =>
  get<AbilityOrderStat[]>(
    '/analytics/ability-order-stats',
    { ...filterParams(f), hero_id: heroId, min_matches: 200 },
    signal,
  );

export const fetchHeroBuildStats = (f: StatFilters, heroId: number, signal?: AbortSignal) =>
  get<HeroBuildStat[]>(`/analytics/hero-build-stats/${heroId}`, { ...filterParams(f), min_matches: 30 }, signal);

/**
 * Duo-per-lane stats (⚠ endpoint marked "subject to change" by the API).
 * group_by=assigned_lane,hero_ids → one row per (lane, duo); ~3 × 946 rows, ~50 KB.
 */
export const fetchLaneStats = (f: StatFilters, signal?: AbortSignal) =>
  get<LaneMatchupRow[]>(
    '/analytics/lane-matchup-stats',
    { ...filterParams(f), group_by: 'assigned_lane,hero_ids', min_matches: 30 },
    signal,
  );

/* -------------------------------- builds ---------------------------- */

export interface BuildQuery {
  heroId?: number;
  sortBy?: 'weekly_favorites' | 'favorites' | 'updated_at';
  limit?: number;
  /** pagination offset */
  start?: number;
  search?: string;
  /**
   * Filter by a pinned icon id (server side, so it works across every page):
   * a build-tag id ("For Advanced Players"…), or an item/ability id.
   */
  tag?: number;
}

export const fetchBuilds = (opts: BuildQuery, signal?: AbortSignal) =>
  get<HeroBuild[]>(
    '/builds',
    {
      hero_id: opts.heroId,
      sort_by: opts.sortBy ?? 'weekly_favorites',
      sort_direction: 'desc',
      only_latest: true,
      limit: opts.limit ?? 20,
      start: opts.start,
      search_name: opts.search,
      tag: opts.tag,
    },
    signal,
  );

export const fetchBuildById = async (buildId: number, signal?: AbortSignal) => {
  const list = await get<HeroBuild[]>('/builds', { build_id: buildId, only_latest: true }, signal);
  return list[0] ?? null;
};

/* -------------------------------- players --------------------------- */
/* All public (no key, CORS *): a player page needs no backend. */

export const fetchSteamSearch = (query: string, signal?: AbortSignal) =>
  get<SteamSearchResult[]>('/players/steam-search', { search_query: query, limit: 12 }, signal);

/** Full stored history; complete & up to date only if the account added the Deadlock API bot on Steam. */
export const fetchMatchHistory = (accountId: number, signal?: AbortSignal) =>
  get<PlayerMatch[]>(`/players/${accountId}/match-history`, {}, signal);

export const fetchPlayerHeroStats = (accountId: number, signal?: AbortSignal) =>
  get<PlayerHeroStat[]>('/players/hero-stats', { account_ids: accountId }, signal);

export const fetchPlayerRank = (accountId: number, signal?: AbortSignal) =>
  get<PlayerRank>(`/players/${accountId}/rank`, {}, signal);

/** Ranks of up to 1000 accounts in one call (unranked accounts come back with badge 0). */
export const fetchPlayerRanks = (accountIds: number[], signal?: AbortSignal) =>
  accountIds.length
    ? get<PlayerRankRow[]>('/players/rank', { account_ids: accountIds.join(',') }, signal)
    : Promise.resolve([] as PlayerRankRow[]);

export const fetchMateStats = (accountId: number, signal?: AbortSignal) =>
  get<MateStat[]>(`/players/${accountId}/mate-stats`, { min_matches_played: 3 }, signal);

/** Full match metadata (players, item purchases, stat snapshots). ~1 MB, immutable once the match is parsed. */
export const fetchMatch = (matchId: number, signal?: AbortSignal) => get<MatchMetadata>(`/matches/${matchId}/metadata`, {}, signal);

/** Valve's ranked leaderboard (updated hourly), optionally for one hero. */
export const fetchLeaderboard = (region: Region, heroId?: number, signal?: AbortSignal) =>
  get<{ entries: LeaderboardEntry[] }>(`/leaderboard/${region}${heroId ? `/${heroId}` : ''}`, {}, signal);

export const fetchSteamProfiles = (accountIds: number[], signal?: AbortSignal) =>
  accountIds.length
    ? get<SteamProfile[]>('/players/steam', { account_ids: accountIds.join(',') }, signal)
    : Promise.resolve([] as SteamProfile[]);
