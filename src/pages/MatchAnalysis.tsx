import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeroAvatar } from '../components/HeroChip';
import { ItemIcon } from '../components/ItemIcon';
import { Empty, ErrorState, Panel, SectionTitle, Skeleton } from '../components/UI';
import { useHeroes, useItems } from '../hooks/useAssets';
import { TOP_BADGE, useHeroStatsAtRank, useTopItemStats } from '../hooks/useStats';
import { useT } from '../i18n';
import { fmtPct, fmtTime } from '../lib/format';
import { isShopItem } from '../lib/items';
import { purchases } from '../lib/match';
import { useMe } from '../lib/me';
import type { Item, MatchInfo, MatchPlayer, SteamProfile } from '../lib/types';
import { useRankName } from './Dashboard';

/** Within a minute of the top players counts as "on time". */
const ON_TIME_S = 60;
/** Items at least this share of top players buy are "core" — listed when you skipped them. */
const CORE_SHARE = 0.35;

type Tone = 'early' | 'even' | 'late' | 'very-late';
const toneOf = (diff: number): Tone => (diff < -ON_TIME_S ? 'early' : diff <= ON_TIME_S ? 'even' : diff <= 180 ? 'late' : 'very-late');

const signedTime = (s: number) => `${s < 0 ? '−' : '+'}${fmtTime(Math.abs(s))}`;

interface Row {
  item: Item;
  you: number;
  top?: number;
  diff?: number;
  sold: boolean;
}

/**
 * Match → "Analysis" tab: one player's purchases with their minute next to the average minute
 * Ascendant+ players on the same hero buy that item (last 30 days), plus core items they skipped.
 */
