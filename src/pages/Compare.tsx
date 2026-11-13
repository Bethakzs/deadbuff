import { motion } from 'framer-motion';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HeroChip } from '../components/HeroChip';
import { Empty, ErrorState, Page, Panel, SectionTitle, Skeleton } from '../components/UI';
import { WinRate } from '../components/WinRate';
import { useHeroes } from '../hooks/useAssets';
import { useMateStats, usePlayerRanks, usePlayersHeroStats, useSteamSearch } from '../hooks/usePlayer';
import { useSteamProfiles } from '../hooks/useStats';
import { useT } from '../i18n';
import { fmtInt, fmtNum, fmtPct } from '../lib/format';
import { useMe } from '../lib/me';
import { useDocumentMeta } from '../lib/seo';
import { parseAccountInput, searchTermFromInput } from '../lib/steam';
import type { PlayerHeroStat } from '../lib/types';
import { PeriodSwitch, totals, type Period } from './Dashboard';
import { CompareRow } from './Match';
import { RankEmblem } from './Players';

const validId = (raw: string | null) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 2 ** 32 ? n : null;
};

/** Search box for the second player: Steam name / link / id, plus the people you play with most as one-click picks. */
function PlayerPicker({ onPick, exclude, mateOf }: { onPick: (id: number) => void; exclude: (number | null)[]; mateOf: number | null }) {
  const { t } = useT();
  const [input, setInput] = useState('');
  const deferred = useDeferredValue(input);
  const directId = parseAccountInput(deferred);
  const term = directId ? '' : searchTermFromInput(deferred);
  const search = useSteamSearch(term);
  const mates = useMateStats(mateOf ?? 0);
  const topMates = useMemo(
    () => [...(mates.data ?? [])].filter((m) => !exclude.includes(m.mate_id)).sort((a, b) => b.matches_played - a.matches_played).slice(0, 6),
    [mates.data, exclude],
  );
  const mateProfiles = useSteamProfiles(useMemo(() => topMates.map((m) => m.mate_id), [topMates]));

  return (
    <div className="cmp-picker">
      <div className="search">
        <svg className="search__icon" viewBox="0 0 20 20" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('players.placeholder')} aria-label={t('players.placeholder')} spellCheck={false} />
      </div>
      <div className="cmp-picker__results">
        {directId ? (
          <button className="player-result" onClick={() => onPick(directId)}>
            <span className="player-result__avatar is-empty">#</span>
            <span className="player-result__name">{t('players.open', { id: directId })}</span>
          </button>
        ) : term.length >= 2 ? (
          search.isLoading ? (
            <Skeleton h={56} r={12} />
          ) : (
            (search.data ?? []).slice(0, 6).map((p) => (
              <button key={p.account_id} className="player-result" onClick={() => onPick(p.account_id)}>
                {p.avatarmedium ? <img className="player-result__avatar" src={p.avatarmedium} alt="" /> : <span className="player-result__avatar is-empty" />}
                <span className="player-result__name">{p.personaname}</span>
                <RankEmblem badge={p.last_team_avg_badge} />
              </button>
            ))
          )
        ) : (
          topMates.length > 0 && (
            <>
              <span className="eyebrow">{t('cmp.mates')}</span>
              {topMates.map((m) => {
                const p = mateProfiles.get(m.mate_id);
                return (
                  <button key={m.mate_id} className="player-result" onClick={() => onPick(m.mate_id)}>
                    {p?.avatarmedium ? <img className="player-result__avatar" src={p.avatarmedium} alt="" /> : <span className="player-result__avatar is-empty" />}
                    <span className="player-result__name">{p?.personaname ?? `#${m.mate_id}`}</span>
                    <span className="player-result__meta muted">{t('cmp.together', { n: m.matches_played })}</span>
                  </button>
                );
              })}
            </>
          )
        )}
      </div>
    </div>
  );
}

