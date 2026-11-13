import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BuildCard } from '../components/BuildCard';
import { HeroAvatar, HeroChip } from '../components/HeroChip';
import { Empty, ErrorState, Page, Panel, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { Delta, WinRate } from '../components/WinRate';
import { useHeroes, useItems, useRanks } from '../hooks/useAssets';
import { useMatchHistory, usePlayerRank, usePlayersHeroStats } from '../hooks/usePlayer';
import { useBuildsByIds, useHeroStatsAtRank, useSteamProfiles } from '../hooks/useStats';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { useFavorites } from '../lib/favorites';
import { fmtInt, fmtNum, fmtPct } from '../lib/format';
import { heroAbilities, heroRgb } from '../lib/heroes';
import { useMe } from '../lib/me';
import { useDocumentMeta } from '../lib/seo';
import type { Hero, HeroStat, PlayerHeroStat } from '../lib/types';
import { SteamButton } from './Login';
import { MatchList, normalMatches } from './Player';
import { RankEmblem } from './Players';

/** Look-back windows for personal stats (0 = all time). */
export const PERIODS = [30, 90, 0] as const;
export type Period = (typeof PERIODS)[number];
/** A hero needs this many games before it can count as "strong" or "weak". */
const MIN_GAMES = 5;

export function PeriodSwitch({ value, onChange, id }: { value: Period; onChange: (p: Period) => void; id: string }) {
  const { t } = useT();
  return (
    <Segmented<Period>
      id={id}
      value={value}
      onChange={onChange}
      options={PERIODS.map((p) => ({ value: p, label: p ? t('dash.days', { n: p }) : t('dash.allTime') }))}
    />
  );
}

/** Localised rank tier name ("Oracle") for a badge. */
export function useRankName(badge?: number | null) {
  const ranks = useRanks();
  if (!badge) return null;
  return ranks.data?.find((r) => r.tier === Math.floor(badge / 10))?.name ?? null;
}

export interface HeroVsRank {
  hero: Hero;
  stat: PlayerHeroStat;
  matches: number;
  wr: number;
  /** win rate of everyone on this hero at your rank */
  rankWr?: number;
  delta?: number;
  kda: number;
}

export function heroVsRank(rows: PlayerHeroStat[] = [], byId: Map<number, Hero>, rankStats: HeroStat[] = []): HeroVsRank[] {
  const avg = new Map(rankStats.filter((s) => s.matches > 0).map((s) => [s.hero_id, s.wins / s.matches]));
  return rows
    .filter((r) => r.matches_played > 0 && byId.has(r.hero_id))
    .map((r) => {
      const wr = r.wins / r.matches_played;
      const rankWr = avg.get(r.hero_id);
      return {
        hero: byId.get(r.hero_id)!,
        stat: r,
        matches: r.matches_played,
        wr,
        rankWr,
        delta: rankWr === undefined ? undefined : wr - rankWr,
        kda: (r.kills + r.assists) / Math.max(r.deaths, 1),
      };
    })
    .sort((a, b) => b.matches - a.matches);
}

/** Summed career numbers over per-hero rows. */
export function totals(rows: PlayerHeroStat[] = []) {
  const sum = (f: (r: PlayerHeroStat) => number) => rows.reduce((a, r) => a + f(r), 0);
  const matches = sum((r) => r.matches_played);
  const time = sum((r) => r.time_played) || 1;
  /** per-minute stats weighted by time played on each hero */
  const perMin = (f: (r: PlayerHeroStat) => number | undefined) => sum((r) => (f(r) ?? 0) * r.time_played) / time;
  return {
    matches,
    wins: sum((r) => r.wins),
    wr: matches ? sum((r) => r.wins) / matches : 0,
    kills: matches ? sum((r) => r.kills) / matches : 0,
    deaths: matches ? sum((r) => r.deaths) / matches : 0,
    assists: matches ? sum((r) => r.assists) / matches : 0,
    kda: (sum((r) => r.kills) + sum((r) => r.assists)) / Math.max(sum((r) => r.deaths), 1),
    soulsMin: perMin((r) => r.networth_per_min),
    dmgMin: perMin((r) => r.damage_per_min),
    takenMin: perMin((r) => r.damage_taken_per_min),
    lhMin: perMin((r) => r.last_hits_per_min),
    accuracy: matches ? sum((r) => (r.accuracy ?? 0) * r.matches_played) / matches : 0,
    heroes: rows.filter((r) => r.matches_played > 0).length,
  };
}

/* ------------------------------ sections ------------------------------ */

function Welcome() {
  const { t } = useT();
  const { user } = useAuth();
  return (
    <Panel className="dash-welcome">
      <h2 className="display">{t(user ? 'dash.linkTitle' : 'dash.welcomeTitle')}</h2>
      <p className="muted">{t(user ? 'dash.linkText' : 'dash.welcomeText')}</p>
      <div className="dash-welcome__actions">
        {user ? (
          <SteamButton mode="link" next="/me" label={t('account.link')} />
        ) : (
          <>
            <SteamButton mode="login" next="/me" label={t('auth.steam')} />
            <Link className="btn btn--ghost" to="/login?next=/me">
              {t('auth.login')}
            </Link>
          </>
        )}
        <Link className="link-more" to="/players">
          {t('dash.findProfile')}
        </Link>
      </div>
    </Panel>
  );
}

function StrongWeak({ title, rows, tone }: { title: string; rows: HeroVsRank[]; tone: 'up' | 'down' }) {
  const { t } = useT();
  return (
    <Panel title={title} className={`dash-sw dash-sw--${tone}`}>
      {!rows.length ? (
        <p className="muted small-note">{t('dash.needGames', { n: MIN_GAMES })}</p>
      ) : (
        <ol className="dash-sw__list">
          {rows.map((r, i) => (
            <motion.li key={r.hero.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/heroes/${r.hero.slug}`} className="dash-sw__row" style={{ ['--hero' as string]: heroRgb(r.hero) }}>
                <HeroAvatar hero={r.hero} size={40} />
                <span className="dash-sw__text">
                  <b>{r.hero.name}</b>
                  <small className="muted">
                    {t('dash.youVsAvg', { you: fmtPct(r.wr), avg: fmtPct(r.rankWr ?? 0), n: r.matches })}
                  </small>
                </span>
                <Delta value={r.delta ?? 0} />
              </Link>
            </motion.li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function HeroRankTable({ rows }: { rows: HeroVsRank[] }) {
  const { t } = useT();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <section className="item-section">
      <SectionTitle title={t('dash.heroesTitle')} />
      <p className="muted section-sub">{t('dash.heroesSub')}</p>
      <div className="table-wrap">
        <table className="data-table dash-table">
          <thead>
            <tr>
              <th>{t('stat.hero')}</th>
              <th>{t('stat.matches')}</th>
              <th>{t('dash.yourWr')}</th>
              <th className="hide-sm">{t('dash.rankWr')}</th>
              <th>{t('dash.diff')}</th>
              <th className="hide-sm">{t('stat.kda')}</th>
              <th className="hide-md">{t('dash.soulsMin')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <motion.tr key={r.hero.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                <td>
                  <HeroChip hero={r.hero} size={30} />
                </td>
                <td className="num">{fmtInt(r.matches)}</td>
                <td>
                  <WinRate value={r.wr} />
                </td>
                <td className="hide-sm">{r.rankWr !== undefined ? <WinRate value={r.rankWr} /> : <span className="muted">—</span>}</td>
                <td>{r.delta !== undefined ? <Delta value={r.delta} /> : <span className="muted">—</span>}</td>
                <td className="hide-sm num">{fmtNum(r.kda, 2)}</td>
                <td className="hide-md num">{r.stat.networth_per_min ? fmtInt(r.stat.networth_per_min) : '—'}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <div className="load-more">
          <button className="btn btn--ghost" onClick={() => setAll((a) => !a)}>
            {all ? t('ip.showLess') : t('dash.showAll', { n: rows.length })}
          </button>
        </div>
      )}
    </section>
  );
}

function Favorites({ mine }: { mine: Map<number, HeroVsRank> }) {
  const { t } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const { list, synced } = useFavorites();
  const heroFavs = list.filter((f) => f.kind === 'hero').map((f) => heroes.byId.get(f.id)).filter((h): h is Hero => !!h);
  const buildIds = useMemo(() => list.filter((f) => f.kind === 'build').map((f) => f.id), [list]);
  const { builds, isLoading } = useBuildsByIds(buildIds);

  return (
    <section className="item-section">
      <SectionTitle title={t('fav.title')} />
      {!synced && list.length > 0 && <p className="muted section-sub">{t('fav.guestNote')}</p>}
      {!list.length ? (
        <Empty>{t('fav.empty')}</Empty>
      ) : (
        <>
          {heroFavs.length > 0 && (
            <div className="fav-heroes">
              {heroFavs.map((h) => {
                const r = mine.get(h.id);
                return (
                  <Link key={h.id} to={`/heroes/${h.slug}`} className="fav-hero" style={{ ['--hero' as string]: heroRgb(h) }}>
                    <HeroAvatar hero={h} size={44} />
                    <span className="fav-hero__text">
                      <b>{h.name}</b>
                      <small className="muted">{r ? t('dash.youShort', { wr: fmtPct(r.wr), n: r.matches }) : t('dash.notPlayed')}</small>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {buildIds.length > 0 && (
            <div className="build-list fav-builds">
              {isLoading && !builds.length
                ? buildIds.slice(0, 3).map((id) => <Skeleton key={id} h={96} r={12} />)
                : builds.map((b) => {
                    const hero = heroes.byId.get(b.hero_build.hero_id);
                    return (
                      <BuildCard
                        key={b.hero_build.hero_build_id}
                        build={b}
                        hero={hero}
                        abilities={hero ? heroAbilities(hero, items.byClass) : undefined}
                      />
                    );
                  })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* -------------------------------- page -------------------------------- */

export function DashboardPage() {
  const { t } = useT();
  const me = useMe();
  const { user, isLoading: authLoading } = useAuth();
  const [period, setPeriod] = useState<Period>(90);
  const heroes = useHeroes();
  const profile = useSteamProfiles(me ? [me] : []).get(me ?? -1);
  const rank = usePlayerRank(me ?? 0);
  const stats = usePlayersHeroStats(me ? [me] : [], period || undefined);
  const rankStats = useHeroStatsAtRank(rank.data?.badge || undefined);
  const history = useMatchHistory(me ?? 0);
  const rankName = useRankName(rank.data?.badge);

  useDocumentMeta(t('meta.dashboard'), t('meta.desc.dashboard'));

  const rows = useMemo(() => heroVsRank(stats.data, heroes.byId, rankStats.data), [stats.data, heroes.byId, rankStats.data]);
  const byHero = useMemo(() => new Map(rows.map((r) => [r.hero.id, r])), [rows]);
  const sum = useMemo(() => totals(stats.data), [stats.data]);
  const eligible = rows.filter((r) => r.matches >= MIN_GAMES && r.delta !== undefined);
  const strong = [...eligible].sort((a, b) => b.delta! - a.delta!).filter((r) => r.delta! > 0).slice(0, 3);
  const weak = [...eligible].sort((a, b) => a.delta! - b.delta!).filter((r) => r.delta! < 0).slice(0, 3);
  const recent = useMemo(() => normalMatches(history.data).slice(0, 10), [history.data]);

  if (authLoading) {
    return (
      <Page>
        <div className="container">
          <Skeleton h={420} r={14} />
        </div>
      </Page>
    );
  }

  return (
    <Page className="dash-page">
      <div className="container">
        <header className="page-head dash-head">
          {me && (profile?.avatarfull || profile?.avatarmedium) ? <img className="dash-head__avatar" src={profile.avatarfull ?? profile.avatarmedium} alt="" /> : null}
          <div className="dash-head__info">
            <span className="eyebrow">{t('dash.eyebrow')}</span>
            <h1 className="display page-head__title">{me ? profile?.personaname ?? user?.username ?? `#${me}` : t('dash.title')}</h1>
            {me && (
              <div className="dash-head__meta">
                {rank.data?.badge ? <RankEmblem badge={rank.data.badge} size={32} /> : <span className="chip chip--ghost">{t('player.unranked')}</span>}
                <Link className="link-more" to={`/players/${me}`}>
                  {t('dash.fullProfile')}
                </Link>
                <Link className="link-more" to="/compare">
                  {t('dash.compareCta')}
                </Link>
              </div>
            )}
          </div>
          {me && <PeriodSwitch id="dash-period" value={period} onChange={setPeriod} />}
        </header>

        {!me ? (
          <>
            <Welcome />
            <Favorites mine={byHero} />
          </>
        ) : (
          <>
            {stats.error ? (
              <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
            ) : stats.isLoading ? (
              <Skeleton h={120} r={14} />
            ) : !sum.matches ? (
              <Empty>{t('dash.noMatches')}</Empty>
            ) : (
              <>
                <dl className="dash-tiles">
                  <div>
                    <dt>{t('stat.matches')}</dt>
                    <dd className="num">{fmtInt(sum.matches)}</dd>
                  </div>
                  <div>
                    <dt>{t('stat.winRate')}</dt>
                    <dd>
                      <WinRate value={sum.wr} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t('stat.kda')}</dt>
                    <dd className="num">{fmtNum(sum.kda, 2)}</dd>
                  </div>
                  <div>
                    <dt>{t('dash.soulsMin')}</dt>
                    <dd className="num souls">{fmtInt(sum.soulsMin)}</dd>
                  </div>
                  <div>
                    <dt>{t('dash.heroesPlayed')}</dt>
                    <dd className="num">{sum.heroes}</dd>
                  </div>
                </dl>

                <p className="muted section-sub dash-rank-note">
                  {rankName ? t('dash.rankNote', { rank: rankName }) : t('dash.rankNoteAll')}
                </p>
                <div className="dash-sw-grid">
                  <StrongWeak title={t('dash.strong')} rows={strong} tone="up" />
                  <StrongWeak title={t('dash.weak')} rows={weak} tone="down" />
                </div>
                <HeroRankTable rows={rows} />
              </>
            )}

            <Favorites mine={byHero} />

            {recent.length > 0 && (
              <section className="item-section">
                <MatchList matches={recent} title={t('dash.recent')} analysis />
                <p className="muted small-note">{t('dash.analysisHint')}</p>
              </section>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
