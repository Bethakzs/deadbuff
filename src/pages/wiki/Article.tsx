import { motion } from 'framer-motion';
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorState, SectionTitle, Skeleton } from '../../components/UI';
import { useBadgeDistribution, useGameMap, useGenericData, useItems, useNpcUnits, useRanks } from '../../hooks/useAssets';
import { useT, type MsgKey } from '../../i18n';
import { fmtFlex, fmtInt, fmtPct } from '../../lib/format';
import { SLOTS, type Slot } from '../../lib/items';
import { LEVEL_SOULS, UNLOCK_LEVELS, resolveText, type Block, type WikiArticle, type WikiCtx } from '../../lib/wiki';

/* Renders a declarative wiki article (lib/wiki.ts). The map article has its own component (MapArticle.tsx). */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

/** The context every text function gets: dictionary, API data, locale-aware number formatting. */
export function useWikiCtx(): WikiCtx {
  const { t } = useT();
  const generic = useGenericData();
  const npcs = useNpcUnits();
  const map = useGameMap();
  const items = useItems();
  return useMemo(
    () => ({
      t,
      d: { generic: generic.data, npcs: npcs.byClass, map: map.data, shop: items.shop },
      f: { int: fmtInt, pct: (r: number) => fmtPct(r, 0), flex: fmtFlex },
    }),
    [t, generic.data, npcs.byClass, map.data, items.shop],
  );
}

export function ArticleBody({ article }: { article: WikiArticle }) {
  const c = useWikiCtx();
  return (
    <>
      {article.sections.map((s) => (
        <section key={s.id} id={s.id} className="wiki-section">
          <SectionTitle title={c.t(s.title)} />
          {s.sub && <p className="muted section-sub">{resolveText(c, s.sub)}</p>}
          {s.blocks.map((b, i) => (
            <BlockView key={i} b={b} c={c} />
          ))}
        </section>
      ))}
    </>
  );
}

