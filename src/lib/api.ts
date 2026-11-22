/* ------------------------------------------------------------------ *
 * Thin client for https://api.deadlock-api.com (public, CORS: *).
 * Every function returns parsed JSON; caching is handled by React Query.
 * ------------------------------------------------------------------ */
import type {
  AbilityOrderStat,
  BuildTag,
  BadgeRow,
  GameMap,
  GenericData,
  NpcUnit,
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
import {
  SNAPSHOT_INDEX,
  SNAPSHOT_MAX_AGE_MS,
  STEAM_SHARDS,
  snapshotFile,
  snapshotHash,
  snapshotKey,
  steamShardFile,
  type SnapshotIndex,
} from './snapshot';

export const API_BASE = 'https://api.deadlock-api.com/v1';

/* `?.`: scripts/prerender.ts imports this module in Node, where import.meta.env does not exist */
const PROD = import.meta.env?.PROD === true;

/**
 * Our own caching proxy (Cloudflare Pages Function `functions/api/dl`): same API, answered from the
 * edge cache with stale-while-revalidate — a cold analytics query takes the API 1–5 s, a cached one ~10 ms.
 * Used in production builds; in `npm run dev` only with VITE_API_PROXY=1 (needs `npm run dev:api`).
 * Every proxy call is a Function invocation (Free plan: 100k a day), so production builds answer the
 * default-filter queries from build-time static files first (lib/snapshot.ts, see fromSnapshot()).
 */
const PROXY_BASE = '/api/dl';
let viaProxy = PROD || import.meta.env?.VITE_API_PROXY === '1';

type Params = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

/** Build-time fetcher: scripts/prerender.ts sends every call through its own Node fetch (retries + snapshot files). */
type Transport = (path: string, params: Params) => Promise<unknown>;
let transport: Transport | undefined;
export function setTransport(fn: Transport) {
  transport = fn;
}

/* ---------------------------- static snapshots ---------------------- */

const isJson = (res: Response) => res.ok && (res.headers.get('content-type') ?? '').includes('json');

interface LoadedIndex {
  keys: Set<string>;
  steam: Set<number>;
}
let snapIndex: Promise<LoadedIndex | null> | undefined;

/** dist/data/index.json of this deployment, once per page load (preloaded by the HTML); null = no usable snapshots. */
function snapshotIndex(): Promise<LoadedIndex | null> {
  snapIndex ??= fetch(`/${SNAPSHOT_INDEX}`)
    .then((res) => (isJson(res) ? (res.json() as Promise<SnapshotIndex>) : null))
    .then((m) => (m && Date.now() - m.at < SNAPSHOT_MAX_AGE_MS ? { keys: new Set(m.keys), steam: new Set(m.steam) } : null))
    .catch(() => null);
  return snapIndex;
}

/** The build-time answer to this exact query, or undefined (not saved, outdated, or the file is gone) → ask the proxy. */
async function fromSnapshot<T>(path: string, params: Params, signal?: AbortSignal): Promise<T | undefined> {
  const index = await snapshotIndex();
  const hash = snapshotHash(snapshotKey(path, params));
  if (!index?.keys.has(hash)) return undefined;
  try {
    const res = await fetch(`/${snapshotFile(hash)}`, { signal });
    // a file missing from a newer deployment comes back as the SPA's index.html, hence the type check
    if (isJson(res)) return (await res.json()) as T;
  } catch (e) {
    if (isAbort(e)) throw e;
  }
  return undefined;
}

const steamShards = new Map<number, Promise<SteamProfile[]>>();
function steamShard(n: number): Promise<SteamProfile[]> {
  let p = steamShards.get(n);
  if (!p) {
    p = fetch(`/${steamShardFile(n)}`).then((res) => (isJson(res) ? (res.json() as Promise<SteamProfile[]>) : Promise.reject(new Error('no shard'))));
    p.catch(() => steamShards.delete(n));
    steamShards.set(n, p);
  }
  return p;
}

/** Steam profiles of build authors saved at build time — only when every requested account is among them. */
async function steamFromSnapshot(ids: number[]): Promise<SteamProfile[] | undefined> {
  if (!PROD || transport) return undefined;
  const index = await snapshotIndex();
  if (!index || !ids.every((id) => index.steam.has(id))) return undefined;
  try {
    const shards = await Promise.all([...new Set(ids.map((id) => id % STEAM_SHARDS))].map(steamShard));
    const byId = new Map(shards.flat().map((p) => [p.account_id, p]));
    const found = ids.map((id) => byId.get(id));
    return found.every(Boolean) ? (found as SteamProfile[]) : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------- fetching --------------------------- */

async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const clean: Params = {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    clean[k] = v;
    qs.set(k, String(v));
  }
  if (transport) return (await transport(path, clean)) as T;
  const query = qs.toString();
  const suffix = `${path}${query ? `?${query}` : ''}`;

  // static files work even when the Function quota is used up
  if (PROD) {
    const snap = await fromSnapshot<T>(path, clean, signal);
    if (snap !== undefined) return snap;
  }

  if (viaProxy) {
    try {
      const res = await fetch(`${PROXY_BASE}${suffix}`, { signal });
      // the proxy marks everything that came from the API (errors included)
      if (res.headers.get('x-proxy-upstream')) {
        if (!res.ok) throw new ApiError(res.status, `Deadlock API ${res.status} on ${path}`);
        return (await res.json()) as T;
      }
      // anything else (Function quota exceeded, an HTML fallback page…) → talk to the API directly from now on
      viaProxy = false;
    } catch (e) {
      if (e instanceof ApiError || isAbort(e)) throw e;
      viaProxy = false;
    }
  }

  const res = await fetch(`${API_BASE}${suffix}`, { signal });
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

/** What a first visit sees (all ranks, last 7 days) — the prerender saves these queries as static snapshots. */
export const DEFAULT_FILTERS: StatFilters = { days: 7 };

/**
 * Window start rounded down to the UTC day, so a query (and its cache entry in our proxy and the
 * API's CDN) stays the same for a whole day instead of changing every hour. "7 days" therefore
 * means 7–8 days of matches — no visible difference in the numbers, many more cache hits.
 */
export const dayStart = (daysAgo: number) => Math.floor(Date.now() / 1000 / 86400) * 86400 - daysAgo * 86400;

export function filterParams(f: StatFilters): Params {
  return {
    min_unix_timestamp: dayStart(f.days),
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

/** Lane names + colours everywhere; place names, prices, soul shares and Rejuvenator numbers on the wiki. */
export const fetchGenericData = (language: string, signal?: AbortSignal) => get<GenericData>('/assets/generic-data', { language }, signal);

/** Players by rank (latest ranked match since `since`) — wiki ranks page. */
export const fetchBadgeDistribution = (since: number, signal?: AbortSignal) =>
  get<BadgeRow[]>('/analytics/badge-distribution', { min_unix_timestamp: since }, signal);

/** Minimap, ziplines, neutral camps, shops, teleporters… with positions (wiki map). ~110 KB, not localised. */
export const fetchMap = (signal?: AbortSignal) => get<GameMap>('/assets/map', {}, signal);

/** Troopers, objectives and neutrals: health, souls, Walker stomp… (wiki). Names come localised. */
export const fetchNpcUnits = (language: string, signal?: AbortSignal) => get<NpcUnit[]>('/assets/npc-units', { language }, signal);

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

/** Per-hero stats of several accounts at once (rows carry account_id), optionally only since `days` ago. */
export const fetchPlayersHeroStats = (accountIds: number[], days: number | undefined, signal?: AbortSignal) =>
  get<PlayerHeroStat[]>('/players/hero-stats', { account_ids: accountIds.join(','), min_unix_timestamp: days ? dayStart(days) : undefined }, signal);

/**
 * Hero stats of matches whose average rank lies in [minBadge, maxBadge] — "the average at your rank".
 * The API needs `bucket` off here; rows look exactly like the overall hero stats.
 */
export const fetchHeroStatsAtRank = (minBadge: number | undefined, maxBadge: number | undefined, days: number, signal?: AbortSignal) =>
  get<HeroStat[]>('/analytics/hero-stats', { min_unix_timestamp: dayStart(days), min_average_badge: minBadge, max_average_badge: maxBadge }, signal);

/** Item stats of one hero in high-rank matches (badge ≥ minBadge) — "what top players buy, and when". */
export const fetchTopItemStats = (heroId: number, minBadge: number, days: number, signal?: AbortSignal) =>
  get<ItemStat[]>('/analytics/item-stats', { hero_id: heroId, min_average_badge: minBadge, min_unix_timestamp: dayStart(days), min_matches: 20 }, signal);

/** Item stats of one hero in matches where `enemyId` was on the other team ("what beats hero X"). */
/** Item stats in games where `enemyId` was on the enemy team — of one hero, or of every hero when `heroId` is undefined. */
export const fetchItemStatsVsEnemy = (f: StatFilters, heroId: number | undefined, enemyId: number, signal?: AbortSignal) =>
  get<ItemStat[]>('/analytics/item-stats', { ...filterParams(f), hero_id: heroId, enemy_hero_ids: enemyId, min_matches: 30 }, signal);

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

export const fetchSteamProfiles = async (accountIds: number[], signal?: AbortSignal) => {
  if (!accountIds.length) return [] as SteamProfile[];
  return (await steamFromSnapshot(accountIds)) ?? get<SteamProfile[]>('/players/steam', { account_ids: accountIds.join(',') }, signal);
};
