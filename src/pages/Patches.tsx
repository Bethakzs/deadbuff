import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RankSelect } from '../components/FilterBar';
import { HeroChip } from '../components/HeroChip';
import { Empty, ErrorState, Page, Panel, SkeletonRows } from '../components/UI';
import { Delta, WinRate } from '../components/WinRate';
import { useBigPatchDays, useHeroes, usePatches } from '../hooks/useAssets';
import { useHeroStatsWindow } from '../hooks/useStats';
import { useT } from '../i18n';
import { fmtPct } from '../lib/format';
import { patchImpact, patchTimeline, patchWindows, type PatchImpactRow } from '../lib/patches';
import { useDocumentMeta } from '../lib/seo';

const TOP = 6;

/** "Sep 29, 2026" in the UI locale (UTC day, so it never shifts by time zone). */
const fmtDay = (unix: number, locale: string, withYear = true) =>
  new Date(unix * 1000).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });

function MoverList({ title, rows, tone }: { title: string; rows: PatchImpactRow[]; tone: 'good' | 'bad' }) {
  return (
    <Panel title={title} className={`panel--${tone} movers`}>
      <ol className="movers__list">
        {rows.map((r, i) => (
          <motion.li key={r.hero.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
            <HeroChip hero={r.hero} size={34} sub={<span className="num">{`${fmtPct(r.wrBefore)} → ${fmtPct(r.wrAfter)}`}</span>} />
            <Delta value={r.dWr} />
          </motion.li>
        ))}
      </ol>
    </Panel>
  );
}

export function PatchesPage() {
  const { t, meta } = useT();
  useDocumentMeta(t('meta.patches'), t('meta.desc.patches'));
  const heroes = useHeroes();
  const patches = usePatches();
  const bigDays = useBigPatchDays();
  const [params, setParams] = useSearchParams();

  const timeline = useMemo(() => patchTimeline(patches.data, bigDays.data), [patches.data, bigDays.data]);
  const asked = params.get('patch');
  const index = Math.max(
    0,
    timeline.findIndex((p) => p.day === asked),
  );
  const patch = timeline[index];
  const win = useMemo(() => (patch ? patchWindows(timeline, index) : undefined), [timeline, index, patch]);

  const before = useHeroStatsWindow(win?.before);
  const after = useHeroStatsWindow(win && win.afterDays >= 1 ? win.after : undefined);
  const rows = useMemo(
    () => (before.data && after.data && heroes.list.length ? patchImpact(heroes.list, before.data, after.data) : []),
    [before.data, after.data, heroes.list],
  );
  const winners = rows.filter((r) => r.dWr > 0).slice(0, TOP);
  const losers = [...rows]
    .reverse()
    .filter((r) => r.dWr < 0)
    .slice(0, TOP);

  const loadingList = patches.isLoading || bigDays.isLoading;
  const error = patches.error ?? before.error ?? after.error;
  const range = (w: { min: number; max: number }) => `${fmtDay(w.min, meta.locale, false)} – ${fmtDay(w.max, meta.locale)}`;

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('patch.eyebrow')}</span>
            <h1 className="display page-head__title">{t('patch.title')}</h1>
            <p className="page-head__sub muted">{t('patch.sub')}</p>
          </div>
          <div className="filter-bar">
            <RankSelect />
          </div>
        </header>

        <div className="patch-picker" role="listbox" aria-label={t('patch.select')}>
          {loadingList
            ? Array.from({ length: 6 }, (_, i) => <span key={i} className="patch-chip is-loading" />)
            : timeline.map((p, i) => (
                <button
                  key={p.day}
                  role="option"
                  aria-selected={i === index}
                  className={`patch-chip ${i === index ? 'is-active' : ''}`}
                  onClick={() =>
                    setParams(i === 0 ? {} : { patch: p.day }, {
                      replace: true,
                    })
                  }
                >
                  <span className="patch-chip__date num">{fmtDay(p.start, meta.locale)}</span>
                  {p.big && <span className="patch-chip__big">{t('patch.big')}</span>}
                </button>
              ))}
        </div>

        {patch && win && (
          <div className="patch-info">
            <span className="muted">
              {t('patch.window', {
                before: range(win.before),
                after: win.afterDays >= 1 ? range(win.after) : '—',
              })}
            </span>
            {patch.link && (
              <a href={patch.link} target="_blank" rel="noreferrer" className="patch-info__link">
                {t('patch.notes')}
              </a>
            )}
          </div>
        )}

        {error ? (
          <ErrorState error={error} onRetry={() => (patches.error ? patches.refetch() : (before.refetch(), after.refetch()))} />
        ) : win && win.afterDays < 1 ? (
          <Empty>{t('patch.fresh')}</Empty>
        ) : loadingList || before.isLoading || after.isLoading || heroes.isLoading ? (
          <SkeletonRows rows={8} />
        ) : !rows.length ? (
          <Empty>{t('patch.empty')}</Empty>
        ) : (
          <>
            {win && win.afterDays < 6 && <p className="muted small-note patch-partial">{t('patch.partial', { n: Math.floor(win.afterDays) })}</p>}
            <div className="movers-grid">
              <MoverList title={t('patch.winners')} rows={winners} tone="good" />
              <MoverList title={t('patch.losers')} rows={losers} tone="bad" />
            </div>

            <h2 className="display player-section-title">{t('patch.all')}</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('stat.hero')}</th>
                    <th className="hide-sm">{t('patch.wrBefore')}</th>
                    <th>{t('patch.wrAfter')}</th>
                    <th>{t('patch.dWr')}</th>
                    <th className="hide-md">{t('patch.prBefore')}</th>
                    <th className="hide-sm">{t('patch.prAfter')}</th>
                    <th className="hide-sm">{t('patch.dPr')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <motion.tr key={r.hero.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.3) }}>
                      <td>
                        <HeroChip hero={r.hero} size={32} />
                      </td>
                      <td className="hide-sm">
                        <WinRate value={r.wrBefore} />
                      </td>
                      <td>
                        <WinRate value={r.wrAfter} />
                      </td>
                      <td>
                        <Delta value={r.dWr} />
                      </td>
                      <td className="hide-md num muted">{fmtPct(r.prBefore)}</td>
                      <td className="hide-sm num">{fmtPct(r.prAfter)}</td>
                      <td className="hide-sm">
                        <Delta value={r.dPr} />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
