import { motion } from 'framer-motion';
import { forwardRef, useEffect, useMemo, useState } from 'react';
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
import { itemsVsLineup, pairIndex, rankPicks, scoreHero, teamRoles, type PairEffect, type PickScore } from '../lib/draft';
import { fmtDelta } from '../lib/format';
import { heroRgb } from '../lib/heroes';
import { isShopItem } from '../lib/items';
import { playsPosition } from '../lib/roles';
import { useDocumentMeta } from '../lib/seo';
import type { Hero } from '../lib/types';

/*
 * /draft — three modes (owner's spec):
 *   counter (main): the 6 enemy heroes → who to pick
 *   team:           6 enemies + your 5 allies → who to pick and which role your team is missing
 *   build:          6 vs 6, mark your own hero → your matchup and the items that beat this lineup
 * The draft lives in the URL (?mode=team&e=haze,infernus&a=…&me=…) so it can be shared.
 */
const MODES = ['counter', 'team', 'build'] as const;
type Mode = (typeof MODES)[number];
type Side = 'enemy' | 'ally';
const TEAM = 6;
const allyCap = (mode: Mode) => (mode === 'team' ? TEAM - 1 : mode === 'build' ? TEAM : 0);
const PAGE = 10;

function useDraft() {
  const [params, setParams] = useSearchParams();
  const heroes = useHeroes();
  const mode: Mode = (MODES as readonly string[]).includes(params.get('mode') ?? '') ? (params.get('mode') as Mode) : 'counter';
  const list = (key: string, cap: number) => {
    const seen = new Set<number>();
    return (params.get(key) ?? '')
      .split(',')
      .map((s) => heroes.bySlug.get(s))
      .filter((h): h is Hero => !!h && !seen.has(h.id) && !!seen.add(h.id))
      .slice(0, cap);
  };
  const enemies = list('e', TEAM);
  const allies = list('a', allyCap(mode)).filter((h) => !enemies.some((e) => e.id === h.id));
  const meSlug = params.get('me');
  const me = allies.find((h) => h.slug === meSlug) ?? allies[0];

  const update = (patch: { mode?: Mode; e?: Hero[]; a?: Hero[]; me?: Hero | null }) => {
    const next = new URLSearchParams(params);
    const set = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
    if (patch.mode) set('mode', patch.mode === 'counter' ? '' : patch.mode);
    if (patch.e) set('e', patch.e.map((h) => h.slug).join(','));
    if (patch.a) set('a', patch.a.map((h) => h.slug).join(','));
    if (patch.me !== undefined) set('me', patch.me?.slug ?? '');
    setParams(next, { replace: true });
  };
  return { mode, enemies, allies, me, update, ready: heroes.list.length > 0 };
}

/* -------------------------------- board -------------------------------- */

