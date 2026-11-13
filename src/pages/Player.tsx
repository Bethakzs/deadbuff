import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { HeroAvatar, HeroChip } from '../components/HeroChip';
import { Empty, ErrorState, Page, Panel, Skeleton } from '../components/UI';
import { WinRate } from '../components/WinRate';
import { useHeroes } from '../hooks/useAssets';
import { useMateStats, useMatchHistory, usePlayerHeroStats, usePlayerRank } from '../hooks/usePlayer';
import { useSteamProfiles } from '../hooks/useStats';
import { useT } from '../i18n';
import { fmtCompact, fmtNum, fmtTime } from '../lib/format';
import { heroRgb } from '../lib/heroes';
import { useAuth } from '../lib/auth';
import { setMe, useMe } from '../lib/me';
import { useDocumentMeta } from '../lib/seo';
import type { PlayerMatch } from '../lib/types';
import { RankEmblem } from './Players';

/** Deadlock "normal" matchmaking games only — street brawl etc. would skew the numbers. */
const NORMAL_MODE = 1;

/** Normal-mode matches, newest first (also used by the matches page for "my recent matches"). */
export const normalMatches = (list: PlayerMatch[] = []) =>
  [...list].filter((m) => m.game_mode === NORMAL_MODE).sort((a, b) => b.start_time - a.start_time);
const RECENT = 20;
const STEP = 20;

const won = (m: PlayerMatch) => m.match_result === m.player_team;

