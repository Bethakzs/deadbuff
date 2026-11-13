import { motion } from 'framer-motion';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BuildCard } from '../components/BuildCard';
import { BuildTagFilter } from '../components/BuildTagFilter';
import { HeroAvatar } from '../components/HeroChip';
import { Empty, ErrorState, Page, Segmented, Skeleton } from '../components/UI';
import { useHeroes, useItems } from '../hooks/useAssets';
import { useBuildPages, useSteamProfiles } from '../hooks/useStats';
import { useT } from '../i18n';
import { useDocumentMeta } from '../lib/seo';
import { BUILD_PAGE, BUILD_STEP, uniqueBuilds } from '../lib/builds';
import { heroAbilities } from '../lib/heroes';

type Sort = 'weekly_favorites' | 'favorites' | 'updated_at';

/**
 * Global build browser. Same filtering logic as the hero Builds tab: hero, sort, name search and
 * build tag are all sent to the API (server-side), BUILD_PAGE results per request, BUILD_STEP
 * revealed per "Show more" — the next API page is fetched when the revealed ones run out.
 */
export function BuildsPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.builds'), t('meta.desc.builds'));
  const heroes = useHeroes();
  const items = useItems();
  // No "all heroes" view (owner's request): until a hero is picked, show the first one in the picker.
  const [picked, setPicked] = useState<number | undefined>();
  const heroId = picked !== undefined && heroes.byId.has(picked) ? picked : heroes.list[0]?.id;
  const [sort, setSort] = useState<Sort>('weekly_favorites');
  const [tag, setTag] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const searchName = deferred.length >= 2 ? deferred : undefined;

  const [visible, setVisible] = useState(BUILD_STEP);
  useEffect(() => setVisible(BUILD_STEP), [heroId, sort, tag, searchName]);

  const q = useBuildPages({ heroId, sortBy: sort, tag, search: searchName, pageSize: BUILD_PAGE }, heroId !== undefined);
  const all = useMemo(() => uniqueBuilds(q.data?.pages), [q.data]);
  const builds = all.slice(0, visible);
  const canMore = visible < all.length || !!q.hasNextPage;
  const profiles = useSteamProfiles(useMemo(() => builds.map((b) => b.hero_build.author_account_id), [builds]));

  const more = () => {
    const next = visible + BUILD_STEP;
    setVisible(next);
    if (next > all.length && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  };

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('builds.eyebrow')}</span>
            <h1 className="display page-head__title">{t('builds.title')}</h1>
            <p className="page-head__sub muted">{t('builds.sub')}</p>
          </div>
        </header>

        <div className="hero-picker" role="listbox" aria-label={t('builds.filterHero')}>
          {heroes.list.map((h) => (
            <button
              key={h.id}
              className={`hero-picker__btn ${heroId === h.id ? 'is-active' : ''}`}
              onClick={() => setPicked(h.id)}
              title={h.name}
              aria-selected={heroId === h.id}
            >
              <HeroAvatar hero={h} size={40} />
            </button>
          ))}
        </div>

        <div className="toolbar">
          <Segmented
            id="build-sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'weekly_favorites', label: t('builds.sortTrending') },
              { value: 'favorites', label: t('builds.sortFavs') },
              { value: 'updated_at', label: t('builds.sortUpdated') },
            ]}
          />
          <input className="input" placeholder={t('builds.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <BuildTagFilter value={tag} onChange={setTag} />

        <div className="build-list">
          {q.error || heroes.error ? (
            <ErrorState error={q.error ?? heroes.error} onRetry={() => (heroes.error ? heroes.refetch() : q.refetch())} />
          ) : q.isLoading || heroId === undefined ? (
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={120} r={12} />)
          ) : !builds.length ? (
            <Empty>{t(tag ? 'hb.emptyTag' : 'builds.empty')}</Empty>
          ) : (
            <>
              {builds.map((b, i) => {
                const hero = heroes.byId.get(b.hero_build.hero_id);
                return (
                  <BuildCard
                    key={b.hero_build.hero_build_id}
                    build={b}
                    rank={i + 1}
                    hero={hero}
                    abilities={hero ? heroAbilities(hero, items.byClass) : undefined}
                    profile={profiles.get(b.hero_build.author_account_id)}
                  />
                );
              })}
              {q.isFetchingNextPage && Array.from({ length: 2 }, (_, i) => <Skeleton key={`more-${i}`} h={96} r={12} />)}
            </>
          )}
        </div>

        {!q.isLoading && !q.error && builds.length > 0 && canMore && (
          <motion.div className="load-more" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button className="btn btn--ghost" onClick={more} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? <span className="spinner" /> : null}
              {t('hb.loadMore')}
            </button>
          </motion.div>
        )}
      </div>
    </Page>
  );
}
