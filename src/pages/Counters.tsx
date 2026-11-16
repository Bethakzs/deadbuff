import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { HeroAvatar } from '../components/HeroChip';
import { ItemIcon } from '../components/ItemIcon';
import { Empty, ErrorState, Page, Panel, SectionTitle, Skeleton, SkeletonRows } from '../components/UI';
import { Delta, WinRate } from '../components/WinRate';
import { useHeroes, useItems } from '../hooks/useAssets';
import { useCounterStats, useHeroRows, useItemStats, useItemStatsVsEnemy } from '../hooks/useStats';
import { useT } from '../i18n';
import { countersOf, itemsVsLineup, pairIndex, type PairEffect } from '../lib/draft';
import { fmtCompact, fmtPct } from '../lib/format';
import { heroCard, heroRgb } from '../lib/heroes';
import { isShopItem } from '../lib/items';
import { useDocumentMeta } from '../lib/seo';
import type { Hero } from '../lib/types';

/*
 * /counters           — every hero, links to its counter page (SEO: "deadlock counters")
 * /counters/:slug     — "Haze counters": the heroes that beat Haze BEYOND their own strength (same effect as the
 *                       draft helper, lib/draft.ts countersOf()), the heroes Haze beats, and the items whose win
 *                       rate rises most in games against Haze (all heroes, item vs itself → no late-item bias).
 * Both are prerendered (scripts/prerender.ts) and link into /draft?e=<slug>.
 */