function Side({ id, side, onClear }: { id: number; side: 0 | 1; onClear: () => void }) {
  const { t } = useT();
  const profile = useSteamProfiles([id]).get(id);
  const rank = usePlayerRanks([id]).get(id);
  return (
    <div className={`cmp-side cmp-side--${side}`}>
      {profile?.avatarfull || profile?.avatarmedium ? <img className="cmp-side__avatar" src={profile.avatarfull ?? profile.avatarmedium} alt="" /> : <span className="cmp-side__avatar is-empty" />}
      <div className="cmp-side__info">
        <Link to={`/players/${id}`} className="display cmp-side__name">
          {profile?.personaname ?? `#${id}`}
        </Link>
        <div className="cmp-side__meta">
          {rank?.badge ? <RankEmblem badge={rank.badge} size={28} /> : <span className="muted small">{t('player.unranked')}</span>}
          <button className="link-more" onClick={onClear}>
            {t('cmp.change')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommonHeroes({ a, b }: { a: PlayerHeroStat[]; b: PlayerHeroStat[] }) {
  const { t } = useT();
  const heroes = useHeroes();
  const rows = useMemo(() => {
    const bMap = new Map(b.filter((r) => r.matches_played > 0).map((r) => [r.hero_id, r]));
    return a
      .filter((r) => r.matches_played > 0 && bMap.has(r.hero_id) && heroes.byId.has(r.hero_id))
      .map((r) => ({ hero: heroes.byId.get(r.hero_id)!, a: r, b: bMap.get(r.hero_id)! }))
      .sort((x, y) => y.a.matches_played + y.b.matches_played - (x.a.matches_played + x.b.matches_played))
      .slice(0, 15);
  }, [a, b, heroes.byId]);
  if (!rows.length) return <Empty>{t('cmp.noCommon')}</Empty>;
  return (
    <div className="table-wrap">
      <table className="data-table cmp-table">
        <thead>
          <tr>
            <th>{t('stat.hero')}</th>
            <th className="cmp-table__a">{t('stat.matches')}</th>
            <th className="cmp-table__a">{t('stat.winRate')}</th>
            <th className="cmp-table__b">{t('stat.winRate')}</th>
            <th className="cmp-table__b">{t('stat.matches')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const wa = r.a.wins / r.a.matches_played;
            const wb = r.b.wins / r.b.matches_played;
            return (
              <tr key={r.hero.id}>
                <td>
                  <HeroChip hero={r.hero} size={28} />
                </td>
                <td className="num cmp-table__a">{r.a.matches_played}</td>
                <td className={`cmp-table__a ${wa > wb ? 'is-lead' : ''}`}>
                  <WinRate value={wa} />
                </td>
                <td className={`cmp-table__b ${wb > wa ? 'is-lead' : ''}`}>
                  <WinRate value={wb} />
                </td>
                <td className="num cmp-table__b">{r.b.matches_played}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ComparePage() {
  const { t } = useT();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<Period>(90);
  const a = validId(params.get('a')) ?? me;
  const b = validId(params.get('b'));
  const stats = usePlayersHeroStats(a && b ? [a, b] : [], period || undefined);
  const mates = useMateStats(a && b ? a : 0);
  const pa = useSteamProfiles(a ? [a] : []).get(a ?? -1);
  const pb = useSteamProfiles(b ? [b] : []).get(b ?? -1);

  useDocumentMeta(t('meta.compare'), t('meta.desc.compare'));

  const set = (key: 'a' | 'b', id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set(key, String(id));
    else next.delete(key);
    if (key === 'a' && !next.get('a') && me) next.delete('a');
    setParams(next, { replace: true });
  };

  const rowsA = useMemo(() => (stats.data ?? []).filter((r) => r.account_id === a), [stats.data, a]);
  const rowsB = useMemo(() => (stats.data ?? []).filter((r) => r.account_id === b), [stats.data, b]);
  const ta = totals(rowsA);
  const tb = totals(rowsB);
  const together = (mates.data ?? []).find((m) => m.mate_id === b);
  const nameA = pa?.personaname ?? `#${a}`;
  const nameB = pb?.personaname ?? `#${b}`;

  return (
    <Page className="cmp-page">
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('cmp.eyebrow')}</span>
            <h1 className="display page-head__title">{t('cmp.title')}</h1>
            <p className="page-head__sub muted">{t('cmp.sub')}</p>
          </div>
          {a && b && <PeriodSwitch id="cmp-period" value={period} onChange={setPeriod} />}
        </header>

        <div className="cmp-head">
          {a ? (
            <Side id={a} side={0} onClear={() => set('a', null)} />
          ) : (
            <div className="cmp-side cmp-side--0 cmp-side--empty">
              <span className="eyebrow">{t('cmp.you')}</span>
              <PlayerPicker onPick={(id) => set('a', id)} exclude={[b]} mateOf={null} />
            </div>
          )}
          <span className="cmp-head__vs display" aria-hidden>
            vs
          </span>
          {b ? (
            <Side id={b} side={1} onClear={() => set('b', null)} />
          ) : (
            <div className="cmp-side cmp-side--1 cmp-side--empty">
              <span className="eyebrow">{t('cmp.friend')}</span>
              <PlayerPicker onPick={(id) => set('b', id)} exclude={[a]} mateOf={a} />
            </div>
          )}
        </div>

        {a && b ? (
          stats.error ? (
            <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
          ) : stats.isLoading ? (
            <Skeleton h={420} r={14} />
          ) : !ta.matches || !tb.matches ? (
            <Empty>{t('cmp.noData', { name: !ta.matches ? nameA : nameB })}</Empty>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Panel className="compare-panel cmp-panel">
                <div className="compare-panel__head">
                  <span className="compare-panel__team compare-panel__team--0 display">{nameA}</span>
                  <span className="compare-panel__team compare-panel__team--1 display">{nameB}</span>
                </div>
                <CompareRow label={t('stat.matches')} a={ta.matches} b={tb.matches} format={fmtInt} />
                <CompareRow label={t('stat.winRate')} a={ta.wr} b={tb.wr} format={(n) => fmtPct(n)} />
                <CompareRow label={t('stat.kda')} a={ta.kda} b={tb.kda} format={(n) => fmtNum(n, 2)} />
                <CompareRow label={t('cmp.killsPer')} a={ta.kills} b={tb.kills} format={(n) => fmtNum(n)} />
                <CompareRow label={t('cmp.deathsPer')} a={ta.deaths} b={tb.deaths} format={(n) => fmtNum(n)} lowerBetter />
                <CompareRow label={t('cmp.assistsPer')} a={ta.assists} b={tb.assists} format={(n) => fmtNum(n)} />
                <CompareRow label={t('dash.soulsMin')} a={ta.soulsMin} b={tb.soulsMin} format={fmtInt} />
                <CompareRow label={t('cmp.dmgMin')} a={ta.dmgMin} b={tb.dmgMin} format={fmtInt} />
                <CompareRow label={t('cmp.lhMin')} a={ta.lhMin} b={tb.lhMin} format={(n) => fmtNum(n)} />
                <CompareRow label={t('match.accuracy')} a={ta.accuracy} b={tb.accuracy} format={(n) => fmtPct(n)} />
                <CompareRow label={t('dash.heroesPlayed')} a={ta.heroes} b={tb.heroes} format={fmtInt} />
              </Panel>

              <Panel className="cmp-together" title={t('cmp.togetherTitle')}>
                {together ? (
                  <p className="cmp-together__line">
                    <b className="num">{fmtInt(together.matches_played)}</b> <span className="muted">{t('cmp.togetherText', { n: together.matches_played })}</span> ·{' '}
                    <WinRate value={together.wins / together.matches_played} /> <span className="muted">{t('stat.winLower')}</span> ·{' '}
                    <b className="num">{fmtInt(together.wins)}</b> <span className="muted">{t('cmp.wins', { n: together.wins })}</span>
                  </p>
                ) : (
                  <p className="muted">{t('cmp.neverTogether')}</p>
                )}
              </Panel>

              <section className="item-section">
                <SectionTitle title={t('cmp.common')} />
                <p className="muted section-sub">{t('cmp.commonSub', { a: nameA, b: nameB })}</p>
                <CommonHeroes a={rowsA} b={rowsB} />
              </section>
            </motion.div>
          )
        ) : (
          <p className="muted small-note">{t(a ? 'cmp.pickFriend' : 'cmp.pickYou')}</p>
        )}
      </div>
    </Page>
  );
}
