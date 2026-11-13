import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useT } from '../i18n';
import { fetchBuildTags, fetchGenericData, fetchHeroes, fetchItems, fetchPatches, fetchRanks } from '../lib/api';
import { heroSlug } from '../lib/heroes';
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

export function useItems() {
  const { meta } = useT();
  const q = useQuery({ queryKey: ['items', meta.api], queryFn: ({ signal }) => fetchItems(meta.api, signal), ...STATIC });
  const data = useMemo(() => {
    const all = q.data ?? [];
    const byId = new Map<number, Item>(all.map((i) => [i.id, i]));
    const byClass = new Map<string, Item>(all.map((i) => [i.class_name, i]));
    const shop = all.filter((i) => i.type === 'upgrade' && i.shopable && !i.disabled);
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

/** The three duo lanes (York · Broadway · Greenwich) with localised names and colours. */
export function useLanes() {
  const { meta } = useT();
  const q = useQuery({ queryKey: ['generic-data', meta.api], queryFn: ({ signal }) => fetchGenericData(meta.api, signal), ...STATIC });
  return useMemo(() => lanesFromInfo(q.data?.lane_info), [q.data]);
}

export function usePatches() {
  return useQuery({ queryKey: ['patches'], queryFn: ({ signal }) => fetchPatches(signal), staleTime: 30 * 60_000 });
}
