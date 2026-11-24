/* ------------------------------------------------------------------ *
 * Pro players — a "pro tracker" over the Deadlock API.
 *
 * The game has no official pro / esports list and the API none either, so the top of Valve's ranked
 * leaderboard stands in: the first PROS_PER_REGION names of every region. Valve publishes only the NAME;
 * when several accounts share it, the one with the highest rank is taken (like /leaderboard), and a name
 * shared by more than MAX_CANDIDATES accounts is skipped instead of guessing.
 *
 * The list is made at build time (scripts/prerender.ts → dist/data/pros.json, ~15 KB) — the leaderboards
 * alone are ~1 MB per region. Their games come from one GET /matches/metadata over all the pro accounts:
 * the hero page's query is saved as a snapshot by the prerender (free), /pros asks the proxy (fresh).
 * Tournaments and scrims are played in private lobbies — the "lobby" filter.
 * ------------------------------------------------------------------ */
import { fetchLeaderboard, fetchPlayerRanks } from './api';
import { isShopItem } from './items';
import type { Item, LeaderboardEntry, PlayerRankRow, ProMatch, ProMatchPlayer, ProPlayer, Region } from './types';

export const PRO_REGIONS: Region[] = ['Europe', 'NAmerica', 'SAmerica', 'Asia', 'Oceania'];
/** Short region tags (the same in every language). */
export const REGION_TAG: Record<Region, string> = { Europe: 'EU', NAmerica: 'NA', SAmerica: 'SA', Asia: 'ASIA', Oceania: 'OCE' };
/** 5 regions × 60 = up to 300 accounts — still one URL for /matches/metadata (the proxy allows 4000 chars). */
export const PROS_PER_REGION = 60;
const MAX_CANDIDATES = 32;
const RANK_CHUNK = 200;

/** Static file with the pro list (written by the prerender). */
export const PROS_FILE = 'data/pros.json';
export interface ProsFile {
  /** build time (ms) */
  at: number;
  pros: ProPlayer[];
}

/** Hero page block: games of the last 2 weeks on the hero (saved as a snapshot at build time). */
export const HERO_PRO_DAYS = 14;
export const HERO_PRO_LIMIT = 40;
/** /pros feed: the last 3 days (lobbies are rarer: 2 weeks), newest first. */
export const PROS_DAYS = 3;
export const PROS_LOBBY_DAYS = 14;
export const PROS_LIMIT = 100;

/** Sorted pro account ids — the same list (and so the same snapshot key) in the prerender and the SPA. */
export const proIds = (pros: ProPlayer[]) => pros.map((p) => p.id).sort((a, b) => a - b);

/** Where computePros() gets the leaderboards and ranks (the prerender passes calls that are not saved as snapshots). */
export interface ProSources {
  leaderboard: (region: Region) => Promise<{ entries: LeaderboardEntry[] }>;
  ranks: (ids: number[]) => Promise<PlayerRankRow[]>;
}

/** The pro list straight from the API (the prerender; the SPA only when pros.json is missing, e.g. in dev). */
export async function computePros(signal?: AbortSignal, src?: ProSources): Promise<ProPlayer[]> {
  const leaderboard = src?.leaderboard ?? ((r: Region) => fetchLeaderboard(r, undefined, signal));
  const fetchRanks = src?.ranks ?? ((ids: number[]) => fetchPlayerRanks(ids, signal));
  const boards = await Promise.all(
    PRO_REGIONS.map((r) =>
      leaderboard(r)
        .then((b) => (b.entries ?? []).slice(0, PROS_PER_REGION))
        .catch(() => [] as LeaderboardEntry[]),
    ),
  );
  // same-name accounts: ask for their ranks (the leaderboard player is the best-ranked one)
  const check = new Set<number>();
  for (const e of boards.flat()) {
    const c = e.possible_account_ids ?? [];
    if (c.length > 1 && c.length <= MAX_CANDIDATES) c.forEach((id) => check.add(id));
  }
  const ids = [...check].sort((a, b) => a - b);
  const ranks = new Map<number, { badge: number; at: number }>();
  for (let i = 0; i < ids.length; i += RANK_CHUNK) {
    const rows = await fetchRanks(ids.slice(i, i + RANK_CHUNK)).catch(() => [] as PlayerRankRow[]);
    for (const r of rows) ranks.set(r.account_id, { badge: r.badge ?? 0, at: r.last_match?.start_time ?? 0 });
  }
  const resolve = (e: LeaderboardEntry): number | undefined => {
    const c = e.possible_account_ids ?? [];
    if (c.length <= 1) return c[0];
    let best: { id: number; badge: number; at: number } | undefined;
    for (const id of c) {
      const r = ranks.get(id);
      if (!r?.badge) continue;
      if (!best || r.badge > best.badge || (r.badge === best.badge && r.at > best.at)) best = { id, ...r };
    }
    return best?.id;
  };

  const out: ProPlayer[] = [];
  const seen = new Set<number>();
  boards.forEach((entries, i) => {
    for (const e of entries) {
      const id = resolve(e);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: e.account_name, region: PRO_REGIONS[i], rank: e.rank, heroes: e.top_hero_ids ?? [] });
    }
  });
  return out;
}

