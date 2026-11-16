/* ------------------------------------------------------------------ *
 * Draft maths (pure — used by pages/Draft.tsx).
 *
 * A candidate's expected win rate in a draft =
 *   its overall win rate
 *   + Σ over enemies:  counter effect of that pair
 *   + Σ over allies:   synergy effect of that pair
 * where an effect is what the pair does BEYOND the two heroes' own strength:
 *   facing E, any hero wins about  WR(H) − (WR(E) − 50%)   (a strong enemy drags everyone down),
 *   next to A, any hero wins about WR(H) + (WR(A) − 50%),
 * so effect = actual pair win rate − that expectation. Without this, six strong enemies show up as
 * "red" on every candidate although none of them is a real counter.
 * Effects are summed like Dotabuff's "advantage" and shrunk by n / (n + SHRINK) so a pair with few games can't dominate.
 * ------------------------------------------------------------------ */
import { ROLE_KEYS, heroRoleScores, type RoleKey } from './roles';
import type { CounterStat, Hero, ItemStat, SynergyStat } from './types';

const SHRINK = 200;
/** clamp the estimate — six summed deltas can drift far, real drafts rarely leave 35–65 % */
const CLAMP: [number, number] = [0.3, 0.7];

export interface PairIndex {
  vs: Map<string, { wins: number; matches: number }>;
  with: Map<string, { wins: number; matches: number }>;
}

export function pairIndex(counters: CounterStat[] = [], synergy: SynergyStat[] = []): PairIndex {
  const vs = new Map<string, { wins: number; matches: number }>();
  for (const c of counters) if (c.matches_played > 0) vs.set(`${c.hero_id}:${c.enemy_hero_id}`, { wins: c.wins, matches: c.matches_played });
  const w = new Map<string, { wins: number; matches: number }>();
  for (const s of synergy) {
    if (s.matches_played <= 0) continue;
    const v = { wins: s.wins, matches: s.matches_played };
    w.set(`${s.hero_id1}:${s.hero_id2}`, v);
    w.set(`${s.hero_id2}:${s.hero_id1}`, v);
  }
  return { vs, with: w };
}

export interface PairEffect {
  hero: Hero;
  /** shrunk win-rate change for the candidate */
  delta: number;
  /** raw win rate of the pair (candidate vs / with this hero), 0 without games */
  wr: number;
  matches: number;
}

export interface PickScore {
  hero: Hero;
  /** overall win rate (current filters) */
  base: number;
  vs: PairEffect[];
  with: PairEffect[];
  /** Σ deltas */
  advantage: number;
  /** base + advantage, clamped */
  expected: number;
}

/** `sign` −1 for an enemy (its strength lowers our chances), +1 for an ally. */
function effect(map: PairIndex['vs'], heroId: number, other: Hero, base: number, otherBase: number | undefined, sign: 1 | -1): PairEffect {
  const s = map.get(`${heroId}:${other.id}`);
  if (!s) return { hero: other, delta: 0, wr: 0, matches: 0 };
  const expected = base + sign * ((otherBase ?? 0.5) - 0.5);
  const wr = s.wins / s.matches;
  return { hero: other, delta: (wr - expected) * (s.matches / (s.matches + SHRINK)), wr, matches: s.matches };
}

/** Score one hero against `enemies` alongside `allies`; `baseWr` = every hero's overall win rate. */
export function scoreHero(hero: Hero, baseWr: Map<number, number>, idx: PairIndex, enemies: Hero[], allies: Hero[]): PickScore {
  const base = baseWr.get(hero.id) ?? 0.5;
  const vs = enemies.map((e) => effect(idx.vs, hero.id, e, base, baseWr.get(e.id), -1));
  const withA = allies.filter((a) => a.id !== hero.id).map((a) => effect(idx.with, hero.id, a, base, baseWr.get(a.id), 1));
  const advantage = [...vs, ...withA].reduce((s, x) => s + x.delta, 0);
  const expected = Math.min(CLAMP[1], Math.max(CLAMP[0], base + advantage));
  return { hero, base, vs, with: withA, advantage, expected };
}

/** Every hero that isn't picked yet, best expected win rate first. */
export function rankPicks(heroes: Hero[], baseWr: Map<number, number>, idx: PairIndex, enemies: Hero[], allies: Hero[]): PickScore[] {
  const taken = new Set([...enemies, ...allies].map((h) => h.id));
  return heroes
    .filter((h) => !taken.has(h.id) && baseWr.has(h.id))
    .map((h) => scoreHero(h, baseWr, idx, enemies, allies))
    .sort((a, b) => b.expected - a.expected);
}

/** Pair effects with fewer games than this are too noisy to call a hero a counter. */
export const MIN_PAIR_GAMES = 300;

