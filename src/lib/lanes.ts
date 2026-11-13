/* ------------------------------------------------------------------ *
 * Lanes. A Deadlock team splits into three duo lanes:
 *   1 York (yellow, left) · 4 Broadway (blue, middle) · 6 Greenwich (green, right)
 * ids/names/colours come from /assets/generic-data → lane_info[index].
 *
 * Only used for the small "Best lane: …" chip in the hero header (the owner
 * considers lane data secondary — keep it there, don't spread it around).
 * Source rows: /analytics/lane-matchup-stats grouped by (lane, duo).
 * ------------------------------------------------------------------ */
import type { LaneInfo, LaneMatchupRow } from './types';

export interface Lane {
  /** `assigned_lane` value */
  id: number;
  name: string;
  /** "r g b" for rgb(var(--lane) / a) */
  rgb: string;
}

export function lanesFromInfo(info: LaneInfo[] | undefined): Lane[] {
  return (info ?? [])
    .map((l, id) => ({ l, id }))
    .filter(({ l }) => !l.is_enemy_lane && l.color && l.lane_name && l.lane_name !== 'Unused')
    .map(({ l, id }) => ({ id, name: l.lane_name, rgb: `${l.color!.red} ${l.color!.green} ${l.color!.blue}` }));
}

interface LaneCell {
  matches: number;
  wins: number;
}

export interface LaneAgg {
  /** hero → lane → stats of every duo containing the hero in that lane */
  byHero: Map<number, Map<number, LaneCell>>;
  /** hero → laning matches over all lanes */
  heroTotal: Map<number, number>;
}

/** Every duo row is credited to both of its heroes. */
export function aggregateLanes(rows: LaneMatchupRow[]): LaneAgg {
  const byHero = new Map<number, Map<number, LaneCell>>();
  const heroTotal = new Map<number, number>();
  for (const r of rows) {
    if (r.hero_ids.length !== 2) continue;
    for (const h of r.hero_ids) {
      let lanes = byHero.get(h);
      if (!lanes) byHero.set(h, (lanes = new Map()));
      const c = lanes.get(r.assigned_lane) ?? { matches: 0, wins: 0 };
      c.matches += r.matches_played;
      c.wins += r.wins;
      lanes.set(r.assigned_lane, c);
      heroTotal.set(h, (heroTotal.get(h) ?? 0) + r.matches_played);
    }
  }
  return { byHero, heroTotal };
}

export interface HeroLaneLine {
  lane: Lane;
  /** share of the hero's laning games played in this lane */
  share: number;
  winRate: number;
  matches: number;
}

export function heroLaneProfile(agg: LaneAgg, heroId: number, lanes: Lane[]): HeroLaneLine[] {
  const total = agg.heroTotal.get(heroId) ?? 0;
  return lanes.map((lane) => {
    const c = agg.byHero.get(heroId)?.get(lane.id);
    return { lane, share: total && c ? c.matches / total : 0, winRate: c?.matches ? c.wins / c.matches : 0, matches: c?.matches ?? 0 };
  });
}

/** Best lane = highest win rate among lanes the hero actually plays (≥ 15% of games). */
export function bestLane(profile: HeroLaneLine[]): HeroLaneLine | undefined {
  return [...profile].filter((p) => p.share >= 0.15 && p.matches > 0).sort((a, b) => b.winRate - a.winRate)[0];
}
