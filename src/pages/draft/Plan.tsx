import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HeroAvatar } from '../../components/HeroChip';
import { ItemIcon } from '../../components/ItemIcon';
import { Empty, ErrorState, SectionTitle, Skeleton } from '../../components/UI';
import { Delta, WinRate } from '../../components/WinRate';
import { useItems } from '../../hooks/useAssets';
import { useHeroRows, useItemStats, useItemStatsBucket, useItemStatsVsEnemies } from '../../hooks/useStats';
import { useT, type MsgKey } from '../../i18n';
import { itemsVsLineup, type PickScore } from '../../lib/draft';
import { fmtDelta, fmtInt, fmtPct } from '../../lib/format';
import { heroRgb } from '../../lib/heroes';
import { isShopItem } from '../../lib/items';
import { buildPlan, itemRates, topSources, type Plan, type PlanItem, type Threat, type ThreatSource } from '../../lib/threats';
import type { Hero } from '../../lib/types';

/*
 * The item side of /draft (24.11.2026): "I play X against these enemies — what do I buy, against whom, and why".
 * Threats and answers come from lib/threats.ts; this file only fetches and draws.
 *   Match: your counter items, what to expect from the enemies, your teammates (who covers you), core items.
 *   Lane:  your lane matchup, early items (tiers 1–2) against the two lane opponents, the usual start.
 */

/** "early" for the lane: bought in the first 12 minutes on average */
const LANE_BUY_S = 12 * 60;
const SHOWN = 8;

function useDraftPlan(me: Hero, enemies: Hero[], allies: Hero[], lane: boolean) {
  const items = useItems();
  const { rows } = useHeroRows();
  const bucket = useItemStatsBucket('hero');
  const base = useItemStats(me.id);
  const enemyIds = useMemo(() => enemies.map((e) => e.id), [enemies]);
  const vs = useItemStatsVsEnemies(enemies.length ? me.id : undefined, enemyIds);

  const heroGames = useMemo(() => new Map(rows.map((r) => [r.hero.id, r.stat.matches])), [rows]);
  const rates = useMemo(() => itemRates(bucket.data ?? [], heroGames), [bucket.data, heroGames]);
  const data = useMemo(() => {
    const baseRows = (base.data ?? []).filter((s) => !lane || (s.avg_buy_time_s ?? Infinity) <= LANE_BUY_S);
    return itemsVsLineup(baseRows, vs.perEnemy, (id) => {
      const it = items.byId.get(id);
      return !!it && isShopItem(it) && (!lane || (it.item_tier ?? 9) <= 2);
    });
  }, [base.data, vs.perEnemy, items.byId, lane]);
  const plan = useMemo(
    () => buildPlan({ me, enemies, allies, byClass: items.byClass, byId: items.byId, rates, data, lane }),
    [me, enemies, allies, items.byClass, items.byId, rates, data, lane],
  );
  return {
    plan,
    base: base.data ?? [],
    loading: items.isLoading || bucket.isLoading || base.isLoading || vs.isLoading,
    error: items.error ?? bucket.error ?? base.error ?? vs.error,
  };
}

/* ------------------------------- pieces ------------------------------- */

/** One reason: an enemy's ability, an item its players usually buy, or its damage profile. */
function SourceChip({ s }: { s: ThreatSource }) {
  const { t } = useT();
  const label =
    s.kind === 'ability'
      ? s.ability!.name
      : s.kind === 'item'
        ? `${s.item!.name} · ${fmtPct(s.rate ?? 0, 0)}`
        : `${fmtPct(s.rate ?? 0, 0)} ${t(s.dmg === 'spirit' ? 'draft.src.spirit' : 'draft.src.bullet')}`;
  const title =
    s.kind === 'item'
      ? t('draft.src.buysHint', { hero: s.hero.name, item: s.item!.name, pct: fmtPct(s.rate ?? 0, 0) })
      : s.kind === 'ability'
        ? `${s.hero.name} · ${s.ability!.name}${s.ult ? ` (${t('draft.src.ult')})` : ''}`
        : t(s.dmg === 'spirit' ? 'draft.src.spiritHint' : 'draft.src.bulletHint', { hero: s.hero.name, pct: fmtPct(s.rate ?? 0, 0) });
  return (
    <span className={`src-chip src-chip--${s.kind}`} title={title}>
      <HeroAvatar hero={s.hero} size={18} />
      <span className="src-chip__text">{label}</span>
    </span>
  );
}