function RecentForm({ matches }: { matches: PlayerMatch[] }) {
  const { t } = useT();
  const recent = matches.slice(0, RECENT);
  if (!recent.length) return null;
  const wins = recent.filter(won).length;
  const sum = (f: (m: PlayerMatch) => number) => recent.reduce((a, m) => a + f(m), 0);
  const k = sum((m) => m.player_kills) / recent.length;
  const d = sum((m) => m.player_deaths) / recent.length;
  const a = sum((m) => m.player_assists) / recent.length;
  return (
    <Panel title={t('player.recent')} right={<span className="muted small">{t('player.recentSub', { n: recent.length })}</span>}>
      <div className="form-strip" aria-hidden>
        {[...recent].reverse().map((m, i) => (
          <motion.i
            key={m.match_id}
            className={won(m) ? 'is-win' : 'is-loss'}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.02 }}
          />
        ))}
      </div>
      <dl className="form-stats">
        <div>
          <dt>{t('stat.winRate')}</dt>
          <dd>
            <WinRate value={wins / recent.length} />
          </dd>
        </div>
        <div>
          <dt>{t('stat.kda')}</dt>
          <dd className="num">{fmtNum((k + a) / Math.max(d, 0.01), 2)}</dd>
        </div>
        <div>
          <dt>K / D / A</dt>
          <dd className="num">
            {fmtNum(k)} / {fmtNum(d)} / {fmtNum(a)}
          </dd>
        </div>
        <div>
          <dt>{t('stat.souls')}</dt>
          <dd className="num">{fmtCompact(sum((m) => m.net_worth) / recent.length)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

/** Match history; every row opens the match page. */
export function MatchList({ matches, title, analysis }: { matches: PlayerMatch[]; title?: string; /** rows open the match on its Analysis tab */ analysis?: boolean }) {
  const { t, ago } = useT();
  const heroes = useHeroes();
  const [visible, setVisible] = useState(STEP);
  return (
    <section>
      <h2 className="display player-section-title">{title ?? t('player.matches')}</h2>
      <ol className="match-list">
        {matches.slice(0, visible).map((m, i) => {
          const hero = heroes.byId.get(m.hero_id);
          return (
            <motion.li key={m.match_id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min((i % STEP) * 0.02, 0.3) }}>
              <Link to={`/matches/${m.match_id}${analysis ? '?tab=analysis' : ''}`} className={`match-row ${won(m) ? 'is-win' : 'is-loss'}`} title={t('match.open')}>
                <span className="match-row__result">{won(m) ? t('player.win') : t('player.loss')}</span>
                {hero ? (
                  <span className="match-row__hero" style={{ ['--hero' as string]: heroRgb(hero) }}>
                    <HeroAvatar hero={hero} size={34} />
                    <span className="match-row__hero-name">{hero.name}</span>
                  </span>
                ) : (
                  <span className="muted">#{m.hero_id}</span>
                )}
                <span className="match-row__kda num">
                  {m.player_kills} / {m.player_deaths} / {m.player_assists}
                </span>
                <span className="match-row__souls souls num">{fmtCompact(m.net_worth)}</span>
                <span className="match-row__time num muted" title={t('player.duration')}>
                  {fmtTime(m.match_duration_s)}
                </span>
                <span className="match-row__ago muted">
                  {ago(m.start_time)} <span className="match-row__go">→</span>
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ol>
      {visible < matches.length && (
        <div className="load-more">
          <button className="btn btn--ghost" onClick={() => setVisible((v) => v + STEP)}>
            {t('player.showMore')}
          </button>
        </div>
      )}
    </section>
  );
}

function HeroTable({ accountId }: { accountId: number }) {
  const { t, ago } = useT();
  const heroes = useHeroes();
  const q = usePlayerHeroStats(accountId);
  const rows = useMemo(() => [...(q.data ?? [])].filter((r) => r.matches_played > 0).sort((a, b) => b.matches_played - a.matches_played), [q.data]);
  return (
    <Panel title={t('player.heroes')}>
      {q.error ? (
        <ErrorState error={q.error} />
      ) : q.isLoading ? (
        <Skeleton h={240} />
      ) : !rows.length ? (
        <Empty>{t('player.empty')}</Empty>
      ) : (
        <table className="data-table player-heroes">
          <thead>
            <tr>
              <th>{t('stat.hero')}</th>
              <th>{t('stat.matches')}</th>
              <th>{t('stat.winRate')}</th>
              <th className="hide-sm">{t('stat.kda')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => {
              const hero = heroes.byId.get(r.hero_id);
              return (
                <tr key={r.hero_id}>
                  <td title={`${t('player.lastPlayed')}: ${ago(r.last_played)}`}>{hero ? <HeroChip hero={hero} size={30} /> : `#${r.hero_id}`}</td>
                  <td className="num">{r.matches_played}</td>
                  <td>
                    <WinRate value={r.wins / r.matches_played} />
                  </td>
                  <td className="hide-sm num">{fmtNum((r.kills + r.assists) / Math.max(r.deaths, 1), 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Mates({ accountId }: { accountId: number }) {
  const { t } = useT();
  const q = useMateStats(accountId);
  const top = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.matches_played - a.matches_played).slice(0, 6), [q.data]);
  const profiles = useSteamProfiles(useMemo(() => top.map((m) => m.mate_id), [top]));
  if (q.isLoading) return <Skeleton h={200} r={12} />;
  if (!top.length) return null;
  return (
    <Panel title={t('player.mates')}>
      <ul className="mates">
        {top.map((m) => {
          const p = profiles.get(m.mate_id);
          return (
            <li key={m.mate_id}>
              <Link to={`/players/${m.mate_id}`} className="mate">
                {p?.avatar ? <img src={p.avatar} alt="" /> : <span className="mate__avatar" />}
                <span className="mate__name">{p?.personaname ?? `#${m.mate_id}`}</span>
                <span className="mate__vals">
                  <WinRate value={m.wins / m.matches_played} />
                  <small className="muted num">{m.matches_played}</small>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function PlayerPage() {
  const { accountId: raw = '' } = useParams();
  const { t } = useT();
  const accountId = Number(raw);
  const valid = Number.isInteger(accountId) && accountId > 0 && accountId < 2 ** 32;
  const me = useMe();
  const { user } = useAuth();
  const profile = useSteamProfiles(valid ? [accountId] : []).get(accountId);
  const rank = usePlayerRank(accountId);
  const history = useMatchHistory(accountId);
  const heroes = useHeroes();
  const matches = useMemo(() => normalMatches(history.data), [history.data]);
  const name = profile?.personaname ?? `#${accountId}`;
  const mainHero = heroes.byId.get(matches[0]?.hero_id ?? -1);

  useDocumentMeta(t('meta.player', { name }), t('meta.desc.players'));

  if (!valid) {
    return (
      <Page>
        <div className="container">
          <Empty>{t('player.invalid')}</Empty>
        </div>
      </Page>
    );
  }

  return (
    <Page className="player-page">
      <div className="container">
        <header className="player-head">
          {profile?.avatarfull || profile?.avatarmedium ? (
            <img className="player-head__avatar" src={profile.avatarfull ?? profile.avatarmedium} alt="" />
          ) : mainHero ? (
            <HeroAvatar hero={mainHero} size={96} />
          ) : (
            <span className="player-head__avatar is-empty" />
          )}
          <div className="player-head__info">
            <span className="eyebrow">{me === accountId ? t('player.isMe') : `#${accountId}`}</span>
            <h1 className="display player-head__name">{name}</h1>
            <div className="player-head__meta">
              {rank.data?.badge ? (
                <span className="player-head__rank">
                  <RankEmblem badge={rank.data.badge} size={34} />
                </span>
              ) : (
                <span className="chip chip--ghost">{t('player.unranked')}</span>
              )}
              {/* with a linked Steam account "me" comes from the login — no manual marking */}
              {user?.accountId ? null : me === accountId ? (
                <button className="btn btn--ghost" onClick={() => setMe(null)}>
                  {t('player.notMe')}
                </button>
              ) : (
                <button className="btn btn--brass" onClick={() => setMe(accountId)}>
                  {t('player.itsMe')}
                </button>
              )}
              {me && me !== accountId && (
                <Link className="btn btn--ghost" to={`/compare?a=${me}&b=${accountId}`}>
                  {t('cmp.withMe')}
                </Link>
              )}
              {profile?.profileurl && (
                <a className="link-more" href={profile.profileurl} target="_blank" rel="noreferrer">
                  {t('player.steam')}
                </a>
              )}
            </div>
          </div>
        </header>

        <div className="player-grid">
          <div className="player-grid__main">
            {history.error ? (
              <ErrorState error={history.error} onRetry={() => history.refetch()} />
            ) : history.isLoading ? (
              <Skeleton h={420} r={12} />
            ) : !matches.length ? (
              <Empty>{t('player.empty')}</Empty>
            ) : (
              <>
                <RecentForm matches={matches} />
                <MatchList matches={matches} />
              </>
            )}
            <p className="muted small-note">
              {t('player.dataNote')} ·{' '}
              <a className="link-more" href="https://deadlock-api.com" target="_blank" rel="noreferrer">
                {t('player.howTo')}
              </a>
            </p>
          </div>
          <aside className="player-grid__side">
            <HeroTable accountId={accountId} />
            <Mates accountId={accountId} />
          </aside>
        </div>
      </div>
    </Page>
  );
}

/** /me → the profile marked with "It's me", or the player search. */
export function MeRedirect() {
  const me = useMe();
  return <Navigate to={me ? `/players/${me}` : '/players'} replace />;
}
