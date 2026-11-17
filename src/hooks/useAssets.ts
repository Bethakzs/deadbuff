import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useT } from '../i18n';
import {
  dayStart,
  fetchBadgeDistribution,
  fetchBigPatchDays,
  fetchBuildTags,
  fetchGenericData,
  fetchHeroes,
  fetchItems,
  fetchMap,
  fetchNpcUnits,
  fetchPatches,
  fetchRanks,
  fetchUpgradesEn,
} from '../lib/api';
import { heroSlug } from '../lib/heroes';
import { isShopItem, itemSlug } from '../lib/items';
import { lanesFromInfo } from '../lib/lanes';
import type { Hero, Item } from '../lib/types';

/*
 * Static game data changes only with patches: cache for the whole session.
 * keepPreviousData: when the language switches, the old language stays on
 * screen until the new one arrives (no skeleton flash).
 */
const STATIC = { staleTime: Infinity, gcTime: Infinity, placeholderData: keepPreviousData } as const;

export function useHeroes() {
  const { meta } = useT();
  // English is always loaded: it defines slugs (stable URLs) and English search names.
  const base = useQuery({ queryKey: ['heroes', 'english'], queryFn: ({ signal }) => fetchHeroes('english', signal), ...STATIC });
  const local = useQuery({
    queryKey: ['heroes', meta.api],
    queryFn: ({ signal }) => fetchHeroes(meta.api, signal),
    enabled: meta.api !== 'english',
    ...STATIC,
  });

  const data = useMemo(() => {
    const localById = new Map((meta.api !== 'english' ? local.data ?? [] : []).map((h) => [h.id, h]));
    const list = (base.data ?? [])
      .filter((h) => h.player_selectable && !h.disabled)
      .map<Hero>((h) => {
        const l = localById.get(h.id);
        return {
          ...h,
          name_en: h.name,
          slug: heroSlug(h.name),
          ...(l ? { name: l.name, description: l.description, tags: l.tags } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, meta.locale));
    const byId = new Map<number, Hero>(list.map((h) => [h.id, h]));
    const bySlug = new Map<string, Hero>(list.map((h) => [h.slug, h]));
    return { list, byId, bySlug };
  }, [base.data, local.data, meta.api, meta.locale]);

  return {
    ...data,
    isLoading: base.isLoading,
    error: base.error ?? local.error,
    refetch: base.refetch,
  };
}

/** `enabled = false` lets a component use items only when it needs them (e.g. the header search before typing). */
export function useItems(enabled = true) {
  const { meta } = useT();
  const q = useQuery({ queryKey: ['items', meta.api], queryFn: ({ signal }) => fetchItems(meta.api, signal), ...STATIC, enabled });
  const data = useMemo(() => {
    const all = q.data ?? [];
    const byId = new Map<number, Item>(all.map((i) => [i.id, i]));
    const byClass = new Map<string, Item>(all.map((i) => [i.class_name, i]));
    const shop = all.filter(isShopItem);
    return { all, byId, byClass, shop };
  }, [q.data]);
  return { ...q, ...data };
}

export function useRanks() {
  const { meta } = useT();
  return useQuery({ queryKey: ['ranks', meta.api], queryFn: ({ signal }) => fetchRanks(meta.api, signal), ...STATIC });
}

export function useBuildTags() {
  const { meta } = useT();
  const q = useQuery({ queryKey: ['build-tags', meta.api], queryFn: ({ signal }) => fetchBuildTags(meta.api, signal), ...STATIC });
  return useMemo(() => new Map((q.data ?? []).map((tag) => [tag.id, tag])), [q.data]);
}

/** /assets/generic-data in the UI language (lanes, place names, prices, soul shares…). */
export function useGenericData() {
  const { meta } = useT();
  return useQuery({ queryKey: ['generic-data', meta.api], queryFn: ({ signal }) => fetchGenericData(meta.api, signal), ...STATIC });
}

/** The three duo lanes (York · Broadway · Greenwich) with localised names and colours. */
export function useLanes() {
  const q = useGenericData();
  return useMemo(() => lanesFromInfo(q.data?.lane_info), [q.data]);
}

/** Players by rank over the last 30 days (wiki → ranks). */
export function useBadgeDistribution() {
  const since = dayStart(30);
  return useQuery({ queryKey: ['badge-distribution', since], queryFn: ({ signal }) => fetchBadgeDistribution(since, signal), staleTime: 60 * 60_000 });
}

/** Everything placed on the map (wiki). Same for every language. */
export function useGameMap() {
  return useQuery({ queryKey: ['map'], queryFn: ({ signal }) => fetchMap(signal), ...STATIC });
}

/** NPC units by class_name, names in the UI language (wiki: objective health, neutral souls). */
export function useNpcUnits() {
  const { meta } = useT();
  const q = useQuery({ queryKey: ['npc-units', meta.api], queryFn: ({ signal }) => fetchNpcUnits(meta.api, signal), ...STATIC });
  const byClass = useMemo(() => new Map((q.data ?? []).map((n) => [n.class_name, n])), [q.data]);
  return { ...q, byClass };
}

export function usePatches() {
  return useQuery({ queryKey: ['patches'], queryFn: ({ signal }) => fetchPatches(signal), staleTime: 30 * 60_000 });
}

export function useBigPatchDays() {
  return useQuery({ queryKey: ['patch-big-days'], queryFn: ({ signal }) => fetchBigPatchDays(signal), staleTime: 30 * 60_000 });
}

/**
 * Shop items keyed by URL slug. Slugs come from the ENGLISH name in every UI language
 * ("/de/items/mystic-burst"), so outside English the English upgrade names are loaded too.
 */
export function useShopItemSlugs(enabled = true) {
  const { meta } = useT();
  const items = useItems(enabled);
  const isEn = meta.api === 'english';
  const en = useQuery({ queryKey: ['upgrades', 'english'], queryFn: ({ signal }) => fetchUpgradesEn(signal), enabled: enabled && !isEn, ...STATIC });
  const data = useMemo(() => {
    const enName = new Map((isEn ? items.shop : en.data ?? []).map((i) => [i.id, i.name]));
    const slugOf = new Map<number, string>();
    const bySlug = new Map<string, Item>();
    for (const it of items.shop) {
      const name = enName.get(it.id);
      if (!name) continue;
      const slug = itemSlug(name);
      slugOf.set(it.id, slug);
      bySlug.set(slug, it);
    }
    return { slugOf, bySlug, enName };
  }, [isEn, items.shop, en.data]);
  return { ...data, isLoading: items.isLoading || (!isEn && en.isLoading), error: items.error ?? en.error };
}
