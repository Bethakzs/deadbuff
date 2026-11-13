/* ------------------------------------------------------------------ *
 * Derived numbers for the match page: team totals, lane outcomes and
 * objective counts. Pure functions over /matches/{id}/metadata.
 * ------------------------------------------------------------------ */
import type { MatchInfo, MatchPlayer, MatchStatSnapshot } from './types';

/** The laning phase is over around 10 minutes — lane winners are judged on souls at that point. */
export const LANE_END_S = 600;

/** A lane counts as even below this soul difference (and below LANE_DRAW_SHARE of the bigger side). */
const LANE_DRAW_SOULS = 600;
const LANE_DRAW_SHARE = 0.08;

/** The last stat snapshot at or before `seconds` (snapshots are every ~3 minutes). */
export function statAt(p: MatchPlayer, seconds: number): MatchStatSnapshot | undefined {
  let best: MatchStatSnapshot | undefined;
  for (const s of p.stats ?? []) if (s.time_stamp_s <= seconds && (!best || s.time_stamp_s > best.time_stamp_s)) best = s;
  return best;
}

/** Final snapshot = the player's end-of-match numbers. */
export const finalStat = (p: MatchPlayer): MatchStatSnapshot | undefined => p.stats?.at(-1);

export interface TeamTotals {
  team: number;
  players: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  /** damage dealt to enemy players */
  damage: number;
  damageTaken: number;
  healing: number;
  bossDamage: number;
  lastHits: number;
  denies: number;
  /** shots landed / shots fired, 0 when the team never fired */
  accuracy: number;
  /** own structures that fell */
  objectivesLost: number;
}

export function teamTotals(info: MatchInfo, team: number): TeamTotals {
  const players = info.players.filter((p) => p.team === team);
  const sum = (f: (s: MatchStatSnapshot) => number) => players.reduce((a, p) => a + (finalStat(p) ? f(finalStat(p)!) : 0), 0);
  const hit = sum((s) => s.shots_hit ?? 0);
  const missed = sum((s) => s.shots_missed ?? 0);
  return {
    team,
    players: players.length,
    kills: players.reduce((a, p) => a + p.kills, 0),
    deaths: players.reduce((a, p) => a + p.deaths, 0),
    assists: players.reduce((a, p) => a + p.assists, 0),
    netWorth: players.reduce((a, p) => a + p.net_worth, 0),
    damage: sum((s) => s.player_damage ?? 0),
    damageTaken: sum((s) => s.player_damage_taken ?? 0),
    healing: sum((s) => s.player_healing ?? 0),
    bossDamage: sum((s) => s.boss_damage ?? 0),
    lastHits: players.reduce((a, p) => a + p.last_hits, 0),
    denies: players.reduce((a, p) => a + p.denies, 0),
    accuracy: hit + missed ? hit / (hit + missed) : 0,
    objectivesLost: (info.objectives ?? []).filter((o) => o.team === team && o.destroyed_time_s > 0).length,
  };
}

export type LaneOutcome = 'team0' | 'team1' | 'draw';

export interface LaneResult {
  /** `assigned_lane` value (1 York · 4 Broadway · 6 Greenwich) */
  lane: number;
  sides: [MatchPlayer[], MatchPlayer[]];
  /** team souls at the end of the laning phase */
  souls: [number, number];
  /** team 0 souls minus team 1 souls */
  diff: number;
  outcome: LaneOutcome;
}

/**
 * Who won each lane: team souls in that lane at ~10 minutes. Lanes with nobody on one side
 * (a player left the lane, or a weird mode) are still listed — the missing side is just 0.
 */
export function laneResults(info: MatchInfo, atSeconds = LANE_END_S): LaneResult[] {
  const lanes = new Map<number, [MatchPlayer[], MatchPlayer[]]>();
  for (const p of info.players) {
    const lane = p.assigned_lane ?? 0;
    if (!lane) continue;
    const sides = lanes.get(lane) ?? [[], []];
    sides[p.team === 0 ? 0 : 1].push(p);
    lanes.set(lane, sides);
  }
  return [...lanes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lane, sides]) => {
      const souls = sides.map((side) => side.reduce((a, p) => a + (statAt(p, atSeconds)?.net_worth ?? 0), 0)) as [number, number];
      const diff = souls[0] - souls[1];
      const even = Math.abs(diff) < LANE_DRAW_SOULS || Math.abs(diff) < Math.max(...souls) * LANE_DRAW_SHARE;
      return { lane, sides, souls, diff, outcome: even ? 'draw' : diff > 0 ? 'team0' : 'team1' } as LaneResult;
    });
}

/** Net-worth difference (team 0 − team 1) at every stat snapshot, starting at 0. */
export function soulLead(info: MatchInfo): [number, number][] {
  const at = new Map<number, number>([[0, 0]]);
  for (const p of info.players)
    for (const s of p.stats ?? []) at.set(s.time_stamp_s, (at.get(s.time_stamp_s) ?? 0) + (p.team === 0 ? s.net_worth : -s.net_worth));
  return [...at.entries()].sort((a, b) => a[0] - b[0]);
}

/** Destroyed objectives in order, with `isPatron` for the one that ends the match. */
export function objectiveEvents(info: MatchInfo) {
  return (info.objectives ?? [])
    .filter((o) => o.destroyed_time_s > 0)
    .map((o) => ({ ...o, isPatron: o.team_objective_id === 0 }))
    .sort((a, b) => a.destroyed_time_s - b.destroyed_time_s);
}

export interface KillRow {
  killer: MatchPlayer;
  /** victims by player slot, most killed first */
  victims: { slot: number; n: number }[];
  total: number;
}

/**
 * Who killed whom, from every player's `death_details` (each death names its killer).
 * Players who never got a kill are left out; deaths with no killer (suicides) are ignored.
 */
export function killMatrix(info: MatchInfo): KillRow[] {
  const bySlot = new Map(info.players.map((p) => [p.player_slot, p]));
  const kills = new Map<number, Map<number, number>>();
  for (const victim of info.players)
    for (const d of victim.death_details ?? []) {
      const killer = d.killer_player_slot;
      if (killer === undefined || killer === victim.player_slot || !bySlot.has(killer)) continue;
      const row = kills.get(killer) ?? new Map<number, number>();
      row.set(victim.player_slot, (row.get(victim.player_slot) ?? 0) + 1);
      kills.set(killer, row);
    }
  return [...kills.entries()]
    .map(([slot, victims]) => ({
      killer: bySlot.get(slot)!,
      victims: [...victims.entries()].map(([s, n]) => ({ slot: s, n })).sort((a, b) => b.n - a.n || a.slot - b.slot),
      total: [...victims.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.killer.team - b.killer.team || b.total - a.total);
}