export function AnalysisTab({ info, profiles }: { info: MatchInfo; profiles: Map<number, SteamProfile> }) {
  const { t } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const me = useMe();
  const initial = info.players.find((p) => me && p.account_id === me) ?? [...info.players].sort((a, b) => b.net_worth - a.net_worth)[0];
  const [slot, setSlot] = useState(initial?.player_slot);
  const player = info.players.find((p) => p.player_slot === slot) ?? initial;
  const hero = player ? heroes.byId.get(player.hero_id) : undefined;
  const top = useTopItemStats(player?.hero_id);
  const topHero = useHeroStatsAtRank(TOP_BADGE, true);
  const topRank = useRankName(TOP_BADGE);

  const { rows, missed, summary } = useMemo(() => {
    if (!player) return { rows: [] as Row[], missed: [], summary: null };
    const topMap = new Map((top.data ?? []).map((s) => [s.item_id, s]));
    const bought = purchases(player, items.byId);
    const rows: Row[] = bought.map(({ e, item }) => {
      const avg = topMap.get(item.id)?.avg_buy_time_s;
      return { item, you: e.game_time_s, top: avg, diff: avg === undefined ? undefined : e.game_time_s - avg, sold: !!e.sold_time_s };
    });
    const heroGames = topHero.data?.find((h) => h.hero_id === player.hero_id)?.matches ?? Math.max(1, ...(top.data ?? []).map((s) => s.matches));
    const have = new Set(bought.map((b) => b.item.id));
    const missed = (top.data ?? [])
      .map((s) => ({ s, item: items.byId.get(s.item_id), share: s.matches / heroGames }))
      .filter((x): x is { s: typeof x.s; item: Item; share: number } => !!x.item && isShopItem(x.item) && !have.has(x.item.id) && x.share >= CORE_SHARE)
      // only what top players have bought by the time this match ended
      .filter((x) => (x.s.avg_buy_time_s ?? 0) <= info.duration_s)
      .sort((a, b) => b.share - a.share)
      .slice(0, 8);
    const timed = rows.filter((r) => r.diff !== undefined);
    const diffs = timed.map((r) => r.diff!).sort((a, b) => a - b);
    const summary = diffs.length
      ? {
          median: diffs[Math.floor(diffs.length / 2)],
          early: timed.filter((r) => toneOf(r.diff!) === 'early').length,
          even: timed.filter((r) => toneOf(r.diff!) === 'even').length,
          late: timed.filter((r) => toneOf(r.diff!) === 'late' || toneOf(r.diff!) === 'very-late').length,
        }
      : null;
    return { rows, missed, summary };
  }, [player, top.data, topHero.data, items.byId, info.duration_s]);

  if (!player) return <Empty>{t('ma.noPlayers')}</Empty>;
  const maxT = Math.max(info.duration_s, ...rows.map((r) => Math.max(r.you, r.top ?? 0)), 60);
  const name = profiles.get(player.account_id)?.personaname ?? hero?.name ?? '';

  return (
    <>
      <div className="ma-pick" role="tablist" aria-label={t('ma.pickPlayer')}>
        {[0, 1].map((team) => (
          <div key={team} className={`ma-pick__team ma-pick__team--${team}`}>
            {info.players
              .filter((p) => p.team === team)
              .map((p: MatchPlayer) => {
                const h = heroes.byId.get(p.hero_id);
                const active = p.player_slot === player.player_slot;
                return (
                  <button
                    key={p.player_slot}
                    role="tab"
                    aria-selected={active}
                    className={`ma-pick__btn ${active ? 'is-active' : ''} ${me && p.account_id === me ? 'is-me' : ''}`}
                    title={`${profiles.get(p.account_id)?.personaname ?? ''} · ${h?.name ?? ''}`}
                    onClick={() => setSlot(p.player_slot)}
                  >
                    {h && <HeroAvatar hero={h} size={36} />}
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      <section className="item-section">
        <SectionTitle title={t('ma.title', { name, hero: hero?.name ?? '' })} />
        <p className="muted section-sub">{t('ma.sub', { rank: topRank ?? '' })}</p>

        {top.error ? (
          <ErrorState error={top.error} onRetry={() => top.refetch()} />
        ) : top.isLoading ? (
          <Skeleton h={320} r={14} />
        ) : !rows.length ? (
          <Empty>{t('ma.noItems')}</Empty>
        ) : (
          <>
            {summary && (
              <dl className="ma-summary">
                <div>
                  <dt>{t('ma.median')}</dt>
                  <dd className={`num ma-tone--${toneOf(summary.median)}`}>{Math.abs(summary.median) <= ON_TIME_S ? t('ma.onTime') : signedTime(summary.median)}</dd>
                </div>
                <div>
                  <dt>{t('ma.earlier')}</dt>
                  <dd className="num ma-tone--early">{summary.early}</dd>
                </div>
                <div>
                  <dt>{t('ma.onTimeN')}</dt>
                  <dd className="num ma-tone--even">{summary.even}</dd>
                </div>
                <div>
                  <dt>{t('ma.later')}</dt>
                  <dd className="num ma-tone--late">{summary.late}</dd>
                </div>
              </dl>
            )}

            <Panel className="ma-panel">
              <div className="ma-legend muted small">
                <span>
                  <i className="ma-dot ma-dot--you" /> {t('ma.you')}
                </span>
                <span>
                  <i className="ma-dot ma-dot--top" /> {t('ma.top')}
                </span>
              </div>
              <ol className="ma-rows">
                {rows.map((r, i) => {
                  const tone = r.diff === undefined ? 'none' : toneOf(r.diff);
                  const x1 = (Math.min(r.you, r.top ?? r.you) / maxT) * 100;
                  const x2 = (Math.max(r.you, r.top ?? r.you) / maxT) * 100;
                  return (
                    <motion.li
                      key={`${r.item.id}-${r.you}`}
                      className={`ma-row ${r.sold ? 'is-sold' : ''}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.025, 0.4) }}
                    >
                      <span className="ma-row__item">
                        <ItemIcon item={r.item} size="sm" />
                        <span className="ma-row__name">{r.item.name}</span>
                      </span>
                      <span className="ma-row__track" aria-hidden>
                        {r.top !== undefined && <i className={`ma-row__gap ma-tone-bg--${tone}`} style={{ left: `${x1}%`, width: `${Math.max(x2 - x1, 0.5)}%` }} />}
                        {r.top !== undefined && <i className="ma-dot ma-dot--top" style={{ left: `${(r.top / maxT) * 100}%` }} />}
                        <i className="ma-dot ma-dot--you" style={{ left: `${(r.you / maxT) * 100}%` }} />
                      </span>
                      <span className="ma-row__times num">
                        <b>{fmtTime(r.you)}</b>
                        <span className="muted">{r.top !== undefined ? fmtTime(r.top) : '—'}</span>
                      </span>
                      <span className={`ma-row__diff num ma-tone--${tone}`}>
                        {r.diff === undefined ? '' : Math.abs(r.diff) <= ON_TIME_S ? t('ma.onTimeShort') : signedTime(r.diff)}
                      </span>
                    </motion.li>
                  );
                })}
              </ol>
              <div className="ma-axis num muted">
                <span>0:00</span>
                <span>{fmtTime(maxT)}</span>
              </div>
            </Panel>

            {missed.length > 0 && (
              <section className="item-section">
                <SectionTitle title={t('ma.missed')} />
                <p className="muted section-sub">{t('ma.missedSub')}</p>
                <div className="ma-missed">
                  {missed.map(({ s, item, share }) => (
                    <div key={item.id} className="ma-missed__item">
                      <ItemIcon item={item} size="md" />
                      <span className="ma-missed__text">
                        <b>{item.name}</b>
                        <small className="muted">{t('ma.missedLine', { pct: fmtPct(share, 0), t: fmtTime(s.avg_buy_time_s ?? 0) })}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {hero && (
              <p className="small-note">
                <Link className="link-more" to={`/heroes/${hero.slug}/builds`}>
                  {t('ma.builds', { hero: hero.name })}
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
