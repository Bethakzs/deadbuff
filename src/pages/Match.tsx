import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HeroAvatar } from '../components/HeroChip';
import { ItemIcon } from '../components/ItemIcon';
import { Empty, ErrorState, Page, Panel, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { useHeroes, useItems, useLanes, useRanks } from '../hooks/useAssets';
import { useMatch } from '../hooks/usePlayer';
import { useSteamProfiles } from '../hooks/useStats';
import { useT, type MsgKey } from '../i18n';
import { ApiError } from '../lib/api';
import { fmtCompact, fmtDate, fmtInt, fmtPct, fmtTime } from '../lib/format';
import { isShopItem } from '../lib/items';
import { finalStat, killMatrix, laneResults, LANE_END_S, objectiveEvents, soulLead, statAt, teamTotals, type LaneResult } from '../lib/match';
import { useMe } from '../lib/me';
import { useDocumentMeta } from '../lib/seo';
import type { Item, MatchInfo, MatchPlayer, SteamProfile } from '../lib/types';

const TEAM_KEYS: MsgKey[] = ['match.team0', 'match.team1'];
const TABS = ['scoreboard', 'stats', 'lanes', 'timeline'] as const;
type Tab = (typeof TABS)[number];

/** Shop purchases in buy order (ability unlocks / upgrades are filtered out). */
const purchases = (p: MatchPlayer, byId: Map<number, Item>) =>
  (p.items ?? [])
    .map((e) => ({ e, item: byId.get(e.item_id) }))
    .filter((x): x is { e: MatchPlayer['items'][number]; item: Item } => !!x.item && isShopItem(x.item))
    .sort((a, b) => a.e.game_time_s - b.e.game_time_s);

const nameOf = (p: MatchPlayer, profiles: Map<number, SteamProfile>, fallback?: string) =>
  profiles.get(p.account_id)?.personaname ?? fallback ?? (p.account_id ? `#${p.account_id}` : '');

function PlayerName({ p, profile }: { p: MatchPlayer; profile?: SteamProfile }) {
  const { t } = useT();
  if (!p.account_id) return <span className="muted">{t('match.anon')}</span>;
  return (
    <Link to={`/players/${p.account_id}`} className="match-player__name" title={profile?.personaname ?? `#${p.account_id}`}>
      {profile?.personaname ?? `#${p.account_id}`}
    </Link>
  );
}

/* ------------------------------ scoreboard ------------------------------ */

function TeamTable({ team, info, profiles }: { team: number; info: MatchInfo; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const me = useMe();
  const lanes = useLanes();
  const won = info.winning_team === team;
  const totals = teamTotals(info, team);
  const results = useMemo(() => laneResults(info), [info]);

  // rows are grouped by lane (owner's request): one tbody per lane, richest player first.
  // Anyone without a lane (odd modes) ends up in a last, unlabelled group.
  const groups = useMemo(() => {
    const mine = info.players.filter((p) => p.team === team);
    const byLane = new Map<number, MatchPlayer[]>();
    for (const p of mine) {
      const lane = results.some((r) => r.lane === (p.assigned_lane ?? 0)) ? (p.assigned_lane ?? 0) : 0;
      byLane.set(lane, [...(byLane.get(lane) ?? []), p]);
    }
    return [...byLane.entries()]
      .sort((a, b) => (a[0] || 99) - (b[0] || 99))
      .map(([lane, list]) => ({
        lane,
        res: results.find((r) => r.lane === lane),
        players: list.sort((a, b) => b.net_worth - a.net_worth),
      }));
  }, [info, team, results]);

  return (
    <section className={`match-team match-team--${team} ${won ? 'is-win' : ''}`}>
      <header className="match-team__head">
        <h2 className="display match-team__name">{t(TEAM_KEYS[team])}</h2>
        {won && <span className="match-team__win">{t('match.victory')}</span>}
        <span className="match-team__sum muted">
          <b className="num">{totals.kills}</b> {t('match.kills')} · <b className="num souls">{fmtCompact(totals.netWorth)}</b> {t('stat.souls')}
        </span>
      </header>
      <div className="table-wrap">
        <table className="data-table match-table">
          <thead>
            <tr>
              <th className="c-player">{t('match.player')}</th>
              <th className="c-lvl hide-sm">{t('match.lvl')}</th>
              <th className="c-kda">{t('stat.kda')}</th>
              <th className="c-souls">{t('stat.souls')}</th>
              <th className="c-lhdn hide-sm">{t('match.lhdn')}</th>
              <th className="c-dmg hide-sm">{t('stat.heroDmg')}</th>
              <th className="c-heal hide-md">{t('match.heal')}</th>
              <th>{t('match.items')}</th>
            </tr>
          </thead>
          {groups.map(({ lane, res, players }) => {
            const info2 = lanes.find((l) => l.id === lane);
            const outcome = !res ? undefined : res.outcome === 'draw' ? 'draw' : res.outcome === (team === 0 ? 'team0' : 'team1') ? 'won' : 'lost';
            return (
              <tbody key={lane} className="lane-group" style={info2 ? { ['--lane' as string]: info2.rgb } : undefined}>
                {res && (
                  <tr className="lane-group__head">
                    <td colSpan={8}>
                      <span className="lane-group__lane">{info2?.name ?? t('match.laneN', { n: lane })}</span>
                      <span className={`lane-group__verdict is-${outcome}`}>
                        {outcome === 'draw' ? t('match.laneDraw') : t(outcome === 'won' ? 'match.laneWonSide' : 'match.laneLostSide')}
                      </span>
                      <span className="lane-group__diff num muted">
                        {res.diff === 0
                          ? ''
                          : `${(team === 0 ? res.diff : -res.diff) > 0 ? '+' : '−'}${fmtCompact(Math.abs(res.diff))} ${t('match.at10')}`}
                      </span>
                    </td>
                  </tr>
                )}
                {players.map((p) => {
                  const hero = heroes.byId.get(p.hero_id);
                  const final = purchases(p, items.byId).filter((x) => !x.e.sold_time_s);
                  const st = finalStat(p);
                  return (
                    <tr key={p.player_slot} className={p.account_id === me ? 'is-me' : ''}>
                  <td>
                    <div className="match-player">
                      {hero ? (
                        <Link to={`/heroes/${hero.slug}`} title={hero.name}>
                          <HeroAvatar hero={hero} size={34} />
                        </Link>
                      ) : null}
                      <div className="match-player__text">
                        <PlayerName p={p} profile={profiles.get(p.account_id)} />
                        {p.account_id === me && <span className="is-me-tag">{t('player.isMe')}</span>}
                        <span className="match-player__hero muted">{hero?.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="hide-sm num muted" data-label={t('match.lvl')}>
                    {p.level}
                  </td>
                  <td className="num" data-label={t('stat.kda')}>
                    {p.kills} / {p.deaths} / {p.assists}
                  </td>
                  <td className="num" data-label={t('stat.souls')}>
                    <span className="souls">{fmtCompact(p.net_worth)}</span>
                  </td>
                  <td className="hide-sm num muted" data-label={t('match.lhdn')}>
                    {p.last_hits} / {p.denies}
                  </td>
                  <td className="hide-sm num" data-label={t('stat.heroDmg')}>
                    {fmtCompact(st?.player_damage ?? 0)}
                  </td>
                  <td className="hide-md num muted" data-label={t('match.heal')}>
                    {fmtCompact(st?.player_healing ?? 0)}
                  </td>
                      <td>
                        <div className="match-items">
                          {final.map(({ e, item }) => (
                            <ItemIcon key={`${e.item_id}-${e.game_time_s}`} item={item} size="sm" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}

/* -------------------------------- stats -------------------------------- */

/** One metric for both teams, as a single bar split where the two totals meet. */
function CompareRow({ label, a, b, format }: { label: string; a: number; b: number; format: (n: number) => string }) {
  const total = a + b || 1;
  const share = (a / total) * 100;
  return (
    <div className="compare">
      <div className="compare__nums num">
        <b className={a >= b ? 'is-lead' : ''}>{format(a)}</b>
        <span className="compare__label">{label}</span>
        <b className={b >= a ? 'is-lead' : ''}>{format(b)}</b>
      </div>
      <div className="compare__bar" aria-hidden>
        <motion.span
          className="compare__fill compare__fill--0"
          initial={{ width: 0 }}
          animate={{ width: `${share}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.span
          className="compare__fill compare__fill--1"
          initial={{ width: 0 }}
          animate={{ width: `${100 - share}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

/** Every player of both teams ranked by one stat. */
function StatRanking({
  title,
  players,
  value,
  format,
  profiles,
}: {
  title: string;
  players: MatchPlayer[];
  value: (p: MatchPlayer) => number;
  format: (n: number) => string;
  profiles: Map<number, SteamProfile>;
}) {
  const heroes = useHeroes();
  const me = useMe();
  const rows = players.map((p) => ({ p, v: value(p) })).sort((x, y) => y.v - x.v);
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <Panel title={title} className="rank-panel">
      <ol className="rank-list">
        {rows.map(({ p, v }, i) => {
          const hero = heroes.byId.get(p.hero_id);
          return (
            <li key={p.player_slot} className={`rank-row rank-row--${p.team} ${p.account_id === me ? 'is-me' : ''}`}>
              <span className="rank-row__n num muted">{i + 1}</span>
              {hero && <HeroAvatar hero={hero} size={26} />}
              <span className="rank-row__name">{nameOf(p, profiles, hero?.name)}</span>
              <span className="rank-row__bar" aria-hidden>
                <motion.i
                  initial={{ width: 0 }}
                  animate={{ width: `${(v / max) * 100}%` }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <span className="rank-row__v num">{format(v)}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/** Who killed whom: one row per player, with the heroes they killed and how often. */
function KillMatrix({ info, profiles }: { info: MatchInfo; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const heroes = useHeroes();
  const me = useMe();
  const rows = useMemo(() => killMatrix(info), [info]);
  if (!rows.length) return null;
  const bySlot = new Map(info.players.map((p) => [p.player_slot, p]));

  return (
    <section className="item-section">
      <SectionTitle title={t('match.kills')} />
      <p className="muted section-sub">{t('match.killsSub')}</p>
      <div className="kill-grid">
        {rows.map(({ killer, victims, total }) => {
          const hero = heroes.byId.get(killer.hero_id);
          return (
            <div key={killer.player_slot} className={`kill-row kill-row--${killer.team} ${killer.account_id === me ? 'is-me' : ''}`}>
              <div className="kill-row__who">
                {hero && <HeroAvatar hero={hero} size={30} />}
                <span className="kill-row__name" title={nameOf(killer, profiles, hero?.name)}>
                  {nameOf(killer, profiles, hero?.name)}
                </span>
                <span className="kill-row__total num">{total}</span>
              </div>
              <ul className="kill-row__victims">
                {victims.map(({ slot, n }) => {
                  const victim = bySlot.get(slot);
                  const vHero = victim && heroes.byId.get(victim.hero_id);
                  return (
                    <li key={slot} title={`${vHero?.name ?? ''} · ${victim ? nameOf(victim, profiles) : ''}`}>
                      {vHero ? <HeroAvatar hero={vHero} size={24} /> : <span className="kill-row__unknown" />}
                      <span className="num">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatsTab({ info, profiles }: { info: MatchInfo; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const a = teamTotals(info, 0);
  const b = teamTotals(info, 1);
  const dmg = (p: MatchPlayer) => finalStat(p)?.player_damage ?? 0;
  const heal = (p: MatchPlayer) => finalStat(p)?.player_healing ?? 0;
  const taken = (p: MatchPlayer) => finalStat(p)?.player_damage_taken ?? 0;

  return (
    <>
      <Panel className="compare-panel">
        <div className="compare-panel__head">
          <span className="compare-panel__team compare-panel__team--0 display">{t('match.team0')}</span>
          <span className="compare-panel__team compare-panel__team--1 display">{t('match.team1')}</span>
        </div>
        <CompareRow label={t('match.kills')} a={a.kills} b={b.kills} format={fmtInt} />
        <CompareRow label={t('match.assists')} a={a.assists} b={b.assists} format={fmtInt} />
        <CompareRow label={t('stat.souls')} a={a.netWorth} b={b.netWorth} format={fmtCompact} />
        <CompareRow label={t('stat.heroDmg')} a={a.damage} b={b.damage} format={fmtCompact} />
        <CompareRow label={t('match.dmgTaken')} a={a.damageTaken} b={b.damageTaken} format={fmtCompact} />
        <CompareRow label={t('match.heal')} a={a.healing} b={b.healing} format={fmtCompact} />
        <CompareRow label={t('match.bossDmg')} a={a.bossDamage} b={b.bossDamage} format={fmtCompact} />
        <CompareRow label={t('match.lastHits')} a={a.lastHits} b={b.lastHits} format={fmtInt} />
        <CompareRow label={t('match.denies')} a={a.denies} b={b.denies} format={fmtInt} />
        <CompareRow label={t('match.accuracy')} a={a.accuracy} b={b.accuracy} format={(n) => fmtPct(n)} />
        <CompareRow label={t('match.objectivesLost')} a={a.objectivesLost} b={b.objectivesLost} format={fmtInt} />
      </Panel>

      <div className="rank-grid">
        <StatRanking title={t('stat.heroDmg')} players={info.players} value={dmg} format={fmtCompact} profiles={profiles} />
        <StatRanking title={t('match.heal')} players={info.players} value={heal} format={fmtCompact} profiles={profiles} />
        <StatRanking title={t('match.dmgTaken')} players={info.players} value={taken} format={fmtCompact} profiles={profiles} />
        <StatRanking title={t('stat.souls')} players={info.players} value={(p) => p.net_worth} format={fmtCompact} profiles={profiles} />
      </div>

      <KillMatrix info={info} profiles={profiles} />
    </>
  );
}

/* -------------------------------- lanes -------------------------------- */

function LaneCard({ res, profiles }: { res: LaneResult; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const heroes = useHeroes();
  const lanes = useLanes();
  const me = useMe();
  const lane = lanes.find((l) => l.id === res.lane);

  /** won / lost / even, written above each duo so it reads without comparing numbers */
  const verdict = (i: 0 | 1) => {
    if (res.outcome === 'draw') return { key: 'match.laneDraw' as MsgKey, state: 'draw' };
    const won = res.outcome === (i === 0 ? 'team0' : 'team1');
    return { key: (won ? 'match.laneWonSide' : 'match.laneLostSide') as MsgKey, state: won ? 'won' : 'lost' };
  };

  const side = (i: 0 | 1) => {
    const v = verdict(i);
    return (
      <div className={`lane-card__side lane-card__side--${i}`}>
        <span className={`lane-card__verdict is-${v.state}`}>{t(v.key)}</span>
        <span className="lane-card__team muted">{t(TEAM_KEYS[i])}</span>
        {res.sides[i].map((p) => {
          const hero = heroes.byId.get(p.hero_id);
          return (
            <div key={p.player_slot} className={`lane-card__player ${p.account_id === me ? 'is-me' : ''}`}>
              {hero && <HeroAvatar hero={hero} size={30} />}
              <span className="lane-card__name" title={nameOf(p, profiles, hero?.name)}>
                {nameOf(p, profiles, hero?.name)}
              </span>
              <span className="num souls">{fmtCompact(statAt(p, LANE_END_S)?.net_worth ?? 0)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Panel className={`lane-card is-${res.outcome}`} style={lane ? { ['--lane' as string]: lane.rgb } : undefined}>
      <div className="lane-card__sides">
        {side(0)}
        <div className="lane-card__middle">
          <span className="lane-card__lane display">{lane?.name ?? t('match.laneN', { n: res.lane })}</span>
          <b className={`num lane-card__diff is-${res.outcome}`}>
            {res.diff === 0 ? '—' : `${res.diff > 0 ? '+' : '−'}${fmtCompact(Math.abs(res.diff))}`}
          </b>
          <small className="muted">{t('match.at10')}</small>
        </div>
        {side(1)}
      </div>
    </Panel>
  );
}

function LanesTab({ info, profiles }: { info: MatchInfo; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const lanes = useMemo(() => laneResults(info), [info]);
  if (!lanes.length) return <Empty>{t('match.noLanes')}</Empty>;
  return (
    <>
      <p className="muted section-sub">{t('match.lanesSub')}</p>
      <div className="lane-grid">
        {lanes.map((res) => (
          <LaneCard key={res.lane} res={res} profiles={profiles} />
        ))}
      </div>
    </>
  );
}

/* ------------------------------- timeline ------------------------------- */

/** Team 0 souls minus team 1 souls at every stat snapshot. */
function SoulLead({ info }: { info: MatchInfo }) {
  const { t } = useT();
  const points = useMemo(() => soulLead(info), [info]);
  if (points.length < 3) return null;

  const W = 800;
  const H = 180;
  const maxT = points.at(-1)![0] || 1;
  const maxV = Math.max(1000, ...points.map(([, v]) => Math.abs(v)));
  const x = (s: number) => (s / maxT) * W;
  const y = (v: number) => H / 2 - (v / maxV) * (H / 2 - 8);
  const line = points.map(([s, v]) => `${x(s).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `0,${H / 2} ${line} ${W},${H / 2}`;
  const final = points.at(-1)![1];

  return (
    <section className="item-section">
      <SectionTitle title={t('match.soulLead')} />
      <p className="muted section-sub">{t('match.soulLeadSub')}</p>
      <Panel className="soul-lead">
        <div className="soul-lead__labels">
          <span className="soul-lead__team soul-lead__team--0">{t('match.team0')}</span>
          <span className="soul-lead__team soul-lead__team--1">{t('match.team1')}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="soul-lead__svg" role="img" aria-label={t('match.soulLead')}>
          <defs>
            <clipPath id="lead-top">
              <rect x="0" y="0" width={W} height={H / 2} />
            </clipPath>
            <clipPath id="lead-bottom">
              <rect x="0" y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="soul-lead__axis" />
          <polygon points={area} className="soul-lead__area soul-lead__area--0" clipPath="url(#lead-top)" />
          <polygon points={area} className="soul-lead__area soul-lead__area--1" clipPath="url(#lead-bottom)" />
          <polyline points={line} className="soul-lead__line" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="soul-lead__foot num muted">
          <span>0:00</span>
          <span className={`soul-lead__final soul-lead__final--${final >= 0 ? 0 : 1}`}>
            {final >= 0 ? '+' : '−'}
            {fmtCompact(Math.abs(final))}
          </span>
          <span>{fmtTime(maxT)}</span>
        </div>
      </Panel>
    </section>
  );
}

/** When each team lost its structures, plus the mid boss, on one time axis. */
function Objectives({ info }: { info: MatchInfo }) {
  const { t } = useT();
  const events = useMemo(() => objectiveEvents(info), [info]);
  const boss = (info.mid_boss ?? []).filter((b) => b.destroyed_time_s > 0);
  if (!events.length && !boss.length) return null;
  const end = info.duration_s || 1;

  return (
    <section className="item-section">
      <SectionTitle title={t('match.objectives')} />
      <p className="muted section-sub">{t('match.objectivesSub')}</p>
      <Panel className="obj-line">
        {[0, 1].map((team) => {
          const own = events.filter((o) => o.team === team);
          return (
            <div key={team} className={`obj-line__row obj-line__row--${team}`}>
              <span className="obj-line__team">{t(TEAM_KEYS[team])}</span>
              <span className="obj-line__track">
                {own.map((o) => (
                  <motion.i
                    key={`${o.team_objective_id}-${o.destroyed_time_s}`}
                    className={o.isPatron ? 'is-patron' : ''}
                    style={{ left: `${Math.min(100, (o.destroyed_time_s / end) * 100)}%` }}
                    title={`${o.isPatron ? t('match.patron') : t('match.structure')} · ${fmtTime(o.destroyed_time_s)}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                ))}
              </span>
              <span className="obj-line__n num muted">{own.length}</span>
            </div>
          );
        })}
        {boss.length > 0 && (
          <p className="muted small-note">
            {t('match.midBoss')}: {boss.map((b) => `${t(TEAM_KEYS[b.team_claimed === 0 ? 0 : 1])} · ${fmtTime(b.destroyed_time_s)}`).join(' · ')}
          </p>
        )}
        <div className="obj-line__axis num muted">
          <span>0:00</span>
          <span>{fmtTime(end)}</span>
        </div>
      </Panel>
    </section>
  );
}

/** Every purchase of every player in order, with its minute. */
function Timeline({ info, profiles }: { info: MatchInfo; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const players = [...info.players].sort((a, b) => a.team - b.team || b.net_worth - a.net_worth);
  return (
    <section className="item-section">
      <SectionTitle title={t('match.timeline')} />
      <p className="muted section-sub">{t('match.timelineSub')}</p>
      <div className="timeline">
        {players.map((p, i) => {
          const hero = heroes.byId.get(p.hero_id);
          return (
            <motion.div
              key={p.player_slot}
              className={`timeline__row timeline__row--${p.team}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <div className="timeline__who">
                {hero && <HeroAvatar hero={hero} size={30} />}
                <span className="timeline__name">{nameOf(p, profiles, hero?.name)}</span>
              </div>
              <ol className="timeline__items">
                {purchases(p, items.byId).map(({ e, item }) => (
                  <li key={`${e.item_id}-${e.game_time_s}`} className={e.sold_time_s ? 'is-sold' : ''}>
                    <ItemIcon item={item} size="sm" />
                    <span className="num">{Math.floor(e.game_time_s / 60)}′</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------- page --------------------------------- */

export function MatchPage() {
  const { matchId = '' } = useParams();
  const id = Number(matchId);
  const { t, ago } = useT();
  const [tab, setTab] = useState<Tab>('scoreboard');
  const q = useMatch(id);
  const ranks = useRanks();
  const info = q.data?.match_info;
  const profiles = useSteamProfiles(useMemo(() => (info?.players ?? []).map((p) => p.account_id).filter(Boolean), [info]));
  useDocumentMeta(t('meta.match', { id: matchId }), t('meta.desc.match', { id: matchId }));

  const rankName = (badge?: number) => {
    if (!badge) return null;
    const r = ranks.data?.find((x) => x.tier === Math.floor(badge / 10));
    return r ? `${r.name} ${badge % 10 || ''}`.trim() : null;
  };
  const avgRank = info ? rankName(Math.round(((info.average_badge_team0 ?? 0) + (info.average_badge_team1 ?? 0)) / 2) || undefined) : null;
  const notFound = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 400);

  return (
    <Page>
      <div className="container match-page">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('match.eyebrow', { id: matchId })}</span>
            {info ? (
              <h1 className="display page-head__title match-title">
                <span className={`match-title__team match-title__team--0 ${info.winning_team === 0 ? 'is-win' : ''}`}>{t('match.team0')}</span>
                <span className="match-title__vs">vs</span>
                <span className={`match-title__team match-title__team--1 ${info.winning_team === 1 ? 'is-win' : ''}`}>{t('match.team1')}</span>
              </h1>
            ) : (
              <h1 className="display page-head__title">#{matchId}</h1>
            )}
            {info && (
              <p className="page-head__sub muted match-meta">
                <span>
                  {t('player.duration')} <b className="num">{fmtTime(info.duration_s)}</b>
                </span>
                <span title={fmtDate(info.start_time)}>{ago(info.start_time)}</span>
                {avgRank && (
                  <span>
                    {t('match.avgRank')} <b>{avgRank}</b>
                  </span>
                )}
              </p>
            )}
          </div>
        </header>

        {!Number.isInteger(id) || id <= 0 ? (
          <Empty>{t('match.notFound')}</Empty>
        ) : q.isLoading ? (
          <div className="match-teams">
            <Skeleton h={320} r={14} />
            <Skeleton h={320} r={14} />
          </div>
        ) : notFound ? (
          <Empty>{t('match.notFound')}</Empty>
        ) : q.error || !info ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <>
            <div className="toolbar match-tabs">
              <Segmented
                id="match-tab"
                value={tab}
                onChange={setTab}
                options={TABS.map((key) => ({ value: key, label: t(`match.tab.${key}` as MsgKey) }))}
              />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab === 'scoreboard' && (
                  <div className="match-teams">
                    <TeamTable team={0} info={info} profiles={profiles} />
                    <TeamTable team={1} info={info} profiles={profiles} />
                  </div>
                )}
                {tab === 'stats' && <StatsTab info={info} profiles={profiles} />}
                {tab === 'lanes' && <LanesTab info={info} profiles={profiles} />}
                {tab === 'timeline' && (
                  <>
                    <SoulLead info={info} />
                    <Objectives info={info} />
                    <Timeline info={info} profiles={profiles} />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </Page>
  );
}