/** Grid of every hero → its counter page (also at the bottom of /draft and of each counter page). */
export function CounterGuideGrid({ current }: { current?: number }) {
  const { t } = useT();
  const heroes = useHeroes();
  if (heroes.isLoading) return <Skeleton h={160} r={14} />;
  return (
    <ul className="ctr-guide">
      {heroes.list.map((h) => (
        <li key={h.id}>
          <Link to={`/counters/${h.slug}`} className={`ctr-guide__hero ${h.id === current ? 'is-current' : ''}`} style={{ ['--hero' as string]: heroRgb(h) }} title={t('ctr.linkName', { name: h.name })}>
            <HeroAvatar hero={h} size={36} />
            <span>{h.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CountersIndexPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.countersIndex'), t('meta.desc.countersIndex'));
  return (
    <Page className="counters-page">
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('ctr.eyebrow')}</span>
            <h1 className="display page-head__title">{t('ctr.indexTitle')}</h1>
            <p className="page-head__sub muted">{t('ctr.indexSub')}</p>
          </div>
          <Link className="btn btn--brass" to="/draft">
            {t('home.draftCta')}
          </Link>
        </header>
        <CounterGuideGrid />
      </div>
    </Page>
  );
}

/** `expected` = the hero's own win rate minus the enemy's edge — what it would win vs this enemy if the pair didn't matter. */
function CounterRow({ hero, fx, expected, rank, enemy }: { hero: Hero; fx: PairEffect; expected: number; rank: number; enemy: Hero }) {
  const { t } = useT();
  return (
    <motion.li
      className="ctr-row"
      style={{ ['--hero' as string]: heroRgb(hero) }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(rank * 0.03, 0.3) }}
    >
      <span className="ctr-row__rank num">{String(rank + 1).padStart(2, '0')}</span>
      <Link to={`/heroes/${hero.slug}`} className="ctr-row__hero">
        <HeroAvatar hero={hero} size={42} />
        <span className="ctr-row__who">
          <b>{hero.name}</b>
          <small className="muted">
            {fmtCompact(fx.matches)} {t('ctr.games')}
          </small>
        </span>
      </Link>
      <span className="ctr-row__stat">
        <WinRate value={fx.wr} />
        <small>{t('ctr.vsName', { name: enemy.name })}</small>
      </span>
      <span className="ctr-row__stat ctr-row__usual">
        <WinRate value={expected} />
        <small>{t('ctr.usual')}</small>
      </span>
      <span className="ctr-row__stat">
        <Delta value={fx.delta} />
        <small>{t('ctr.effect')}</small>
      </span>
    </motion.li>
  );
}

export function CountersPage() {
  const { slug = '' } = useParams();
  const { t } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const hero = heroes.bySlug.get(slug);
  const { rows, isLoading, isFetching, error } = useHeroRows();
  const counters = useCounterStats();
  const baseItems = useItemStats();
  const vsItems = useItemStatsVsEnemy(hero?.id);

  useDocumentMeta(
    hero ? t('meta.counters', { name: hero.name, en: hero.name_en }) : undefined,
    hero ? t('meta.desc.counters', { name: hero.name, en: hero.name_en }) : undefined,
  );

  const baseWr = useMemo(() => new Map(rows.map((r) => [r.hero.id, r.winRate])), [rows]);
  const idx = useMemo(() => pairIndex(counters.data), [counters.data]);
  const res = useMemo(() => (hero ? countersOf(hero, heroes.list, baseWr, idx) : { counters: [], victims: [] }), [hero, heroes.list, baseWr, idx]);
  const itemList = useMemo(
    () =>
      hero && baseItems.data && vsItems.data
        ? itemsVsLineup(baseItems.data, [{ enemyId: hero.id, stats: vsItems.data }], (id) => {
            const it = items.byId.get(id);
            return !!it && isShopItem(it);
          })
            .filter((x) => x.score > 0.002)
            .slice(0, 8)
        : [],
    [hero, baseItems.data, vsItems.data, items.byId],
  );

  if (heroes.error)
    return (
      <Page>
        <div className="container">
          <ErrorState error={heroes.error} onRetry={() => heroes.refetch()} />
        </div>
      </Page>
    );
  if (heroes.isLoading)
    return (
      <Page>
        <div className="container">
          <Skeleton h={320} r={14} />
        </div>
      </Page>
    );
  if (!hero) return <Navigate to="/counters" replace />;

  const row = rows.find((r) => r.hero.id === hero.id);
  const loading = isLoading || counters.isLoading;

  return (
    <Page className="counters-page">
      <div className="container" style={{ ['--hero' as string]: heroRgb(hero) }}>
        <header className="ctr-head">
          <img className="ctr-head__art" src={heroCard(hero)} alt="" />
          <div className="ctr-head__copy">
            <Link className="eyebrow" to="/counters">
              {t('ctr.eyebrow')}
            </Link>
            <h1 className="display page-head__title">{t('ctr.title', { name: hero.name })}</h1>
            <p className="page-head__sub muted">{t('ctr.sub', { name: hero.name })}</p>
            {row && (
              <p className="ctr-head__stats">
                <span>
                  <WinRate value={row.winRate} /> <small>{t('stat.winLower')}</small>
                </span>
                <span>
                  <span className="num">{fmtPct(row.pickRate)}</span> <small>{t('stat.pickLower')}</small>
                </span>
              </p>
            )}
            <div className="ctr-head__cta">
              <Link className="btn btn--brass" to={`/draft?e=${hero.slug}`}>
                {t('ctr.openDraft')}
              </Link>
              <Link className="btn btn--ghost" to={`/heroes/${hero.slug}`}>
                {t('ctr.heroPage', { name: hero.name })}
              </Link>
            </div>
          </div>
          <FilterBar fetching={(isFetching || counters.isFetching) && !loading} />
        </header>

        {error || counters.error ? (
          <ErrorState error={error ?? counters.error} onRetry={() => counters.refetch()} />
        ) : (
          <div className="ctr-grid">
            <section>
              <SectionTitle title={t('ctr.best')} />
              <p className="muted section-sub">{t('ctr.bestSub', { name: hero.name })}</p>
              {loading ? (
                <SkeletonRows rows={8} h={64} />
              ) : !res.counters.length ? (
                <Empty>{t('ctr.noData')}</Empty>
              ) : (
                <ol className="ctr-list">
                  {res.counters.slice(0, 10).map((x, i) => (
                    <CounterRow key={x.hero.id} hero={x.hero} fx={x.fx} expected={x.base - ((baseWr.get(hero.id) ?? 0.5) - 0.5)} rank={i} enemy={hero} />
                  ))}
                </ol>
              )}
            </section>
            <aside className="ctr-aside">
              <Panel title={t('ctr.items', { name: hero.name })}>
                <p className="muted small draft-aside__sub">{t('ctr.itemsSub', { name: hero.name })}</p>
                {baseItems.error || vsItems.error ? (
                  <ErrorState error={baseItems.error ?? vsItems.error} />
                ) : baseItems.isLoading || vsItems.isLoading ? (
                  <SkeletonRows rows={5} h={44} />
                ) : !itemList.length ? (
                  <Empty>{t('draft.noItems')}</Empty>
                ) : (
                  <ul className="ctr-items">
                    {itemList.map((x) => {
                      const item = items.byId.get(x.itemId)!;
                      return (
                        <li key={x.itemId}>
                          <ItemIcon item={item} size="sm" />
                          <span className="ctr-items__name">{item.name}</span>
                          <Delta value={x.score} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
              <Panel title={t('ctr.strongVs', { name: hero.name })}>
                <p className="muted small draft-aside__sub">{t('ctr.strongVsSub', { name: hero.name })}</p>
                {loading ? (
                  <SkeletonRows rows={5} h={40} />
                ) : !res.victims.length ? (
                  <Empty>{t('ctr.noData')}</Empty>
                ) : (
                  <ul className="avoid-list">
                    {res.victims.slice(0, 6).map((x) => (
                      <li key={x.hero.id}>
                        <Link to={`/counters/${x.hero.slug}`} className="avoid-list__hero">
                          <HeroAvatar hero={x.hero} size={30} />
                          <span>{x.hero.name}</span>
                        </Link>
                        <span className="avoid-list__val">
                          <Delta value={x.fx.delta} />
                          <WinRate value={x.fx.wr} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </aside>
          </div>
        )}

        <SectionTitle title={t('ctr.others')} />
        <CounterGuideGrid current={hero.id} />
        <p className="muted small-note">{t('draft.method')}</p>
      </div>
    </Page>
  );
}
