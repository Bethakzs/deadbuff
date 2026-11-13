import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { BuildCard } from '../../components/BuildCard';
import { BuildTagFilter } from '../../components/BuildTagFilter';
import { Empty, ErrorState, SectionTitle, Segmented, Skeleton } from '../../components/UI';
import { useBuildPages, useBuildsByIds, useHeroBuildStats, useSteamProfiles } from '../../hooks/useStats';
import { useT } from '../../i18n';
import { BUILD_PAGE as PAGE, BUILD_STEP as STEP, uniqueBuilds } from '../../lib/builds';
import type { Hero, HeroBuild, HeroBuildStat, Item } from '../../lib/types';

type Mode = 'played' | 'winrate' | 'trending';
const MODES: Mode[] = ['played', 'winrate', 'trending'];

/** Win-rate ranking only counts builds with a meaningful sample. */
const winrateFloor = (stats: HeroBuildStat[]) => Math.max(150, Math.max(0, ...stats.map((s) => s.matches)) * 0.02);

export function HeroBuilds({ hero, abilities }: { hero: Hero; abilities: Item[] }) {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>('played');
  const [tag, setTag] = useState<number | undefined>();
  const [visible, setVisible] = useState(STEP);
  useEffect(() => setVisible(STEP), [mode, tag, hero.id]);

  const stats = useHeroBuildStats(hero.id);
  const statById = useMemo(() => new Map((stats.data ?? []).map((s) => [s.hero_build_id, s])), [stats.data]);

  /*
   * Two sources:
   *  - no tag + played/winrate → ids ranked from match stats, details fetched per id (STEP at a time)
   *  - tag or trending         → server-side search (tag filter works across every page), PAGE at a time
   */
  const byStats = !tag && mode !== 'trending';
  const search = useBuildPages(
    { heroId: hero.id, tag, sortBy: mode === 'trending' ? 'weekly_favorites' : 'favorites', pageSize: PAGE },
    !byStats,
  );

  const rankedIds = useMemo(() => {
    if (!byStats) return [];
    const list = stats.data ?? [];
    if (mode === 'played') return [...list].sort((a, b) => b.matches - a.matches).map((s) => s.hero_build_id);
    const floor = winrateFloor(list);
    return list
      .filter((s) => s.matches >= floor)
      .sort((a, b) => b.wins / b.matches - a.wins / a.matches)
      .map((s) => s.hero_build_id);
  }, [byStats, stats.data, mode]);
  const byIds = useBuildsByIds(rankedIds.slice(0, visible));

  /** Search results re-ranked by the chosen mode; builds without match data keep the API order, after the ranked ones. */
  const searched = useMemo<HeroBuild[]>(() => {
    if (byStats) return [];
    const found = uniqueBuilds(search.data?.pages);
    if (mode === 'trending') return found;
    const floor = winrateFloor(stats.data ?? []);
    const key = (b: HeroBuild) => {
      const s = statById.get(b.hero_build.hero_build_id);
      if (!s) return -1;
      if (mode === 'played') return s.matches;
      return s.matches >= floor ? s.wins / s.matches : -1;
    };
    const ranked = found.filter((b) => key(b) >= 0).sort((a, b) => key(b) - key(a));
    return [...ranked, ...found.filter((b) => key(b) < 0)];
  }, [byStats, search.data, mode, statById, stats.data]);

  const builds = byStats ? byIds.builds : searched.slice(0, visible);
  const firstLoad = byStats ? stats.isLoading || (byIds.isLoading && !byIds.builds.length) : search.isLoading;
  const loadingMore = byStats ? byIds.isLoading && byIds.builds.length > 0 : search.isFetchingNextPage;
  const canMore = byStats ? visible < rankedIds.length : visible < searched.length || !!search.hasNextPage;
  const error = byStats ? stats.error : search.error;
  const profiles = useSteamProfiles(useMemo(() => builds.map((b) => b.hero_build.author_account_id), [builds]));

  const more = () => {
    const next = visible + STEP;
    setVisible(next);
    if (!byStats && next > searched.length && search.hasNextPage && !search.isFetchingNextPage) search.fetchNextPage();
  };

  return (
    <div className="hero-builds">
      <SectionTitle
        eyebrow={t('hb.eyebrow', { name: hero.name })}
        title={t('hb.title')}
        right={<Segmented id="build-mode" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: t(`hb.${m}`) }))} />}
      />
      <BuildTagFilter value={tag} onChange={setTag} />

      <div className="build-list">
        {error ? (
          <ErrorState error={error} />
        ) : firstLoad ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={120} r={12} />)
        ) : builds.length === 0 ? (
          <Empty>{t(tag ? 'hb.emptyTag' : 'hb.empty')}</Empty>
        ) : (
          <>
            {builds.map((b, i) => (
              <BuildCard
                key={`${mode}-${tag ?? 'all'}-${b.hero_build.hero_build_id}`}
                build={b}
                rank={i + 1}
                stat={statById.get(b.hero_build.hero_build_id)}
                profile={profiles.get(b.hero_build.author_account_id)}
                abilities={abilities}
                defaultOpen={i === 0}
              />
            ))}
            {loadingMore && Array.from({ length: 2 }, (_, i) => <Skeleton key={`more-${i}`} h={96} r={12} />)}
          </>
        )}
      </div>

      {!firstLoad && !error && builds.length > 0 && canMore && (
        <motion.div className="load-more" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button className="btn btn--ghost" onClick={more} disabled={loadingMore}>
            {loadingMore ? <span className="spinner" /> : null}
            {t('hb.loadMore')}
          </button>
        </motion.div>
      )}
    </div>
  );
}
