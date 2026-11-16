import { motion } from 'framer-motion';
import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { HeroAvatar } from '../components/HeroChip';
import { ItemIcon } from '../components/ItemIcon';
import { PositionChips, PositionFilter, RoleBars, type PositionValue } from '../components/Position';
import { Empty, ErrorState, Panel, Page, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { Delta, WinRate } from '../components/WinRate';
import { useHeroes, useItems } from '../hooks/useAssets';
import { useCounterStats, useHeroRows, useItemStats, useItemStatsVsEnemies, useSynergyStats } from '../hooks/useStats';
import { useT, type MsgKey } from '../i18n';
import { answersTo, itemsVsLineup, pairIndex, rankPicks, teamRoles, type PairEffect, type PickScore } from '../lib/draft';
import { fmtDelta } from '../lib/format';
import { heroCard, heroRgb } from '../lib/heroes';
import { isShopItem } from '../lib/items';
import { playsPosition } from '../lib/roles';
import { useDocumentMeta } from '../lib/seo';
import type { Hero } from '../lib/types';
import { CounterGuideGrid } from './Counters';

/*
 * /draft — the draft helper (rebuilt 16.11.2026, replaces the three-mode version).
 *
 * One board, the way a Deadlock lobby looks: the enemy team (6), YOU, and up to 5 teammates.
 *   - "Best picks" always ranks the heroes for YOUR slot: own win rate + counter effects vs every enemy
 *     + synergy with every teammate (lib/draft.ts). Top 3 get a podium.
 *   - Once you put a hero into "You": your matchup, its rank among all options, the items that beat this
 *     enemy lineup and the hero's core items.
 *   - Side panels: your team's roles, the best answer to each enemy, and the picks to avoid.
 * The draft lives in the URL (?e=enemy slugs&a=teammate slugs&me=your hero), so it can be shared.
 * Old links (?mode=team|build, `me` inside `a`) still open — the first edit rewrites them to this form.
 */
const ENEMIES = 6;
const MATES = 5;
const PAGE = 10;
type Target = 'enemy' | 'me' | 'ally';
/** where the pool continues once a side is full */
const ORDER: Target[] = ['enemy', 'me', 'ally'];

interface DraftState {
  enemies: Hero[];
  mates: Hero[];
  me?: Hero;
}
type DraftPatch = { e?: Hero[]; a?: Hero[]; me?: Hero | null };

function parseDraft(params: URLSearchParams, bySlug: Map<string, Hero>): DraftState {
  const list = (key: string, cap: number, skip: Set<number>) => {
    const seen = new Set(skip);
    return (params.get(key) ?? '')
      .split(',')
      .map((s) => bySlug.get(s.trim()))
      .filter((h): h is Hero => !!h && !seen.has(h.id) && !!seen.add(h.id))
      .slice(0, cap);
  };
  const enemies = list('e', ENEMIES, new Set());
  const enemyIds = new Set(enemies.map((h) => h.id));
  const allies = list('a', ENEMIES, enemyIds);
  // old "team vs team" links had no `me` and meant the first ally
  const meHero = bySlug.get(params.get('me') ?? '') ?? (params.get('mode') === 'build' ? allies[0] : undefined);
  const me = meHero && !enemyIds.has(meHero.id) ? meHero : undefined;
  return { enemies, mates: allies.filter((h) => h.id !== me?.id).slice(0, MATES), me };
}

function useDraft() {
  const [params, setParams] = useSearchParams();
  const heroes = useHeroes();
  const state = parseDraft(params, heroes.bySlug);

  /**
   * Changes the draft based on the LIVE url. The router commits location changes in a transition
   * (v7_startTransition), so during fast clicks or typing this render's `params` can be one step behind —
   * building on them would silently drop the previous change.
   */
  const update = (fn: (live: DraftState) => DraftPatch) => {
    const current = new URLSearchParams(window.location.search);
    const live = parseDraft(current, heroes.bySlug);
    const patch = fn(live);
    const set = (k: string, v: string) => (v ? current.set(k, v) : current.delete(k));
    current.delete('mode');
    set('e', (patch.e ?? live.enemies).map((h) => h.slug).join(','));
    set('a', (patch.a ?? live.mates).map((h) => h.slug).join(','));
    set('me', (patch.me === undefined ? live.me : patch.me)?.slug ?? '');
    setParams(current, { replace: true });
  };
  return { ...state, update, ready: heroes.list.length > 0 };
}

/* -------------------------------- board -------------------------------- */

function Slot({ hero, you, next, onSelect, onRemove }: { hero?: Hero; you?: boolean; next?: boolean; onSelect?: () => void; onRemove?: () => void }) {
  const { t } = useT();
  if (!hero) {
    return (
      <li>
        <button
          className={`draft-slot is-empty ${next ? 'is-next' : ''} ${you ? 'is-you' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          aria-label={you ? t('draft.you') : t('draft.addHere')}
        >
          {you ? <span className="draft-slot__you display">{t('draft.you')}</span> : <span className="draft-slot__plus">+</span>}
        </button>
      </li>
    );
  }
  return (
    <motion.li
      className={`draft-slot ${you ? 'is-you' : ''} ${next ? 'is-next' : ''}`}
      style={{ ['--hero' as string]: heroRgb(hero) }}
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
      title={hero.name}
    >
      <HeroAvatar hero={hero} size={46} />
      <span className="draft-slot__name">{hero.name}</span>
      {you && <span className="draft-slot__tag">{t('draft.you')}</span>}
      <button
        className="draft-slot__x"
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
        aria-label={t('draft.remove', { name: hero.name })}
        title={t('draft.remove', { name: hero.name })}
      >
        ×
      </button>
    </motion.li>
  );
}

function TeamRow({
  side,
  title,
  count,
  active,
  onActivate,
  children,
}: {
  side: 'enemy' | 'ally';
  title: string;
  count: string;
  active: boolean;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`draft-team draft-team--${side} ${active ? 'is-active' : ''}`} onClick={onActivate}>
      <header className="draft-team__head">
        <h2 className="display">{title}</h2>
        <span className="num muted">{count}</span>
      </header>
      <ul className="draft-slots">{children}</ul>
    </section>
  );
}

function HeroPool({
  taken,
  target,
  setTarget,
  labels,
  onPick,
}: {
  taken: Map<number, Target>;
  target: Target;
  setTarget: (t: Target) => void;
  labels: Record<Target, string>;
  onPick: (h: Hero) => void;
}) {
  const { t } = useT();
  const heroes = useHeroes();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(true);
  const needle = q.trim().toLowerCase();
  const list = needle ? heroes.list.filter((h) => h.name.toLowerCase().includes(needle) || h.name_en.toLowerCase().includes(needle)) : heroes.list;
  const first = needle ? list.find((h) => !taken.has(h.id)) : undefined;

  // type a name, Enter adds the first free match — fast enough to use during hero select
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && first) {
      onPick(first);
      setQ('');
    } else if (e.key === 'Escape') setQ('');
  };

  return (
    <Panel className={`draft-pool ${open ? '' : 'is-closed'}`}>
      <div className="draft-pool__head">
        <span className="draft-pool__label">{t('draft.addTo')}</span>
        <Segmented id="draft-target" value={target} onChange={setTarget} options={ORDER.map((v) => ({ value: v, label: labels[v] }))} />
        <button className="draft-pool__toggle link-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t('draft.hidePool') : t('draft.showPool')}
        </button>
      </div>
      <div className="draft-pool__body">
        <div className="search draft-pool__search">
          <svg className="search__icon" viewBox="0 0 20 20" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('draft.searchHint')} aria-label={t('draft.searchHero')} spellCheck={false} />
        </div>
        <div className="draft-pool__grid">
          {list.map((h) => {
            const side = taken.get(h.id);
            return (
              <button
                key={h.id}
                className={`draft-pool__hero ${side ? `is-${side}` : ''} ${first?.id === h.id ? 'is-first' : ''}`}
                style={{ ['--hero' as string]: heroRgb(h) }}
                disabled={!!side}
                onClick={() => onPick(h)}
                title={h.name}
                aria-label={h.name}
              >
                <HeroAvatar hero={h} size={44} />
                <span className="draft-pool__name">{h.name}</span>
              </button>
            );
          })}
          {!list.length && <p className="muted small">{t('draft.noHero')}</p>}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------- results ------------------------------- */

function Effects({ label, list }: { label: string; list: PairEffect[] }) {
  if (!list.length) return null;
  return (
    <div className="pick-fx">
      <span className="pick-fx__label">{label}</span>
      <ul>
        {list.map((e) => {
          const tone = e.delta > 0.004 ? 'up' : e.delta < -0.004 ? 'down' : 'even';
          return (
            <li key={e.hero.id} className={`pick-fx__item is-${tone}`} title={`${e.hero.name} · ${e.matches ? fmtDelta(e.delta) : '—'}`}>
              <HeroAvatar hero={e.hero} size={22} />
              <span className="num">{e.matches ? fmtDelta(e.delta) : '—'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Top three: big cards with the hero's portrait. */
function Podium({ picks, meId }: { picks: PickScore[]; meId?: number }) {
  const { t } = useT();
  return (
    <ol className="pick-podium">
      {picks.map((p, i) => (
        <motion.li
          key={p.hero.id}
          layout="position"
          className={`podium-card ${p.hero.id === meId ? 'is-me' : ''}`}
          style={{ ['--hero' as string]: heroRgb(p.hero) }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link to={`/heroes/${p.hero.slug}`} className="podium-card__link">
            <img className="podium-card__art" src={heroCard(p.hero)} alt="" loading="lazy" />
            <span className="podium-card__rank display">{String(i + 1).padStart(2, '0')}</span>
            {p.hero.id === meId && <span className="podium-card__you">{t('draft.you')}</span>}
            <span className="podium-card__body">
              <b className="display podium-card__name">{p.hero.name}</b>
              <span className="podium-card__wr">
                <WinRate value={p.expected} />
              </span>
              <small className="muted">
                {t('draft.base')} <WinRate value={p.base} /> · <Delta value={p.advantage} />
              </small>
            </span>
          </Link>
          <div className="podium-card__fx">
            <Effects label={t('draft.vs')} list={p.vs} />
            <Effects label={t('draft.with')} list={p.with} />
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/** Cards slide to their new place when the draft changes (layout="position"); no exit animation, so a filter switch is instant. */
const PickCard = forwardRef<HTMLLIElement, { p: PickScore; rank: number; isMe: boolean }>(function PickCard({ p, rank, isMe }, ref) {
  const { t } = useT();
  return (
    <motion.li
      ref={ref}
      layout="position"
      className={`pick-card ${isMe ? 'is-me' : ''}`}
      style={{ ['--hero' as string]: heroRgb(p.hero) }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min((rank % PAGE) * 0.02, 0.2) }}
    >
      <span className="pick-card__rank num">{String(rank + 1).padStart(2, '0')}</span>
      <Link to={`/heroes/${p.hero.slug}`} className="pick-card__hero">
        <HeroAvatar hero={p.hero} size={44} />
        <span className="pick-card__who">
          <b>
            {p.hero.name}
            {isMe && <span className="pick-card__you">{t('draft.you')}</span>}
          </b>
          <PositionChips hero={p.hero} compact />
        </span>
      </Link>
      <div className="pick-card__fx">
        <Effects label={t('draft.vs')} list={p.vs} />
        <Effects label={t('draft.with')} list={p.with} />
      </div>
      <div className="pick-card__score">
        <WinRate value={p.expected} />
        <small className="muted">
          {t('draft.base')} <WinRate value={p.base} /> · <Delta value={p.advantage} />
        </small>
      </div>
    </motion.li>
  );
});

type Sort = 'win' | 'counter';

function Picks({ picks, hasInput, meId, autoRole, hasMe }: { picks: PickScore[]; hasInput: boolean; meId?: number; autoRole: PositionValue; hasMe: boolean }) {
  const { t } = useT();
  const [sort, setSort] = useState<Sort>('win');
  const [pos, setPos] = useState<PositionValue>('all');
  const [shown, setShown] = useState(PAGE);
  // a team that is mostly known and lacks a role: start on that role (still free to switch)
  useEffect(() => setPos(autoRole), [autoRole]);
  const sorted = sort === 'counter' && hasInput ? [...picks].sort((a, b) => b.advantage - a.advantage) : picks;
  const list = pos === 'all' ? sorted : sorted.filter((p) => playsPosition(p.hero, pos));
  const sub: MsgKey = !hasInput ? 'draft.picksEmpty' : sort === 'counter' ? 'draft.counterSub' : 'draft.picksSub';

  return (
    <section className="draft-picks">
      <SectionTitle
        title={t(hasMe ? 'draft.alternatives' : 'draft.bestPicks')}
        right={
          hasInput ? (
            <Segmented
              id="draft-sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'win' as Sort, label: t('draft.sortWin') },
                { value: 'counter' as Sort, label: t('draft.sortCounter') },
              ]}
            />
          ) : undefined
        }
      />
      <div className="toolbar draft-picks__bar">
        <p className="muted section-sub">{t(sub)}</p>
        <div className="toolbar__end">
          <PositionFilter id="draft-pos" value={pos} onChange={setPos} />
        </div>
      </div>
      {!list.length ? (
        <Empty>{t('draft.noPicks')}</Empty>
      ) : (
        <>
          <Podium picks={list.slice(0, 3)} meId={meId} />
          {list.length > 3 && (
            <ol className="pick-list">
              {list.slice(3, 3 + shown).map((p, i) => (
                <PickCard key={p.hero.id} p={p} rank={i + 3} isMe={p.hero.id === meId} />
              ))}
            </ol>
          )}
          {3 + shown < list.length && (
            <div className="load-more">
              <button className="btn btn--ghost" onClick={() => setShown((s) => s + PAGE)}>
                {t('hb.loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function YourPick({ score, rank, total }: { score: PickScore; rank: number; total: number }) {
  const { t } = useT();
  const h = score.hero;
  return (
    <motion.section
      key={h.id}
      className="your-pick"
      style={{ ['--hero' as string]: heroRgb(h) }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <img className="your-pick__art" src={heroCard(h)} alt="" />
      <div className="your-pick__body">
        <span className="eyebrow">{t('draft.yourPick')}</span>
        <h2 className="display your-pick__name">{h.name}</h2>
        <div className="your-pick__score">
          <WinRate value={score.expected} />
          <span className="your-pick__rank">{t('draft.rankOf', { n: rank, total })}</span>
        </div>
        <div className="pick-card__fx">
          <Effects label={t('draft.vs')} list={score.vs} />
          <Effects label={t('draft.with')} list={score.with} />
        </div>
        <p className="muted small-note">
          {t('draft.base')} <WinRate value={score.base} /> · {t('draft.advantage')} <Delta value={score.advantage} /> ·{' '}
          <Link className="link-more" to={`/heroes/${h.slug}/builds`}>
            {t('hero.allBuilds')}
          </Link>
        </p>
      </div>
    </motion.section>
  );
}

function BuildAdvice({ me, enemies }: { me: Hero; enemies: Hero[] }) {
  const { t } = useT();
  const items = useItems();
  const base = useItemStats(me.id);
  const enemyIds = useMemo(() => enemies.map((e) => e.id), [enemies]);
  const vs = useItemStatsVsEnemies(enemies.length ? me.id : undefined, enemyIds);
  const enemyById = new Map(enemies.map((e) => [e.id, e]));

  const counterItems = useMemo(
    () =>
      itemsVsLineup(base.data ?? [], vs.perEnemy, (id) => {
        const it = items.byId.get(id);
        return !!it && isShopItem(it);
      })
        .filter((x) => x.score > 0.002)
        .slice(0, 8),
    [base.data, vs.perEnemy, items.byId],
  );
  const core = useMemo(() => {
    const total = Math.max(1, ...(base.data ?? []).map((s) => s.matches));
    return (base.data ?? [])
      .map((s) => ({ s, item: items.byId.get(s.item_id) }))
      .filter((x) => x.item && isShopItem(x.item) && x.s.matches / total > 0.25)
      .sort((a, b) => (a.s.avg_buy_time_s ?? 0) - (b.s.avg_buy_time_s ?? 0))
      .slice(0, 12);
  }, [base.data, items.byId]);

  return (
    <>
      <section className="item-section">
        <SectionTitle title={t('draft.itemsVs')} />
        <p className="muted section-sub">{t(enemies.length ? 'draft.itemsVsSub' : 'draft.itemsVsEmpty')}</p>
        {enemies.length > 0 &&
          (base.error || vs.error ? (
            <ErrorState error={base.error ?? vs.error} />
          ) : base.isLoading || vs.isLoading ? (
            <Skeleton h={150} r={14} />
          ) : !counterItems.length ? (
            <Empty>{t('draft.noItems')}</Empty>
          ) : (
            <div className="draft-items">
              {counterItems.map((x, i) => {
                const item = items.byId.get(x.itemId)!;
                return (
                  <motion.div key={x.itemId} className="draft-item" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <ItemIcon item={item} size="md" />
                    <span className="draft-item__text">
                      <b>{item.name}</b>
                      <span className="draft-item__vs">
                        <Delta value={x.score} />
                        {x.bestVs.map((b) => {
                          const e = enemyById.get(b.enemyId);
                          return e ? (
                            <span key={b.enemyId} title={`${e.name} · ${fmtDelta(b.delta)}`}>
                              <HeroAvatar hero={e} size={20} />
                            </span>
                          ) : null;
                        })}
                      </span>
                    </span>
                  </motion.div>
                );
              })}
            </div>
          ))}
      </section>

      {core.length > 0 && (
        <section className="item-section">
          <SectionTitle title={t('draft.core', { hero: me.name })} />
          <p className="muted section-sub">{t('draft.coreSub')}</p>
          <div className="draft-core">
            {core.map(({ s, item }) => (
              <ItemIcon key={s.item_id} item={item} size="md" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** `filtered`: the pick list was switched to the missing role (only once most of the team is known). */
function TeamNeeds({ mates, filtered }: { mates: Hero[]; filtered: boolean }) {
  const { t } = useT();
  const need = teamRoles(mates);
  return (
    <Panel title={t('draft.teamRoles')} className="draft-aside__panel">
      <RoleBars scores={need.coverage} />
      <p className={`draft-needs__verdict ${need.missing ? 'is-missing' : 'is-ok'}`}>
        {need.missing ? t(filtered ? 'draft.needs' : 'draft.needsShort', { role: t(`pos.${need.missing}` as MsgKey) }) : t('draft.balanced')}
      </p>
    </Panel>
  );
}

function Answers({ enemies, picks }: { enemies: Hero[]; picks: PickScore[] }) {
  const { t } = useT();
  return (
    <Panel title={t('draft.answers')} className="draft-aside__panel">
      <p className="muted small draft-aside__sub">{t('draft.answersSub')}</p>
      <ul className="answers">
        {enemies.map((e) => {
          const best = answersTo(e, picks, 3);
          return (
            <li key={e.id} className="answers__row">
              <Link to={`/counters/${e.slug}`} className="answers__enemy" title={t('ctr.linkName', { name: e.name })}>
                <HeroAvatar hero={e} size={34} />
              </Link>
              <span className="answers__arrow" aria-hidden>
                ›
              </span>
              <span className="answers__list">
                {best.length ? (
                  best.map(({ hero, fx }) => (
                    <Link key={hero.id} to={`/heroes/${hero.slug}`} className="answers__pick" title={`${hero.name} · ${fmtDelta(fx.delta)}`}>
                      <HeroAvatar hero={hero} size={24} />
                      <span className="num">{fmtDelta(fx.delta)}</span>
                    </Link>
                  ))
                ) : (
                  <span className="muted small">{t('draft.fewGames')}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Avoid({ picks }: { picks: PickScore[] }) {
  const { t } = useT();
  // hurt by this lineup AND a losing pick overall — a strong hero with a bad matchup can still rank high in "Best picks"
  const worst = [...picks]
    .filter((p) => p.advantage < -0.004 && p.expected < 0.5)
    .sort((a, b) => a.advantage - b.advantage)
    .slice(0, 5);
  if (!worst.length) return null;
  return (
    <Panel title={t('draft.avoid')} className="draft-aside__panel draft-avoid">
      <p className="muted small draft-aside__sub">{t('draft.avoidSub')}</p>
      <ul className="avoid-list">
        {worst.map((p) => (
          <li key={p.hero.id}>
            <Link to={`/heroes/${p.hero.slug}`} className="avoid-list__hero">
              <HeroAvatar hero={p.hero} size={30} />
              <span>{p.hero.name}</span>
            </Link>
            <span className="avoid-list__val">
              <Delta value={p.advantage} />
              <WinRate value={p.expected} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function HowItWorks() {
  const { t } = useT();
  return (
    <Panel title={t('draft.howTitle')} className="draft-aside__panel">
      <ol className="draft-steps">
        {(['draft.step1', 'draft.step2', 'draft.step3'] as MsgKey[]).map((k, i) => (
          <li key={k}>
            <span className="draft-steps__n display">{i + 1}</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* --------------------------------- page --------------------------------- */

export function DraftPage() {
  const { t } = useT();
  const heroes = useHeroes();
  const { enemies, mates, me, update, ready } = useDraft();
  const { rows, isLoading, isFetching, error } = useHeroRows();
  const counters = useCounterStats();
  const synergy = useSynergyStats();
  const [target, setTarget] = useState<Target>('enemy');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number>();

  useDocumentMeta(t('meta.draft'), t('meta.desc.draft'));
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const baseWr = useMemo(() => new Map(rows.map((r) => [r.hero.id, r.winRate])), [rows]);
  const idx = useMemo(() => pairIndex(counters.data, synergy.data), [counters.data, synergy.data]);
  // candidates for YOUR slot: everyone not on the board except you (so your own hero is ranked too)
  const picks = useMemo(() => rankPicks(heroes.list, baseWr, idx, enemies, mates), [heroes.list, baseWr, idx, enemies, mates]);
  const meScore = me ? picks.find((p) => p.hero.id === me.id) : undefined;
  const need = teamRoles(mates);
  const autoRole: PositionValue = mates.length >= 3 && need.missing ? need.missing : 'all';

  const taken = new Map<number, Target>([...enemies.map((h) => [h.id, 'enemy'] as const), ...mates.map((h) => [h.id, 'ally'] as const), ...(me ? [[me.id, 'me'] as const] : [])]);
  const add = (h: Hero) => {
    let next: Target = target;
    update((d) => {
      if (d.me?.id === h.id || [...d.enemies, ...d.mates].some((x) => x.id === h.id)) return {}; // double click
      const room: Record<Target, number> = { enemy: ENEMIES - d.enemies.length, ally: MATES - d.mates.length, me: d.me ? 0 : 1 };
      let into = target;
      // a full side hands the click to the next one with room (your own slot can always be replaced)
      if (into !== 'me' && room[into] <= 0) {
        const free = ORDER.find((s) => room[s] > 0);
        if (!free) return {};
        into = free;
      }
      const left = { ...room, [into]: into === 'me' ? 0 : room[into] - 1 };
      next = left[into] > 0 ? into : (ORDER.find((s) => left[s] > 0) ?? into);
      return into === 'enemy' ? { e: [...d.enemies, h] } : into === 'ally' ? { a: [...d.mates, h] } : { me: h };
    });
    setTarget(next);
  };

  const copyLink = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const loading = !ready || isLoading || counters.isLoading || synergy.isLoading;
  const hasInput = enemies.length + mates.length > 0;
  const labels: Record<Target, string> = {
    enemy: `${t('draft.target.enemy')} ${enemies.length}/${ENEMIES}`,
    me: t('draft.you'),
    ally: `${t('draft.target.ally')} ${mates.length}/${MATES}`,
  };

  return (
    <Page className="draft-page">
      <div className="container">
        <header className="page-head draft-head">
          <div>
            <span className="eyebrow">{t('draft.eyebrow')}</span>
            <h1 className="display page-head__title">{t('draft.title')}</h1>
            <p className="page-head__sub muted">{t('draft.sub')}</p>
          </div>
          <FilterBar fetching={(isFetching || counters.isFetching) && !loading} />
        </header>

        <div className="draft-top">
          <div className="draft-board">
            <TeamRow side="enemy" title={t('draft.enemyTeam')} count={`${enemies.length}/${ENEMIES}`} active={target === 'enemy'} onActivate={() => setTarget('enemy')}>
              {Array.from({ length: ENEMIES }, (_, i) => {
                const h = enemies[i];
                return (
                  <Slot
                    key={h ? h.id : `e${i}`}
                    hero={h}
                    next={!h && target === 'enemy' && i === enemies.length}
                    onSelect={() => setTarget('enemy')}
                    onRemove={() => h && update((d) => ({ e: d.enemies.filter((x) => x.id !== h.id) }))}
                  />
                );
              })}
            </TeamRow>
            <div className="draft-vs" aria-hidden>
              <span className="display">vs</span>
            </div>
            <TeamRow side="ally" title={t('draft.yourTeam')} count={`${mates.length + (me ? 1 : 0)}/${MATES + 1}`} active={target !== 'enemy'} onActivate={() => setTarget('ally')}>
              <Slot key={me ? me.id : 'me'} hero={me} you next={target === 'me'} onSelect={() => setTarget('me')} onRemove={() => update(() => ({ me: null }))} />
              {Array.from({ length: MATES }, (_, i) => {
                const h = mates[i];
                return (
                  <Slot
                    key={h ? h.id : `a${i}`}
                    hero={h}
                    next={!h && target === 'ally' && i === mates.length}
                    onSelect={() => setTarget('ally')}
                    onRemove={() => h && update((d) => ({ a: d.mates.filter((x) => x.id !== h.id) }))}
                  />
                );
              })}
            </TeamRow>
            <div className="draft-board__actions">
              <button className="link-more" onClick={copyLink} disabled={!hasInput && !me}>
                {copied ? t('draft.copied') : t('draft.copyLink')}
              </button>
              {(hasInput || me) && (
                <button className="link-more draft-clear" onClick={() => {
                    update(() => ({ e: [], a: [], me: null }));
                    setTarget('enemy');
                  }}>
                  {t('draft.clear')}
                </button>
              )}
            </div>
          </div>
          <HeroPool taken={taken} target={target} setTarget={setTarget} labels={labels} onPick={add} />
        </div>

        {error || counters.error ? (
          <ErrorState error={error ?? counters.error} onRetry={() => counters.refetch()} />
        ) : loading ? (
          <Skeleton h={420} r={14} />
        ) : (
          <div className="draft-results">
            <div className="draft-results__main">
              {me && meScore && (
                <>
                  <YourPick score={meScore} rank={picks.indexOf(meScore) + 1} total={picks.length} />
                  <BuildAdvice me={me} enemies={enemies} />
                </>
              )}
              <Picks picks={picks} hasInput={hasInput} meId={me?.id} autoRole={autoRole} hasMe={!!me} />
            </div>
            <aside className="draft-aside">
              {!hasInput && <HowItWorks />}
              {mates.length > 0 && <TeamNeeds mates={mates} filtered={autoRole !== 'all'} />}
              {enemies.length > 0 && <Answers enemies={enemies} picks={picks} />}
              {enemies.length > 0 && <Avoid picks={picks} />}
              {!me && hasInput && <p className="muted small draft-aside__hint">{t('draft.lockHint')}</p>}
            </aside>
          </div>
        )}

        <SectionTitle eyebrow={t('ctr.eyebrow')} title={t('draft.counterPages')} right={<Link className="link-more" to="/counters">{t('ctr.allLink')}</Link>} />
        <CounterGuideGrid />
        <p className="muted small-note">{t('draft.method')}</p>
      </div>
    </Page>
  );
}
