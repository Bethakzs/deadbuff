import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { HeroChip } from '../components/HeroChip';
import { ItemCard, ItemIcon } from '../components/ItemIcon';
import { CountUp, Empty, ErrorState, Page, Panel, SectionTitle, Skeleton, SkeletonRows } from '../components/UI';
import { Delta, MeterBar, WinRate } from '../components/WinRate';
import { useHeroes, useItems, useShopItemSlugs } from '../hooks/useAssets';
import { useHeroItemRows } from '../hooks/useHeroData';
import { useHeroStats, useItemStatsBucket } from '../hooks/useStats';
import { useT } from '../i18n';
import { fmtCompact, fmtPct, fmtTime, wrTone } from '../lib/format';
import { TIER_ROMAN, itemImage, type Slot } from '../lib/items';
import { useDocumentMeta } from '../lib/seo';
import type { Item } from '../lib/types';

const HERO_STEP = 12;
/** Buy minutes past this are folded into the last bar. */
const MAX_MIN = 45;

/** Icon + name linking to another item page. */
function ItemLinkRow({ items, slugOf }: { items: Item[]; slugOf: Map<number, string> }) {
  return (
    <ul className="item-links">
      {items.map((it) => (
        <li key={it.id}>
          <Link to={`/items/${slugOf.get(it.id) ?? ''}`} className="item-link">
            <ItemIcon item={it} size="sm" />
            <span>{it.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Which heroes buy the item: share of the hero's games + win rate with it vs the hero's own. */
function WhoBuys({ item }: { item: Item }) {
  const { t } = useT();
  const heroes = useHeroes();
  const byHero = useItemStatsBucket('hero');
  const heroStats = useHeroStats();
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    const hs = new Map((heroStats.data ?? []).map((s) => [s.hero_id, s]));
    return (byHero.data ?? [])
      .filter((r) => r.item_id === item.id)
      .map((r) => {
        const hero = heroes.byId.get(r.bucket);
        const h = hs.get(r.bucket);
        if (!hero || !h?.matches) return null;
        const wr = r.wins / r.matches;
        return {
          hero,
          share: r.matches / h.matches,
          wr,
          delta: wr - h.wins / h.matches,
          buy: r.avg_buy_time_s,
          matches: r.matches,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.share - a.share);
  }, [byHero.data, heroStats.data, heroes.byId, item.id]);

  const maxShare = Math.max(0.01, ...rows.map((r) => r.share));
  const shown = all ? rows : rows.slice(0, HERO_STEP);

  return (
    <section className="item-section">
      <SectionTitle title={t('ip.heroes')} />
      <p className="muted section-sub">{t('ip.heroesSub')}</p>
      {byHero.error || heroStats.error ? (
        <ErrorState error={byHero.error ?? heroStats.error} onRetry={() => byHero.refetch()} />
      ) : byHero.isLoading || heroStats.isLoading ? (
        <SkeletonRows rows={6} />
      ) : !rows.length ? (
        <Empty>{t('ip.noStats')}</Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('stat.hero')}</th>
                  <th>{t('ip.share')}</th>
                  <th>{t('stat.winRate')}</th>
                  <th title={t('ip.vsHeroHint')}>{t('ip.vsHero')}</th>
                  <th className="hide-sm">{t('stat.avgBuy')}</th>
                  <th className="hide-md">{t('stat.matches')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <motion.tr key={r.hero.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                    <td>
                      <HeroChip hero={r.hero} size={32} />
                    </td>
                    <td>
                      <div className="cell-bar">
                        <span className="num">{fmtPct(r.share)}</span>
                        <MeterBar value={r.share} max={maxShare} tone={(item.item_slot_type ?? 'weapon') as Slot} />
                      </div>
                    </td>
                    <td>
                      <WinRate value={r.wr} />
                    </td>
                    <td>
                      <Delta value={r.delta} />
                    </td>
                    <td className="hide-sm num muted">{r.buy ? fmtTime(r.buy) : '—'}</td>
                    <td className="hide-md num muted">{fmtCompact(r.matches)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > HERO_STEP && (
            <div className="load-more">
              <button className="btn btn--ghost" onClick={() => setAll((v) => !v)}>
                {all ? t('ip.showLess') : t('ip.showAll')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Purchases per buy minute (bar height) coloured by the win rate of those purchases. */
function Timing({ item }: { item: Item }) {
  const { t } = useT();
  const q = useItemStatsBucket('game_time_min');

  const { bars, total, median } = useMemo(() => {
    const acc = new Map<number, { wins: number; matches: number }>();
    for (const r of q.data ?? []) {
      if (r.item_id !== item.id) continue;
      const m = Math.min(r.bucket, MAX_MIN);
      const cur = acc.get(m) ?? { wins: 0, matches: 0 };
      cur.wins += r.wins;
      cur.matches += r.matches;
      acc.set(m, cur);
    }
    const total = [...acc.values()].reduce((a, b) => a + b.matches, 0);
    const last = Math.max(0, ...acc.keys());
    const bars = Array.from({ length: last + 1 }, (_, m) => ({
      m,
      ...(acc.get(m) ?? { wins: 0, matches: 0 }),
    }));
    let run = 0;
    const median = bars.find((b) => (run += b.matches) >= total / 2)?.m;
    return { bars, total, median };
  }, [q.data, item.id]);

  const peak = Math.max(1, ...bars.map((b) => b.matches));

  return (
    <section className="item-section">
      <SectionTitle title={t('ip.timing')} />
      <p className="muted section-sub">{t('ip.timingSub')}</p>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton h={220} r={14} />
      ) : !total ? (
        <Empty>{t('ip.noStats')}</Empty>
      ) : (
        <Panel className="timing">
          {median !== undefined && <p className="timing__median">{t('ip.median', { t: fmtTime((median + 1) * 60) })}</p>}
          <div className="timing__chart" role="img" aria-label={t('ip.timing')}>
            {bars.map((b, i) => {
              const wr = b.matches ? b.wins / b.matches : 0;
              return (
                <div
                  key={b.m}
                  className="timing__col"
                  title={
                    b.matches
                      ? t('ip.tipMinute', {
                          n: b.m,
                          pct: fmtPct(b.matches / total),
                          wr: fmtPct(wr),
                        })
                      : undefined
                  }
                >
                  <motion.span
                    className={`timing__bar wr-bg--${b.matches ? wrTone(wr) : 'even'}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${(b.matches / peak) * 100}%` }}
                    transition={{
                      delay: Math.min(i * 0.012, 0.4),
                      duration: 0.5,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                  {b.m % 5 === 0 && <span className="timing__tick num">{t('ip.minute', { n: b.m })}</span>}
                </div>
              );
            })}
          </div>
          <div className="timing__legend">
            {(['awful', 'bad', 'even', 'good', 'great'] as const).map((tone) => (
              <i key={tone} className={`wr-bg--${tone}`} />
            ))}
            <span className="muted">{t('stat.winRate')}</span>
          </div>
          <p className="muted small-note">{t('ip.timingNote')}</p>
        </Panel>
      )}
    </section>
  );
}

export function ItemPage() {
  const { slug = '' } = useParams();
  const { t } = useT();
  const slugs = useShopItemSlugs();
  const items = useItems();
  const item = slugs.bySlug.get(slug);
  const { rows, isLoading: rowsLoading } = useHeroItemRows(undefined);
  const row = rows.find((r) => r.item.id === item?.id);

  useDocumentMeta(
    item ? t('meta.item', { name: item.name }) : undefined,
    item
      ? t('meta.desc.item', {
          name: item.name,
          wr: row ? fmtPct(row.winRate) : '—',
        })
      : undefined,
  );

  const from = useMemo(
    () => (item?.component_items ?? []).map((c) => items.byClass.get(c)).filter((x): x is Item => !!x && slugs.slugOf.has(x.id)),
    [item, items.byClass, slugs.slugOf],
  );
  const into = useMemo(
    () => (item ? items.shop.filter((i) => i.component_items?.includes(item.class_name) && slugs.slugOf.has(i.id)) : []),
    [item, items.shop, slugs.slugOf],
  );

  if (slugs.error)
    return (
      <Page>
        <div className="container">
          <ErrorState error={slugs.error} />
        </div>
      </Page>
    );
  if (slugs.isLoading)
    return (
      <Page>
        <div className="container">
          <Skeleton h={200} r={14} />
        </div>
      </Page>
    );
  if (!item) return <Navigate to="/items" replace />;

  const slot = (item.item_slot_type ?? 'weapon') as Slot;

  return (
    <Page>
      <div className={`container item-page slot-${slot}`}>
        <header className="item-head">
          <motion.div className="item-head__icon" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <img src={itemImage(item)} alt={item.name} />
          </motion.div>
          <div className="item-head__info">
            <nav className="crumbs">
              <Link to="/items">{t('ip.crumbs')}</Link>
              <span>/</span>
              <span className="item-head__slot">{t(`slot.${slot}`)}</span>
              {item.item_tier ? (
                <>
                  <span>·</span>
                  <span>{t('item.tier', { roman: TIER_ROMAN[item.item_tier] })}</span>
                </>
              ) : null}
            </nav>
            <h1 className="display item-head__name">{item.name}</h1>
            <dl className="hero-head__stats">
              {rowsLoading ? (
                Array.from({ length: 4 }, (_, i) => <Skeleton key={i} w={96} h={54} />)
              ) : row ? (
                <>
                  <div className="hstat">
                    <dt>{t('stat.winRate')}</dt>
                    <dd className={`wr wr--${wrTone(row.winRate)}`}>
                      <CountUp value={row.winRate} format={(n) => fmtPct(n, 2)} />
                    </dd>
                  </div>
                  <div className="hstat">
                    <dt>{t('stat.pickRate')}</dt>
                    <dd>
                      <CountUp value={row.pickRate} format={(n) => fmtPct(n)} />
                    </dd>
                  </div>
                  {row.stat.avg_buy_time_s ? (
                    <div className="hstat">
                      <dt>{t('stat.avgBuy')}</dt>
                      <dd>{fmtTime(row.stat.avg_buy_time_s)}</dd>
                    </div>
                  ) : null}
                  <div className="hstat">
                    <dt>{t('stat.matches')}</dt>
                    <dd>
                      <CountUp value={row.stat.matches} format={fmtCompact} />
                    </dd>
                  </div>
                </>
              ) : (
                <span className="muted">{t('ip.noStats')}</span>
              )}
            </dl>
          </div>
          <FilterBar />
        </header>

        <div className="item-layout">
          <div className="item-layout__main">
            <WhoBuys item={item} />
            <Timing item={item} />
          </div>
          <aside className="item-layout__side">
            <Panel title={t('ip.about')} className="item-about">
              <ItemCard item={item} />
            </Panel>
            {from.length > 0 && (
              <Panel title={t('ip.buildsFrom')}>
                <ItemLinkRow items={from} slugOf={slugs.slugOf} />
              </Panel>
            )}
            {into.length > 0 && (
              <Panel title={t('ip.buildsInto')}>
                <ItemLinkRow items={into} slugOf={slugs.slugOf} />
              </Panel>
            )}
          </aside>
        </div>
      </div>
    </Page>
  );
}
