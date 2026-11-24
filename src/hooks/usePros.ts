import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchActiveMatches, fetchProMatches, type ProMatchQuery } from '../lib/api';
import { computePros, PROS_FILE, type ProsFile } from '../lib/pros';
import type { ProPlayer } from '../lib/types';

/** The pro list: the build's static pros.json (free), else made from the leaderboards (dev, or a failed build). */
async function loadPros(signal?: AbortSignal): Promise<ProsFile> {
  try {
    const res = await fetch(`/${PROS_FILE}`, { signal });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
      const file = (await res.json()) as ProsFile;
      if (file?.pros?.length) return file;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
  }
  return { at: Date.now(), pros: await computePros(signal) };
}

export function usePros() {
  const q = useQuery({ queryKey: ['pros'], queryFn: ({ signal }) => loadPros(signal), staleTime: Infinity, retry: 1 });
  const byId = useMemo(() => new Map<number, ProPlayer>((q.data?.pros ?? []).map((p) => [p.id, p])), [q.data]);
  return { ...q, pros: q.data?.pros ?? [], byId };
}

/** Recent games of the pros (one /matches/metadata request; the hero page's query is a build snapshot). */
export function useProMatches(query: ProMatchQuery | undefined) {
  return useQuery({
    queryKey: ['pro-matches', query],
    queryFn: ({ signal }) => fetchProMatches(query!, signal),
    enabled: !!query?.accountIds.length,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Matches being played now (top 200 of the Watch tab). */
export function useActiveMatches(enabled = true) {
  return useQuery({ queryKey: ['active-matches'], queryFn: ({ signal }) => fetchActiveMatches(signal), enabled, staleTime: 60_000, retry: 1 });
}