function TeamBox({
  side,
  title,
  heroes,
  cap,
  active,
  onActivate,
  onRemove,
  me,
  onMe,
}: {
  side: Side;
  title: string;
  heroes: Hero[];
  cap: number;
  active: boolean;
  onActivate: () => void;
  onRemove: (h: Hero) => void;
  me?: Hero;
  onMe?: (h: Hero) => void;
}) {
  const { t } = useT();
  return (
    <section className={`draft-team draft-team--${side} ${active ? 'is-active' : ''}`} onClick={onActivate}>
      <header className="draft-team__head">
        <h2 className="display">{title}</h2>
        <span className="num muted">
          {heroes.length}/{cap}
        </span>
      </header>
      <ul className="draft-slots">
        {Array.from({ length: cap }, (_, i) => {
          const h = heroes[i];
          if (!h) {
            return (
              <li key={`empty-${i}`} className={`draft-slot is-empty ${active && i === heroes.length ? 'is-next' : ''}`}>
                <span className="draft-slot__plus" aria-hidden>
                  +
                </span>
              </li>
            );
          }
          const isMe = me?.id === h.id;
          return (
            <motion.li
              key={h.id}
              className={`draft-slot ${isMe ? 'is-me' : ''}`}
              style={{ ['--hero' as string]: heroRgb(h) }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <HeroAvatar hero={h} size={44} />
              <span className="draft-slot__name">{h.name}</span>
              {onMe && (
                <button
                  className={`draft-slot__me ${isMe ? 'is-on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMe(h);
                  }}
                  aria-pressed={isMe}
                  title={t('draft.markMe')}
                >
                  {t('draft.me')}
                </button>
              )}
              <button
                className="draft-slot__x"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(h);
                }}
                aria-label={t('draft.remove', { name: h.name })}
                title={t('draft.remove', { name: h.name })}
              >
                ×
              </button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

function HeroPool({ taken, onPick, target }: { taken: Set<number>; onPick: (h: Hero) => void; target: string }) {
  const { t } = useT();
  const heroes = useHeroes();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = needle ? heroes.list.filter((h) => h.name.toLowerCase().includes(needle) || h.name_en.toLowerCase().includes(needle)) : heroes.list;
  return (
    <Panel className="draft-pool">
      <div className="draft-pool__head">
        <span className="muted small">{target}</span>
        <div className="search draft-pool__search">
          <svg className="search__icon" viewBox="0 0 20 20" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('draft.searchHero')} aria-label={t('draft.searchHero')} spellCheck={false} />
        </div>
      </div>
      <div className="draft-pool__grid">
        {list.map((h) => {
          const used = taken.has(h.id);
          return (
            <button
              key={h.id}
              className={`draft-pool__hero ${used ? 'is-taken' : ''}`}
              style={{ ['--hero' as string]: heroRgb(h) }}
              disabled={used}
              onClick={() => onPick(h)}
              title={h.name}
            >
              <HeroAvatar hero={h} size={46} />
              <span>{h.name}</span>
            </button>
          );
        })}
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
            <li key={e.hero.id} className={`pick-fx__item is-${tone}`} title={`${e.hero.name} · ${fmtDelta(e.delta)}`}>
              <HeroAvatar hero={e.hero} size={22} />
              <span className="num">{e.matches ? fmtDelta(e.delta) : '—'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cards slide to their new place when the draft changes (layout="position"); no exit animation, so a filter switch is instant. */
const PickCard = forwardRef<HTMLLIElement, { p: PickScore; rank: number }>(function PickCard({ p, rank }, ref) {
  const { t } = useT();
  return (
    <motion.li
      ref={ref}
      layout="position"
      className="pick-card"
      style={{ ['--hero' as string]: heroRgb(p.hero) }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(rank * 0.02, 0.2) }}
    >
      <span className="pick-card__rank num">{String(rank + 1).padStart(2, '0')}</span>
      <Link to={`/heroes/${p.hero.slug}`} className="pick-card__hero">
        <HeroAvatar hero={p.hero} size={48} />
        <span className="pick-card__who">
          <b>{p.hero.name}</b>
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

function Picks({ picks, mode, missing, hasInput }: { picks: PickScore[]; mode: Mode; missing: PositionValue; hasInput: boolean }) {
  const { t } = useT();
  const [pos, setPos] = useState<PositionValue>('all');
  const [shown, setShown] = useState(PAGE);
  // "complete the team": start on the role the team lacks (still free to switch)
  useEffect(() => setPos(mode === 'team' ? missing : 'all'), [mode, missing]);
  const list = pos === 'all' ? picks : picks.filter((p) => playsPosition(p.hero, pos));

  return (
    <section className="item-section">
      <SectionTitle title={t('draft.bestPicks')} right={<PositionFilter id="draft-pos" value={pos} onChange={setPos} />} />
      <p className="muted section-sub">{t(hasInput ? 'draft.picksSub' : 'draft.picksEmpty')}</p>
      {!list.length ? (
        <Empty>{t('draft.noPicks')}</Empty>
      ) : (
        <>
          <ol className="pick-list">
            {list.slice(0, shown).map((p, i) => (
              <PickCard key={p.hero.id} p={p} rank={i} />
            ))}
          </ol>
          {shown < list.length && (
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

function TeamNeeds({ allies }: { allies: Hero[] }) {
  const { t } = useT();
  const need = teamRoles(allies);
  if (!allies.length) return null;
  return (
    <Panel title={t('draft.teamRoles')} className="draft-needs">
      <RoleBars scores={need.coverage} />
      <p className={`draft-needs__verdict ${need.missing ? 'is-missing' : 'is-ok'}`}>
        {need.missing ? t('draft.needs', { role: t(`pos.${need.missing}` as MsgKey) }) : t('draft.balanced')}
      </p>
    </Panel>
  );
}

function BuildAdvice({ me, enemies, allies, idx, baseWr }: { me: Hero; enemies: Hero[]; allies: Hero[]; idx: ReturnType<typeof pairIndex>; baseWr: Map<number, number> }) {
  const { t } = useT();
  const items = useItems();
  const base = useItemStats(me.id);
  const enemyIds = useMemo(() => enemies.map((e) => e.id), [enemies]);
  const vs = useItemStatsVsEnemies(enemies.length ? me.id : undefined, enemyIds);
  const score = baseWr.has(me.id) ? scoreHero(me, baseWr, idx, enemies, allies) : null;
  const enemyById = new Map(enemies.map((e) => [e.id, e]));

  const counterItems = useMemo(
    () =>
      itemsVsLineup(base.data ?? [], vs.perEnemy, (id) => {
        const it = items.byId.get(id);
        return !!it && isShopItem(it);
      })
        .filter((x) => x.score > 0.002)
        .slice(0, 10),
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
      {score && (
        <Panel className="draft-me" title={t('draft.yourMatchup', { hero: me.name })} right={<WinRate value={score.expected} />}>
          <div className="pick-card__fx">
            <Effects label={t('draft.vs')} list={score.vs} />
            <Effects label={t('draft.with')} list={score.with} />
          </div>
          <p className="muted small-note">
            {t('draft.base')} <WinRate value={score.base} /> · {t('draft.advantage')} <Delta value={score.advantage} />
          </p>
        </Panel>
      )}

      <section className="item-section">
        <SectionTitle title={t('draft.itemsVs')} />
        <p className="muted section-sub">{t(enemies.length ? 'draft.itemsVsSub' : 'draft.itemsVsEmpty')}</p>
        {enemies.length > 0 &&
          (base.error || vs.error ? (
            <ErrorState error={base.error ?? vs.error} />
          ) : base.isLoading || vs.isLoading ? (
            <Skeleton h={180} r={14} />
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
          <SectionTitle title={t('draft.core', { hero: me.name })} right={<Link className="link-more" to={`/heroes/${me.slug}/builds`}>{t('hero.allBuilds')}</Link>} />
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

/* --------------------------------- page --------------------------------- */

export function DraftPage() {
  const { t } = useT();
  const heroes = useHeroes();
  const { mode, enemies, allies, me, update, ready } = useDraft();
  const { rows, isLoading, isFetching, error } = useHeroRows();
  const counters = useCounterStats();
  const synergy = useSynergyStats();
  const [side, setSide] = useState<Side>('enemy');
  const cap = allyCap(mode);

  useDocumentMeta(t('meta.draft'), t('meta.desc.draft'));

  const baseWr = useMemo(() => new Map(rows.map((r) => [r.hero.id, r.winRate])), [rows]);
  const idx = useMemo(() => pairIndex(counters.data, synergy.data), [counters.data, synergy.data]);
  const teamAllies = mode === 'team' ? allies : [];
  const picks = useMemo(() => rankPicks(heroes.list, baseWr, idx, enemies, teamAllies), [heroes.list, baseWr, idx, enemies, teamAllies]);
  const need = teamRoles(teamAllies);
  const taken = new Set([...enemies, ...(cap ? allies : [])].map((h) => h.id));
  const activeSide: Side = cap === 0 ? 'enemy' : side;

  const pick = (h: Hero) => {
    const into = (s: Side) => {
      if (s === 'enemy') update({ e: [...enemies, h] });
      else update({ a: [...allies, h], ...(mode === 'build' && !allies.length ? { me: h } : {}) });
    };
    const full = (s: Side) => (s === 'enemy' ? enemies.length >= TEAM : allies.length >= cap);
    if (!full(activeSide)) {
      into(activeSide);
      // the side just filled up → continue on the other one
      const other: Side = activeSide === 'enemy' ? 'ally' : 'enemy';
      const nowFull = activeSide === 'enemy' ? enemies.length + 1 >= TEAM : allies.length + 1 >= cap;
      if (nowFull && cap && !full(other)) setSide(other);
    } else if (cap && !full(activeSide === 'enemy' ? 'ally' : 'enemy')) {
      const other: Side = activeSide === 'enemy' ? 'ally' : 'enemy';
      setSide(other);
      into(other);
    }
  };

  const loading = !ready || isLoading || counters.isLoading || synergy.isLoading;
  const target = activeSide === 'enemy' ? t('draft.addingEnemy') : t('draft.addingAlly');

  return (
    <Page className="draft-page">
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('draft.eyebrow')}</span>
            <h1 className="display page-head__title">{t('draft.title')}</h1>
            <p className="page-head__sub muted">{t(`draft.sub.${mode}` as MsgKey)}</p>
          </div>
          <FilterBar fetching={(isFetching || counters.isFetching) && !loading} />
        </header>

        <div className="toolbar draft-toolbar">
          <Segmented
            id="draft-mode"
            value={mode}
            onChange={(m) => {
              update({ mode: m });
              if (allyCap(m) === 0) setSide('enemy');
            }}
            options={MODES.map((m) => ({ value: m, label: t(`draft.mode.${m}` as MsgKey) }))}
          />
          {(enemies.length > 0 || allies.length > 0) && (
            <button className="link-more draft-clear" onClick={() => update({ e: [], a: [], me: null })}>
              {t('draft.clear')}
            </button>
          )}
        </div>

        <div className={`draft-board ${cap ? 'has-allies' : ''}`}>
          {cap > 0 && (
            <TeamBox
              side="ally"
              title={t('draft.yourTeam')}
              heroes={allies}
              cap={cap}
              active={activeSide === 'ally'}
              onActivate={() => setSide('ally')}
              onRemove={(h) => update({ a: allies.filter((x) => x.id !== h.id), ...(me?.id === h.id ? { me: null } : {}) })}
              me={mode === 'build' ? me : undefined}
              onMe={mode === 'build' ? (h) => update({ me: h }) : undefined}
            />
          )}
          <TeamBox
            side="enemy"
            title={t('draft.enemyTeam')}
            heroes={enemies}
            cap={TEAM}
            active={activeSide === 'enemy'}
            onActivate={() => setSide('enemy')}
            onRemove={(h) => update({ e: enemies.filter((x) => x.id !== h.id) })}
          />
        </div>

        <HeroPool taken={taken} onPick={pick} target={target} />

        {error || counters.error ? (
          <ErrorState error={error ?? counters.error} onRetry={() => counters.refetch()} />
        ) : loading ? (
          <Skeleton h={360} r={14} />
        ) : mode === 'build' ? (
          me ? (
            <BuildAdvice me={me} enemies={enemies} allies={allies} idx={idx} baseWr={baseWr} />
          ) : (
            <Empty>{t('draft.buildEmpty')}</Empty>
          )
        ) : (
          <>
            {mode === 'team' && <TeamNeeds allies={allies} />}
            <Picks picks={picks} mode={mode} missing={need.missing ?? 'all'} hasInput={enemies.length + teamAllies.length > 0} />
          </>
        )}
        <p className="muted small-note">{t('draft.method')}</p>
      </div>
    </Page>
  );
}