function BlockView({ b, c }: { b: Block; c: WikiCtx }) {
  switch (b.k) {
    case 'p':
      return <p className="wiki-p">{resolveText(c, b.text)}</p>;
    case 'cards':
      return (
        <div className="wiki-cards">
          {b.items.map((it, i) => {
            const tag = it.tag ? resolveText(c, it.tag) : '';
            return (
              <motion.article
                key={i}
                className={`wiki-card wiki-card--${it.tone ?? 'brass'}`}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <header>
                  <h3 className="display">{resolveText(c, it.title)}</h3>
                  {tag && <span className="wiki-card__tag display num">{tag}</span>}
                </header>
                <p>{resolveText(c, it.text)}</p>
              </motion.article>
            );
          })}
        </div>
      );
    case 'table': {
      const rows = b.rows(c);
      const num = new Set(b.num ?? []);
      const head = b.head.map((h) => c.t(h));
      return (
        <div className="wiki-table-wrap panel">
          <table className={`wiki-table wiki-table--gen ${b.marks ? 'wiki-table--marks' : ''}`}>
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={i} className={num.has(i) || (b.marks && i > 0 && i < head.length - 1) ? 'num' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, i) => {
                    const mark = b.marks && i > 0 && i < r.length - 1;
                    return (
                      <td key={i} className={num.has(i) || mark ? 'num' : ''} data-label={i ? head[i] : undefined}>
                        {mark ? <span className={`wiki-mark wiki-mark--${cell === '✓' ? 'yes' : cell === '✕' ? 'no' : 'slow'}`}>{cell}</span> : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'terms':
      return (
        <dl className="wiki-terms">
          {b.items.map((it) => (
            <div key={it.term} className="wiki-term">
              <dt className="display">{c.t(it.term)}</dt>
              <dd>{c.t(it.text)}</dd>
            </div>
          ))}
        </dl>
      );
    case 'link':
      return (
        <p className="wiki-p">
          <Link className="link-more" to={b.to}>
            {c.t(b.text)}
          </Link>
        </p>
      );
    case 'levels':
      return <Levels c={c} />;
    case 'tiers':
      return <Tiers c={c} />;
    case 'ranks':
      return <Ranks />;
  }
}

/* ------------------------------- levels -------------------------------- */

function Levels({ c }: { c: WikiCtx }) {
  return (
    <ol className="wiki-levels">
      {LEVEL_SOULS.map((souls, lvl) => {
        const unlock = UNLOCK_LEVELS.has(lvl);
        return (
          <li key={lvl} className={unlock ? 'is-unlock' : ''} title={c.t('wiki.souls.lvl', { n: lvl })}>
            <span className="wiki-levels__n display num">{lvl}</span>
            <span className="wiki-levels__souls num">{c.f.int(souls)}</span>
            <span className="wiki-levels__gain">{unlock ? c.t('wiki.souls.unlock') : c.t('wiki.souls.point')}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------- tiers -------------------------------- */

function Tiers({ c }: { c: WikiCtx }) {
  const prices = c.d.generic?.item_price_per_tier;
  const counts = useMemo(() => {
    const out = [1, 2, 3, 4].map(() => ({ weapon: 0, vitality: 0, spirit: 0 }) as Record<Slot, number>);
    for (const it of c.d.shop) {
      const slot = it.item_slot_type as Slot;
      if (it.item_tier && it.item_tier <= 4 && slot in out[0]) out[it.item_tier - 1][slot]++;
    }
    return out;
  }, [c.d.shop]);
  return (
    <div className="wiki-tiers">
      {[1, 2, 3, 4].map((tier) => {
        const n = counts[tier - 1];
        const total = n.weapon + n.vitality + n.spirit;
        return (
          <article key={tier} className="wiki-tier">
            <span className="wiki-tier__name display">{c.t('item.tier', { roman: ROMAN[tier] })}</span>
            <span className="wiki-tier__price display num">{prices?.[tier] !== undefined ? c.f.int(prices[tier]) : <Skeleton w={70} h={28} />}</span>
            <span className="wiki-tier__count muted">{total ? c.t('wiki.shop.items', { n: total }) : '—'}</span>
            <div className="wiki-tier__bar" aria-hidden>
              {total > 0 && SLOTS.map((s) => <i key={s} className={`slot-${s}`} style={{ flexGrow: n[s] }} />)}
            </div>
            <ul className="wiki-tier__slots">
              {SLOTS.map((s) => (
                <li key={s} className={`slot-${s}`}>
                  <b className="num">{n[s]}</b> {c.t(`slot.${s}` as MsgKey)}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

/* -------------------------------- ranks -------------------------------- */

function Ranks() {
  const { t } = useT();
  const ranks = useRanks();
  const dist = useBadgeDistribution();

  const rows = useMemo(() => {
    const byTier = new Map<number, number[]>();
    for (const r of dist.data ?? []) {
      const tier = Math.floor(r.badge_level / 10);
      const sub = r.badge_level % 10;
      if (tier < 1 || sub < 1 || sub > 6) continue;
      const arr = byTier.get(tier) ?? [0, 0, 0, 0, 0, 0];
      arr[sub - 1] += r.unique_players;
      byTier.set(tier, arr);
    }
    const total = [...byTier.values()].flat().reduce((a, b) => a + b, 0);
    const tiers = (ranks.data ?? []).filter((r) => r.tier >= 1).sort((a, b) => b.tier - a.tier);
    let above = 0;
    const list = tiers.map((r) => {
      const subs = byTier.get(r.tier) ?? [0, 0, 0, 0, 0, 0];
      const n = subs.reduce((a, b) => a + b, 0);
      const row = { rank: r, subs, n, share: total ? n / total : 0, top: total ? (above + n) / total : 0 };
      above += n;
      return row;
    });
    const max = Math.max(...list.map((x) => x.share), 0.0001);
    return { list, total, max };
  }, [dist.data, ranks.data]);

  if (dist.error) return <ErrorState error={dist.error} onRetry={() => dist.refetch()} />;
  if (dist.isLoading || ranks.isLoading)
    return (
      <div className="wiki-ranks">
        {Array.from({ length: 11 }, (_, i) => (
          <Skeleton key={i} h={56} r={12} />
        ))}
      </div>
    );
  if (!rows.total) return <Empty>{t('wiki.ranks.noData')}</Empty>;

  return (
    <>
      <p className="muted wiki-ranks__total">{t('wiki.ranks.players', { n: rows.total, count: fmtInt(rows.total) })}</p>
      <ol className="wiki-ranks">
        {rows.list.map((r, i) => (
          <motion.li
            key={r.rank.tier}
            className="wiki-rank"
            style={{ '--rank': r.rank.color } as CSSProperties}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <img className="wiki-rank__badge" src={r.rank.images.small_webp ?? r.rank.images.large_webp} alt="" loading="lazy" width={44} height={44} />
            <span className="wiki-rank__name display">{r.rank.name}</span>
            <span className="wiki-rank__bar">
              <motion.span
                className="wiki-rank__fill"
                initial={{ width: 0 }}
                whileInView={{ width: `${(r.share / rows.max) * 100}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + Math.min(i * 0.04, 0.4), duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                {r.subs.map((n, s) => (
                  <i key={s} style={{ flexGrow: n }} title={`${r.rank.name} ${ROMAN[s + 1]} · ${fmtPct(rows.total ? n / rows.total : 0, 1)}`} />
                ))}
              </motion.span>
            </span>
            <span className="wiki-rank__share num">{fmtPct(r.share, 1)}</span>
            <span className="wiki-rank__top muted num">{t('wiki.ranks.top', { pct: fmtPct(r.top, r.top < 0.01 ? 2 : 1) })}</span>
          </motion.li>
        ))}
      </ol>
    </>
  );
}