function PlanCard({ x, rank }: { x: PlanItem; rank: number }) {
  const { t } = useT();
  return (
    <motion.li
      className={`plan-item slot-${x.item.item_slot_type ?? 'none'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(rank * 0.03, 0.25) }}
    >
      <span className="plan-item__rank num">{String(rank + 1).padStart(2, '0')}</span>
      <ItemIcon item={x.item} size="md" />
      <div className="plan-item__body">
        <div className="plan-item__head">
          <b>{x.item.name}</b>
          {x.item.cost ? <span className="muted small num">{fmtInt(x.item.cost)}</span> : null}
          {x.data && Math.abs(x.data.score) >= 0.002 && (
            <span className="plan-item__data" title={t('draft.plan.dataHint')}>
              <Delta value={x.data.score} />
            </span>
          )}
        </div>
        <ul className="plan-item__why">
          {x.reasons.slice(0, 2).map((r) => (
            <li key={r.threat}>
              <span className="plan-item__threat">{t(`draft.threat.${r.threat}` as MsgKey)}</span>
              {topSources(r.sources, 3).map((s, i) => (
                <SourceChip key={i} s={s} />
              ))}
            </li>
          ))}
          {!x.reasons.length && <li className="muted">{t('draft.plan.dataOnly')}</li>}
        </ul>
      </div>
      {x.vs.length > 0 && (
        <span className="plan-item__vs" aria-label={t('draft.plan.vs')}>
          {x.vs.slice(0, 4).map((h) => (
            <span key={h.id} title={h.name}>
              <HeroAvatar hero={h} size={22} />
            </span>
          ))}
        </span>
      )}
    </motion.li>
  );
}

const level = (strength: number) => (strength < 0.8 ? 1 : strength < 1.8 ? 2 : 3);

function ThreatCard({ th, air }: { th: Threat; air: boolean }) {
  const { t } = useT();
  const knockdown = air && th.id === 'cc' ? th.sources.find((s) => s.item?.class_name === 'upgrade_target_stun') : undefined;
  const lv = level(th.strength);
  return (
    <li className={`threat threat--${th.id}`}>
      <div className="threat__head">
        <b>{t(`draft.threat.${th.id}` as MsgKey)}</b>
        <span className="threat__level" title={t('draft.threats.level')} aria-label={`${lv}/3`}>
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= lv ? 'is-on' : ''} />
          ))}
        </span>
      </div>
      <div className="threat__src">
        {topSources(th.sources, 8, 2).map((s, i) => (
          <SourceChip key={i} s={s} />
        ))}
      </div>
      {knockdown && <p className="threat__note small">{t('draft.air', { item: knockdown.item!.name })}</p>}
      {th.coveredBy && (
        <p className="threat__note is-covered small">
          {t('draft.covered', { ally: th.coveredBy.ally.name, item: th.coveredBy.item.name, pct: fmtPct(th.coveredBy.rate, 0) })}
        </p>
      )}
      <div className="threat__answers">
        <span className="muted small">{t('draft.threats.answer')}</span>
        {th.answers.map((a) => (
          <span key={a.item.id} className="threat__answer">
            <ItemIcon item={a.item} size="sm" />
            {a.data && Math.abs(a.data.score) >= 0.002 && <span className="small num muted">{fmtDelta(a.data.score)}</span>}
          </span>
        ))}
      </div>
    </li>
  );
}

function TeamNotes({ plan, allies, score }: { plan: Plan; allies: Hero[]; score?: PickScore }) {
  const { t } = useT();
  if (!allies.length) return null;
  return (
    <section className="item-section">
      <SectionTitle title={t('draft.team.title')} />
      <p className="muted section-sub">{t('draft.team.sub')}</p>
      <ul className="team-notes">
        {allies.map((a) => {
          const fx = score?.with.find((e) => e.hero.id === a.id);
          const notes = plan.team.filter((n) => n.ally.id === a.id);
          // the enemy ultimates are the same for every protecting ability — list them once per teammate
          const firstProtect = notes.findIndex((n) => n.kind === 'protect');
          return (
            <li key={a.id} className="team-note" style={{ ['--hero' as string]: heroRgb(a) }}>
              <Link to={`/heroes/${a.slug}`} className="team-note__hero">
                <HeroAvatar hero={a} size={40} />
                <b>{a.name}</b>
              </Link>
              {fx && fx.matches > 0 && (
                <span className="team-note__fx" title={t('draft.team.togetherHint')}>
                  <span className="muted small">{t('draft.team.together')}</span> <Delta value={fx.delta} />
                </span>
              )}
              <ul className="team-note__list">
                {notes.map((n, i) =>
                  n.kind === 'protect' ? (
                    <li key={i}>
                      <span>
                        <b className="team-note__ability">{n.ability.name}</b> — {t(n.tag === 'allyBarrier' ? 'draft.team.barrier' : 'draft.team.heal')}
                      </span>
                      {i === firstProtect && n.against.length > 0 && (
                        <span className="team-note__vs">
                          <span className="muted small">{t('draft.team.vsUlts')}</span>
                          {n.against.slice(0, 3).map((x) => (
                            <span key={x.hero.id} className="src-chip" title={`${x.hero.name} · ${x.ability.name}`}>
                              <HeroAvatar hero={x.hero} size={18} />
                              <span className="src-chip__text">{x.ability.name}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  ) : n.kind === 'saves' ? (
                    <li key={i} className="team-note__item">
                      <ItemIcon item={n.item} size="sm" />
                      <span>{t('draft.team.saves', { item: n.item.name, pct: fmtPct(n.rate, 0) })}</span>
                    </li>
                  ) : (
                    <li key={i} className="team-note__item">
                      <ItemIcon item={n.item} size="sm" />
                      <span>{t('draft.team.covers', { item: n.item.name, pct: fmtPct(n.rate, 0) })}</span>
                    </li>
                  ),
                )}
                {!notes.length && <li className="muted">{t('draft.team.plain')}</li>}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LaneSummary({ score, enemies }: { score?: PickScore; enemies: Hero[] }) {
  const { t } = useT();
  if (!score || !enemies.length) return null;
  const verdict = score.advantage > 0.01 ? 'easy' : score.advantage < -0.01 ? 'hard' : 'even';
  return (
    <section className={`lane-sum is-${verdict}`} style={{ ['--hero' as string]: heroRgb(score.hero) }}>
      <div className="lane-sum__main">
        <span className="eyebrow">{t('draft.lane.title')}</span>
        <b className="display lane-sum__verdict">{t(`draft.lane.${verdict}` as MsgKey)}</b>
        <span className="small muted">
          {t('draft.lane.expected')} <WinRate value={score.expected} />
        </span>
      </div>
      <ul className="lane-sum__vs">
        {enemies.map((e) => {
          const fx = score.vs.find((x) => x.hero.id === e.id);
          return (
            <li key={e.id}>
              <Link to={`/counters/${e.slug}`} title={t('ctr.linkName', { name: e.name })}>
                <HeroAvatar hero={e} size={34} />
              </Link>
              <span className="lane-sum__name">{e.name}</span>
              {fx && fx.matches > 0 ? <Delta value={fx.delta} /> : <span className="muted small">{t('draft.fewGames')}</span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small lane-sum__sub">{t('draft.lane.sub')}</p>
    </section>
  );
}

/** What players on your hero buy in the first minutes, in buy order. */
function LaneStart({ me, base }: { me: Hero; base: { item_id: number; matches: number; avg_buy_time_s?: number }[] }) {
  const { t } = useT();
  const items = useItems();
  const start = useMemo(() => {
    const total = Math.max(1, ...base.map((s) => s.matches));
    return base
      .map((s) => ({ s, item: items.byId.get(s.item_id) }))
      .filter((x) => x.item && isShopItem(x.item) && (x.item.item_tier ?? 9) <= 2 && (x.s.avg_buy_time_s ?? Infinity) <= LANE_BUY_S && x.s.matches / total > 0.2)
      .sort((a, b) => (a.s.avg_buy_time_s ?? 0) - (b.s.avg_buy_time_s ?? 0))
      .slice(0, 10);
  }, [base, items.byId]);
  if (!start.length) return null;
  return (
    <section className="item-section">
      <SectionTitle title={t('draft.lane.start', { hero: me.name })} />
      <p className="muted section-sub">{t('draft.lane.startSub')}</p>
      <div className="draft-core">
        {start.map(({ s, item }) => (
          <ItemIcon key={s.item_id} item={item} size="md" />
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- main --------------------------------- */

export function DraftPlan({ me, enemies, allies, lane, score }: { me: Hero; enemies: Hero[]; allies: Hero[]; lane: boolean; score?: PickScore }) {
  const { t } = useT();
  const { plan, base, loading, error } = useDraftPlan(me, enemies, lane ? [] : allies, lane);
  const title = t(lane ? 'draft.plan.lineTitle' : 'draft.plan.title');

  if (!enemies.length) {
    return (
      <section className="item-section draft-plan">
        <SectionTitle title={title} />
        <Empty>{t(lane ? 'draft.plan.lineEmpty' : 'draft.plan.empty')}</Empty>
        {lane && <LaneStart me={me} base={base} />}
      </section>
    );
  }

  return (
    <>
      {lane && <LaneSummary score={score} enemies={enemies} />}
      <section className="item-section draft-plan">
        <SectionTitle title={title} />
        <p className="muted section-sub">{t(lane ? 'draft.plan.lineSub' : 'draft.plan.sub')}</p>
        {error ? (
          <ErrorState error={error} />
        ) : loading ? (
          <Skeleton h={260} r={14} />
        ) : !plan.items.length ? (
          <Empty>{t('draft.noItems')}</Empty>
        ) : (
          <ol className="plan-items">
            {plan.items.slice(0, SHOWN).map((x, i) => (
              <PlanCard key={x.item.id} x={x} rank={i} />
            ))}
          </ol>
        )}
      </section>

      {!loading && !error && plan.threats.length > 0 && (
        <section className="item-section">
          <SectionTitle title={t('draft.threats.title')} />
          <p className="muted section-sub">{t(lane ? 'draft.threats.lineSub' : 'draft.threats.sub')}</p>
          <ul className="threats">
            {plan.threats.map((th) => (
              <ThreatCard key={th.id} th={th} air={plan.air} />
            ))}
          </ul>
        </section>
      )}

      {!lane && !loading && <TeamNotes plan={plan} allies={allies} score={score} />}
      {lane && <LaneStart me={me} base={base} />}
    </>
  );
}