/* ------------------------------ the feed ------------------------------ */

/** One pro in one match — a row of the feed. */
export interface ProGame {
  match: ProMatch;
  player: ProMatchPlayer;
  pro: ProPlayer;
  won: boolean;
  /** unix seconds */
  at: number;
  /** a private lobby: tournaments and scrims */
  lobby: boolean;
  /** final build: shop items bought and not sold, in buy order */
  items: number[];
}

/** "2026-11-24 22:14:48" (UTC) → unix seconds. */
export const matchTime = (s: string) => Math.floor(Date.parse(`${s.replace(' ', 'T')}Z`) / 1000) || 0;

export const isLobby = (m: ProMatch) => /lobby/i.test(m.match_mode ?? '');

/** Shop items the player ended the match with, in buy order. */
export function finalItems(p: ProMatchPlayer, byId: Map<number, Item>): number[] {
  const ids = p.items_item_id ?? [];
  const sold = p.items_sold_time_s ?? [];
  const out: number[] = [];
  ids.forEach((id, i) => {
    const item = byId.get(id);
    if (!sold[i] && item && isShopItem(item) && !out.includes(id)) out.push(id);
  });
  return out;
}

/** Feed rows, newest first. With `heroId` only the pros who played that hero. */
export function proGames(matches: ProMatch[] | undefined, pros: Map<number, ProPlayer>, byId: Map<number, Item>, heroId?: number): ProGame[] {
  const out: ProGame[] = [];
  for (const m of matches ?? []) {
    for (const p of m.players ?? []) {
      const pro = pros.get(p.account_id);
      if (!pro || (heroId && p.hero_id !== heroId)) continue;
      out.push({ match: m, player: p, pro, won: p.team === m.winning_team, at: matchTime(m.start_time), lobby: isLobby(m), items: finalItems(p, byId) });
    }
  }
  return out.sort((a, b) => b.at - a.at || b.match.match_id - a.match.match_id);
}

export interface Tally {
  games: number;
  wins: number;
}

/** Heroes the pros played in the feed — "the pro meta". */
export function heroTally(games: ProGame[]): { heroId: number; games: number; wins: number }[] {
  const by = new Map<number, Tally>();
  for (const g of games) {
    const t = by.get(g.player.hero_id) ?? { games: 0, wins: 0 };
    t.games++;
    if (g.won) t.wins++;
    by.set(g.player.hero_id, t);
  }
  return [...by].map(([heroId, t]) => ({ heroId, ...t })).sort((a, b) => b.games - a.games || b.wins - a.wins);
}

/** The pros in the feed with their games, wins and K/D/A. */
export function proTally(games: ProGame[]): { pro: ProPlayer; games: number; wins: number; kills: number; deaths: number; assists: number }[] {
  const by = new Map<number, { pro: ProPlayer; games: number; wins: number; kills: number; deaths: number; assists: number }>();
  for (const g of games) {
    const t = by.get(g.pro.id) ?? { pro: g.pro, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    t.games++;
    if (g.won) t.wins++;
    t.kills += g.player.kills;
    t.deaths += g.player.deaths;
    t.assists += g.player.assists;
    by.set(g.pro.id, t);
  }
  return [...by.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

/** How often each item ends up in the pros' final builds (share of their games). */
export function itemTally(games: ProGame[]): { itemId: number; share: number; wins: number; games: number }[] {
  const by = new Map<number, Tally>();
  for (const g of games) {
    for (const id of g.items) {
      const t = by.get(id) ?? { games: 0, wins: 0 };
      t.games++;
      if (g.won) t.wins++;
      by.set(id, t);
    }
  }
  const n = Math.max(1, games.length);
  return [...by].map(([itemId, t]) => ({ itemId, share: t.games / n, ...t })).sort((a, b) => b.games - a.games);
}
