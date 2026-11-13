import { useMemo } from 'react';
import { aggregateLanes, type LaneAgg } from '../lib/lanes';
import type { Hero, Item, ItemStat } from '../lib/types';
import { useHeroes, useItems, useLanes } from './useAssets';
import { useCounterStats, useHeroRows, useItemStats, useLaneStats, useSynergyStats } from './useStats';

/** Lane ("position") data: lane list + per-hero / per-duo aggregates for the current filters. */
export function useLaneAgg() {
  const lanes = useLanes();
  const q = useLaneStats();
  const agg = useMemo<LaneAgg | null>(() => (q.data ? aggregateLanes(q.data) : null), [q.data]);
  return { lanes, agg, isLoading: q.isLoading, isFetching: q.isFetching, error: q.error };
}

export interface MatchupRow {
  other: Hero;
  winRate: number;
  matches: number;
  /** win rate minus the hero's overall win rate — positive = favourable */
  delta: number;
}

/** Counters (vs enemy) and synergies (with ally) for one hero, relative to its baseline win rate. */
export function useHeroMatchups(heroId: number) {
  const heroes = useHeroes();
  const { rows } = useHeroRows();
  const counters = useCounterStats();
  const synergy = useSynergyStats();
  const base = rows.find((r) => r.hero.id === heroId)?.winRate ?? 0.5;

  const vs = useMemo<MatchupRow[]>(() => {
    return (counters.data ?? [])
      .filter((c) => c.hero_id === heroId && heroes.byId.has(c.enemy_hero_id) && c.matches_played > 0)
      .map((c) => {
        const wr = c.wins / c.matches_played;
        return { other: heroes.byId.get(c.enemy_hero_id)!, winRate: wr, matches: c.matches_played, delta: wr - base };
      })
      .sort((a, b) => b.winRate - a.winRate);
  }, [counters.data, heroId, heroes.byId, base]);

  const with_ = useMemo<MatchupRow[]>(() => {
    return (synergy.data ?? [])
      .filter((s) => (s.hero_id1 === heroId || s.hero_id2 === heroId) && s.matches_played > 0)
      .map((s) => {
        const otherId = s.hero_id1 === heroId ? s.hero_id2 : s.hero_id1;
        const wr = s.wins / s.matches_played;
        return { other: heroes.byId.get(otherId)!, winRate: wr, matches: s.matches_played, delta: wr - base };
      })
      .filter((r) => r.other)
      .sort((a, b) => b.winRate - a.winRate);
  }, [synergy.data, heroId, heroes.byId, base]);

  return {
    vs,
    with: with_,
    base,
    isLoading: counters.isLoading || synergy.isLoading,
    error: counters.error ?? synergy.error,
  };
}

export interface ItemRow {
  item: Item;
  stat: ItemStat;
  winRate: number;
  /** share of this hero's matches where the item was bought */
  pickRate: number;
}

export function useHeroItemRows(heroId?: number) {
  const items = useItems();
  const stats = useItemStats(heroId);
  const { rows } = useHeroRows();
  // denominator: hero's matches (or all player-matches when no hero)
  const denom = heroId
    ? rows.find((r) => r.hero.id === heroId)?.stat.matches ?? 0
    : rows.reduce((a, r) => a + r.stat.matches, 0);

  const list = useMemo<ItemRow[]>(() => {
    if (!stats.data) return [];
    return stats.data
      .map((s) => {
        const item = items.byId.get(s.item_id);
        if (!item || item.type !== 'upgrade' || !item.item_slot_type) return null;
        const total = denom || stats.data!.reduce((a, x) => Math.max(a, x.matches), 0);
        return { item, stat: s, winRate: s.wins / s.matches, pickRate: total ? s.matches / total : 0 };
      })
      .filter((x): x is ItemRow => !!x);
  }, [stats.data, items.byId, denom]);

  return { rows: list, isLoading: stats.isLoading || items.isLoading, isFetching: stats.isFetching, error: stats.error ?? items.error };
}
