import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { HeroCard } from '../components/HeroCard';
import { PositionFilter, type PositionValue } from '../components/Position';
import { ErrorState, Page, SkeletonRows, TierBadge } from '../components/UI';
import { useHeroRows } from '../hooks/useStats';
import { useT } from '../i18n';
import { useDocumentMeta } from '../lib/seo';
import { fmtPct } from '../lib/format';
import type { Tier } from '../lib/heroes';
import { heroMatches } from './Heroes';

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D'];

export function TierListPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.tier'), t('meta.desc.tier'));
  const { rows, isLoading, isFetching, error } = useHeroRows();
  const [pos, setPos] = useState<PositionValue>('all');
  const byTier = useMemo(() => {
    const m = new Map<Tier, typeof rows>();
    for (const r of [...rows].sort((a, b) => b.score - a.score)) {
      if (!heroMatches(r.hero, 'all', pos)) continue;
      m.set(r.tier, [...(m.get(r.tier) ?? []), r]);
    }
    return m;
  }, [rows, pos]);

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('tier.eyebrow')}</span>
            <h1 className="display page-head__title">{t('tier.title')}</h1>
            <p className="page-head__sub muted">{t('tier.sub')}</p>
          </div>
          <FilterBar fetching={isFetching && !isLoading} />
        </header>

        <div className="toolbar">
          <div className="toolbar__end">
            <PositionFilter id="tier-pos" value={pos} onChange={setPos} />
          </div>
        </div>

        {error ? (
          <ErrorState error={error} />
        ) : isLoading ? (
          <SkeletonRows rows={5} h={170} />
        ) : (
          <div className="tierlist">
            {TIERS.map((tier, ti) => {
              const list = byTier.get(tier) ?? [];
              const avg = list.length ? list.reduce((a, r) => a + r.winRate, 0) / list.length : 0;
              return (
                <motion.section
                  key={tier}
                  className={`tier-row tier-row--${tier}`}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: ti * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <header className="tier-row__label">
                    <TierBadge tier={tier} size="lg" />
                    <p>{t(`tier.${tier}`)}</p>
                    {list.length > 0 && <small className="num muted">{t('tier.avg', { pct: fmtPct(avg) })}</small>}
                  </header>
                  <div className="tier-row__heroes">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {list.map((r, i) => (
                        <HeroCard key={r.hero.id} hero={r.hero} row={r} index={i} size="sm" />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.section>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
