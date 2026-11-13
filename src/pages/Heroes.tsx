import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { HeroChip } from '../components/HeroChip';
import { PositionChips, PositionFilter, type PositionValue } from '../components/Position';
import { ErrorState, Page, Segmented, SkeletonRows, TierBadge } from '../components/UI';
import { MeterBar, WinRate, WinRateBar } from '../components/WinRate';
import { useHeroRows } from '../hooks/useStats';
import { useT, type MsgKey } from '../i18n';
import { useDocumentMeta } from '../lib/seo';
import { fmtCompact, fmtInt, fmtNum, fmtPct, fmtSouls } from '../lib/format';
import { ROLES, roleOf, type HeroRow, type Role } from '../lib/heroes';
import { playsPosition } from '../lib/roles';
import type { Hero } from '../lib/types';

type SortKey = 'name' | 'tier' | 'winRate' | 'pickRate' | 'kda' | 'souls' | 'damage' | 'matches';

const COLS: { key: SortKey; label: MsgKey; className?: string; title?: MsgKey }[] = [
  { key: 'name', label: 'stat.hero' },
  { key: 'tier', label: 'stat.tier', className: 'c-tier' },
  { key: 'winRate', label: 'stat.winRate', className: 'c-wr' },
  { key: 'pickRate', label: 'stat.pickRate', className: 'c-pr' },
  { key: 'kda', label: 'stat.kda', className: 'c-kda hide-sm', title: 'stat.kdaHint' },
  { key: 'souls', label: 'stat.souls', className: 'c-souls hide-md', title: 'stat.soulsHint' },
  { key: 'damage', label: 'stat.heroDmg', className: 'c-dmg hide-md', title: 'stat.dmgHint' },
  { key: 'matches', label: 'stat.matches', className: 'c-matches hide-sm' },
];

const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const sortValue = (r: HeroRow, k: SortKey): number | string =>
  k === 'name' ? r.hero.name : k === 'tier' ? -TIER_ORDER[r.tier] * 1000 + r.score : r[k];

/** Class filter values (Valve's hero_type): 'all' + every class key. */
export type RoleFilter = 'all' | Role;
export const ROLE_FILTERS: RoleFilter[] = ['all', ...ROLES];

/** Segmented-control options for the class filter, translated. */
export function useRoleOptions() {
  const { t } = useT();
  return ROLE_FILTERS.map((r) => ({ value: r, label: t(`role.${r}` as MsgKey) }));
}

/** Class + position filter predicate shared by the table, the home grid and the tier list. */
export const heroMatches = (hero: Hero, cls: RoleFilter, pos: PositionValue) =>
  (cls === 'all' || roleOf(hero) === cls) && (pos === 'all' || playsPosition(hero, pos));

export function HeroesPage() {
  const { t, rich } = useT();
  useDocumentMeta(t('meta.heroes'), t('meta.desc.heroes'));
  const { rows, isLoading, isFetching, error } = useHeroRows();
  const navigate = useNavigate();
  const roleOptions = useRoleOptions();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'winRate', dir: -1 });
  const [role, setRole] = useState<RoleFilter>('all');
  const [pos, setPos] = useState<PositionValue>('all');

  const sorted = useMemo(() => {
    const list = rows.filter((r) => heroMatches(r.hero, role, pos));
    return [...list].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return cmp * sort.dir;
    });
  }, [rows, sort, role, pos]);

  const maxPick = Math.max(...rows.map((r) => r.pickRate), 0.01);
  const totalMatches = rows.reduce((a, r) => a + r.stat.matches, 0) / 12;

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }));

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('heroes.eyebrow')}</span>
            <h1 className="display page-head__title">{t('heroes.title')}</h1>
            <p className="page-head__sub muted">
              {totalMatches > 0 ? rich('heroes.sub', { n: <b className="num">{fmtInt(totalMatches)}</b> }) : t('heroes.loading')}
            </p>
          </div>
          <FilterBar fetching={isFetching && !isLoading} />
        </header>

        <div className="toolbar">
          <Segmented id="role" value={role} onChange={setRole} options={roleOptions} />
          <div className="toolbar__end">
            <PositionFilter id="pos" value={pos} onChange={setPos} />
          </div>
        </div>

        {error ? (
          <ErrorState error={error} />
        ) : isLoading ? (
          <SkeletonRows rows={12} />
        ) : (
          <div className="table-wrap">
            <table className="data-table heroes-table">
              <thead>
                <tr>
                  <th className="c-rank">#</th>
                  {COLS.slice(0, 2).map((c) => header(c))}
                  <th className="c-pos hide-sm">{t('pos.column')}</th>
                  {COLS.slice(2).map((c) => header(c))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <motion.tr
                    key={r.hero.id}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.018, 0.4), layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
                    onClick={() => navigate(`/heroes/${r.hero.slug}`)}
                    className="is-clickable"
                  >
                    <td className="c-rank num muted">{i + 1}</td>
                    <td>
                      <HeroChip hero={r.hero} sub={t(`role.${roleOf(r.hero)}` as MsgKey)} />
                    </td>
                    <td className="c-tier">
                      <TierBadge tier={r.tier} />
                    </td>
                    <td className="c-pos hide-sm">
                      <PositionChips hero={r.hero} compact />
                    </td>
                    <td className="c-wr">
                      <div className="cell-bar">
                        <WinRate value={r.winRate} digits={2} />
                        <WinRateBar value={r.winRate} />
                      </div>
                    </td>
                    <td className="c-pr">
                      <div className="cell-bar">
                        <span className="num">{fmtPct(r.pickRate)}</span>
                        <MeterBar value={r.pickRate} max={maxPick} />
                      </div>
                    </td>
                    <td className="c-kda hide-sm">
                      <span className="num">{fmtNum(r.kda, 2)}</span>
                      <small className="kda-split num">
                        {fmtNum(r.kills)} / {fmtNum(r.deaths)} / {fmtNum(r.assists)}
                      </small>
                    </td>
                    <td className="c-souls hide-md num">{fmtSouls(r.souls)}</td>
                    <td className="c-dmg hide-md num">{fmtCompact(r.damage)}</td>
                    <td className="c-matches hide-sm num muted">{fmtCompact(r.matches)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );

  function header(c: (typeof COLS)[number]) {
    return (
      <th key={c.key} className={`${c.className ?? ''} is-sortable ${sort.key === c.key ? 'is-sorted' : ''}`} title={c.title ? t(c.title) : undefined}>
        <button onClick={() => toggle(c.key)}>
          {t(c.label)}
          <span className={`sort-arrow ${sort.key === c.key ? (sort.dir === 1 ? 'is-asc' : 'is-desc') : ''}`} aria-hidden />
        </button>
      </th>
    );
  }
}
