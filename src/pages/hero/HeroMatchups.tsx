import { motion } from 'framer-motion';
import { useState } from 'react';
import { HeroChip } from '../../components/HeroChip';
import { Empty, ErrorState, Panel, SectionTitle, Segmented, SkeletonRows } from '../../components/UI';
import { Delta, WinRate, WinRateBar } from '../../components/WinRate';
import { useHeroMatchups, type MatchupRow } from '../../hooks/useHeroData';
import { useT } from '../../i18n';
import { fmtCompact, fmtPct } from '../../lib/format';
import type { Hero } from '../../lib/types';

function MatchTable({ rows }: { rows: MatchupRow[] }) {
  const { t } = useT();
  if (!rows.length) return <Empty>{t('hm.empty')}</Empty>;
  return (
    <table className="data-table match-table">
      <thead>
        <tr>
          <th>{t('stat.hero')}</th>
          <th className="c-wr">{t('stat.winRate')}</th>
          <th>{t('stat.vsAvg')}</th>
          <th className="hide-sm">{t('stat.matches')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <motion.tr key={r.other.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}>
            <td>
              <HeroChip hero={r.other} size={32} />
            </td>
            <td className="c-wr">
              <div className="cell-bar">
                <WinRate value={r.winRate} />
                <WinRateBar value={r.winRate} spread={0.1} />
              </div>
            </td>
            <td>
              <Delta value={r.delta} />
            </td>
            <td className="hide-sm num muted">{fmtCompact(r.matches)}</td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}

export function HeroMatchups({ hero }: { hero: Hero }) {
  const { t, rich } = useT();
  const m = useHeroMatchups(hero.id);
  const [view, setView] = useState<'vs' | 'with'>('vs');
  const rows = view === 'vs' ? m.vs : m.with;
  const half = Math.ceil(rows.length / 2);

  return (
    <div>
      <SectionTitle
        eyebrow={t('hm.eyebrow', { name: hero.name })}
        title={t(view === 'vs' ? 'hm.titleVs' : 'hm.titleWith')}
        right={
          <Segmented
            id="match-view"
            value={view}
            onChange={setView}
            options={[
              { value: 'vs', label: t('hm.counters') },
              { value: 'with', label: t('hm.synergies') },
            ]}
          />
        }
      />
      <p className="muted section-blurb">
        {rich(view === 'vs' ? 'hm.blurbVs' : 'hm.blurbWith', { name: hero.name, pct: <b className="num">{fmtPct(m.base)}</b> })}
      </p>
      {m.error ? (
        <ErrorState error={m.error} />
      ) : m.isLoading ? (
        <SkeletonRows rows={10} />
      ) : (
        <div className="match-grid">
          <Panel title={t(view === 'vs' ? 'hero.strongVs' : 'hm.best')} className="panel--good">
            <MatchTable rows={rows.slice(0, half)} />
          </Panel>
          <Panel title={t(view === 'vs' ? 'hero.weakVs' : 'hm.worst')} className="panel--bad">
            <MatchTable rows={rows.slice(half).reverse()} />
          </Panel>
        </div>
      )}
    </div>
  );
}