/**
 * Best answers to one enemy: the candidates whose effect against it is the largest
 * (the counter list of /counters/:slug and the "answers" block of the draft).
 */
export function answersTo(enemy: Hero, picks: PickScore[], n = 3): { hero: Hero; fx: PairEffect }[] {
  return picks
    .map((p) => ({ hero: p.hero, fx: p.vs.find((e) => e.hero.id === enemy.id) }))
    .filter((x): x is { hero: Hero; fx: PairEffect } => !!x.fx && x.fx.matches >= MIN_PAIR_GAMES)
    .sort((a, b) => b.fx.delta - a.fx.delta)
    .slice(0, n);
}

/** Every hero scored against a single enemy — `counters` best first, `victims` (heroes it beats) worst first. */
export function countersOf(enemy: Hero, heroes: Hero[], baseWr: Map<number, number>, idx: PairIndex) {
  const scored = rankPicks(heroes, baseWr, idx, [enemy], [])
    .map((p) => ({ hero: p.hero, base: p.base, fx: p.vs[0] }))
    .filter((x) => x.fx.matches >= MIN_PAIR_GAMES)
    .sort((a, b) => b.fx.delta - a.fx.delta);
  return { counters: scored.filter((x) => x.fx.delta > 0), victims: scored.filter((x) => x.fx.delta < 0).reverse() };
}

/* ------------------------------ team roles ----------------------------- */

export interface RoleNeed {
  /** best rating any ally has in each role (0–10) */
  coverage: Record<RoleKey, number>;
  /** weakest-covered role, or null when every role has someone rated ≥ 7 */
  missing: RoleKey | null;
}

export function teamRoles(allies: Hero[]): RoleNeed {
  const coverage = Object.fromEntries(ROLE_KEYS.map((r) => [r, 0])) as Record<RoleKey, number>;
  for (const a of allies) {
    const s = heroRoleScores(a);
    if (!s) continue;
    for (const r of ROLE_KEYS) coverage[r] = Math.max(coverage[r], s[r]);
  }
  const weakest = [...ROLE_KEYS].sort((x, y) => coverage[x] - coverage[y])[0];
  return { coverage, missing: allies.length && coverage[weakest] < 7 ? weakest : null };
}

/* ------------------------- items against a lineup ---------------------- */

export interface ItemVsLineup {
  itemId: number;
  /** average shrunk win-rate change over the enemies with data */
  score: number;
  /** enemies this item does best against (delta > 1 %) */
  bestVs: { enemyId: number; delta: number }[];
  baseWr: number;
  baseMatches: number;
}

/**
 * Items whose win rate on this hero rises most when these enemies are in the game.
 * Comparing an item with ITSELF (vs enemy X vs overall) cancels the late-game bias of raw item win rates.
 */
export function itemsVsLineup(base: ItemStat[], perEnemy: { enemyId: number; stats: ItemStat[] }[], isShop: (id: number) => boolean): ItemVsLineup[] {
  const total = Math.max(1, ...base.map((s) => s.matches));
  const baseById = new Map(base.map((s) => [s.item_id, s]));
  // A strong enemy lowers the win rate of EVERY item; that shift (the match-weighted average change)
  // is the hero's own matchup, not something an item fixes — subtract it so only the item's part remains.
  const shift = new Map<number, number>();
  for (const e of perEnemy) {
    let sum = 0;
    let n = 0;
    for (const s of e.stats) {
      const b = baseById.get(s.item_id);
      if (!b || !s.matches) continue;
      sum += (s.wins / s.matches - b.wins / b.matches) * s.matches;
      n += s.matches;
    }
    shift.set(e.enemyId, n ? sum / n : 0);
  }
  const out: ItemVsLineup[] = [];
  for (const b of base) {
    // ignore rare items (bought in < 3 % of this hero's games) — their deltas are noise
    if (!isShop(b.item_id) || b.matches < total * 0.03) continue;
    const bw = b.wins / b.matches;
    const deltas: { enemyId: number; delta: number }[] = [];
    for (const e of perEnemy) {
      const s = e.stats.find((x) => x.item_id === b.item_id);
      if (!s || s.matches < 30) continue;
      const raw = s.wins / s.matches - bw - (shift.get(e.enemyId) ?? 0);
      deltas.push({ enemyId: e.enemyId, delta: raw * (s.matches / (s.matches + 150)) });
    }
    if (!deltas.length) continue;
    out.push({
      itemId: b.item_id,
      score: deltas.reduce((a, d) => a + d.delta, 0) / Math.max(deltas.length, perEnemy.length / 2),
      bestVs: deltas.filter((d) => d.delta > 0.01).sort((x, y) => y.delta - x.delta).slice(0, 3),
      baseWr: bw,
      baseMatches: b.matches,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
