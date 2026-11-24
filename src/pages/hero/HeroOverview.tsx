import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbilityCard } from '../../components/Ability';
import { AbilityOrderGrid } from '../../components/AbilityOrderGrid';
import { BuildCard } from '../../components/BuildCard';
import { HeroChip } from '../../components/HeroChip';
import { ItemIcon } from '../../components/ItemIcon';
import { PositionChips, RoleBars } from '../../components/Position';
import { Empty, ErrorState, Panel, SectionTitle, Segmented, Skeleton } from '../../components/UI';
import { Delta, WinRate } from '../../components/WinRate';
import { useItems } from '../../hooks/useAssets';
import { useHeroItemRows, useHeroMatchups, type ItemRow } from '../../hooks/useHeroData';
import { useAbilityOrders, useBuildsByIds, useHeroBuildStats, useSteamProfiles } from '../../hooks/useStats';
import { heroRoleScores } from '../../lib/roles';
import { useT, type MsgKey } from '../../i18n';
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format';
import { heroWeapon } from '../../lib/heroes';
import type { Hero, Item } from '../../lib/types';
import { HeroPros } from './HeroPros';

/* ------------------------------ skill order ------------------------------ */
function SkillOrder({ hero, abilities }: { hero: Hero; abilities: Item[] }) {
  const { t, rich } = useT();
  const q = useAbilityOrders(hero.id);
  const [pick, setPick] = useState(0);
  const top = useMemo(() => {
    const list = (q.data ?? []).filter((o) => o.abilities.length >= 12);
    const total = list.reduce((a, o) => a + o.matches, 0) || 1;
    return [...list]
      .sort((a, b) => b.matches - a.matches)
      .slice(0, 3)
      .map((o) => ({ ...o, share: o.matches / total, wr: o.wins / o.matches }));
  }, [q.data]);
  const cur = top[Math.min(pick, top.length - 1)];

  return (
    <Panel
      className="skill-order"
      title={t('hero.skillOrder')}
      right={top.length > 1 && <Segmented id="skill-order" value={pick} onChange={setPick} options={top.map((_, i) => ({ value: i, label: `#${i + 1}` }))} />}
    >
      {q.error ? (
        <ErrorState error={q.error} />
      ) : q.isLoading || !abilities.length ? (
        <Skeleton h={190} />
      ) : !cur ? (
        <Empty>{t('hero.noSkillOrder')}</Empty>
      ) : (
        <>
          <div className="skill-order__meta">
            <span>
              {t('stat.winRate')} <WinRate value={cur.wr} />
            </span>
            <span>{rich('hero.usedIn', { pct: <b className="num">{fmtPct(cur.share)}</b> })}</span>
            <span className="muted num">{t('hero.matchesN', { n: fmtCompact(cur.matches) })}</span>
          </div>
          <AbilityOrderGrid key={pick} abilities={abilities} order={cur.abilities} />
        </>
      )}
    </Panel>
  );
}

/* ------------------------------- core items ------------------------------ */
function CoreItems({ hero }: { hero: Hero }) {
  const { t } = useT();
  const { rows, isLoading, error } = useHeroItemRows(hero.id);
  const groups = useMemo(() => {
    const pick = (tiers: number[], n: number) =>
      rows
        .filter((r) => tiers.includes(r.item.item_tier ?? 0) && r.pickRate >= 0.04)
        .sort((a, b) => b.pickRate - a.pickRate)
        .slice(0, n);
    const g: { label: MsgKey; hint: MsgKey; rows: ItemRow[] }[] = [
      { label: 'hero.early', hint: 'hero.tiers12', rows: pick([1, 2], 5) },
      { label: 'hero.core', hint: 'hero.tier3', rows: pick([3], 5) },
      { label: 'hero.late', hint: 'hero.tier4', rows: pick([4, 5], 5) },
    ];
    return g;
  }, [rows]);

  return (
    <Panel
      title={t('hero.coreItems')}
      right={
        <Link to={`/heroes/${hero.slug}/items`} className="link-more">
          {t('hero.allItems')}
        </Link>
      }
    >
      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <Skeleton h={240} />
      ) : (
        <div className="core-items">
          {groups.map((g) => (
            <div key={g.label} className="core-items__group">
              <div className="core-items__label">
                <b>{t(g.label)}</b> <span className="muted">{t(g.hint)}</span>
              </div>
              <div className="core-items__row">
                {g.rows.map((r) => (
                  <div key={r.item.id} className="core-item">
                    <ItemIcon item={r.item} stat={r.stat} pickRate={r.pickRate} />
                    <WinRate value={r.winRate} />
                    <small className="num muted">{fmtPct(r.pickRate, 0)}</small>
                  </div>
                ))}
                {!g.rows.length && <span className="muted">—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------- matchups (mini) --------------------------- */
function MatchupsMini({ hero }: { hero: Hero }) {
  const { t } = useT();
  const m = useHeroMatchups(hero.id);
  const strong = m.vs.slice(0, 4);
  const weak = m.vs.slice(-4).reverse();
  const row = (r: (typeof m.vs)[number]) => (
    <li key={r.other.id}>
      <HeroChip hero={r.other} size={30} />
      <span className="mini-match__vals">
        <WinRate value={r.winRate} />
        <Delta value={r.delta} />
      </span>
    </li>
  );
  return (
    <Panel
      title={t('hero.matchups')}
      right={
        <Link to={`/heroes/${hero.slug}/matchups`} className="link-more">
          {t('hero.all')}
        </Link>
      }
    >
      {m.error ? (
        <ErrorState error={m.error} />
      ) : m.isLoading ? (
        <Skeleton h={220} />
      ) : (
        <div className="mini-match">
          <div>
            <h4 className="mini-match__title is-good">{t('hero.strongVs')}</h4>
            <ul>{strong.map(row)}</ul>
          </div>
          <div>
            <h4 className="mini-match__title is-bad">{t('hero.weakVs')}</h4>
            <ul>{weak.map(row)}</ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------- positions ------------------------------- */
/** Dota-style role ratings (carry / playmaker / pick / support, 0–10). */
function PositionsPanel({ hero }: { hero: Hero }) {
  const { t } = useT();
  const scores = heroRoleScores(hero);
  if (!scores) return null;
  return (
    <Panel title={t('pos.title')} right={<PositionChips hero={hero} compact colored />}>
      <RoleBars scores={scores} colored />
      <p className="positions-panel__scale">{t('pos.scale')}</p>
    </Panel>
  );
}

/* -------------------------------- base stats ----------------------------- */
function BaseStats({ hero }: { hero: Hero }) {
  const { t } = useT();
  const { byClass } = useItems();
  const w = heroWeapon(hero, byClass)?.weapon_info as Record<string, number> | undefined;
  const s = hero.starting_stats;
  const v = (k: string) => s[k]?.value;
  const bullets = (w?.bullets as number) || 1;
  const dps = w?.bullet_damage && w?.cycle_time ? (w.bullet_damage * bullets) / w.cycle_time : undefined;
  const num = (x: number | undefined, digits = 2) => (x === undefined ? undefined : fmtNum(x, Number.isInteger(x) ? 0 : digits));

  const groups: { title: MsgKey; tone: string; stats: [MsgKey, string | undefined][] }[] = [
    {
      title: 'hero.vitality',
      tone: 'vitality',
      stats: [
        ['hero.health', num(v('max_health'))],
        ['hero.regen', v('base_health_regen') !== undefined ? t('hero.unitPerSec', { v: num(v('base_health_regen'))! }) : undefined],
        ['hero.moveSpeed', v('max_move_speed') !== undefined ? t('hero.unitMs', { v: num(v('max_move_speed'))! }) : undefined],
        ['hero.sprint', v('sprint_speed') !== undefined ? `+${t('hero.unitMs', { v: num(v('sprint_speed'))! })}` : undefined],
        ['hero.stamina', num(v('stamina'))],
      ],
    },
    {
      title: 'hero.weapon',
      tone: 'weapon',
      stats: [
        ['hero.dps', dps ? fmtNum(dps, 1) : undefined],
        ['hero.bulletDmg', w?.bullet_damage ? `${fmtNum(w.bullet_damage, 2)}${bullets > 1 ? ` ×${bullets}` : ''}` : undefined],
        ['hero.fireRate', w?.cycle_time ? t('hero.unitPerSec', { v: fmtNum(1 / w.cycle_time, 2) }) : undefined],
        ['hero.ammo', num(w?.clip_size as number | undefined)],
        ['hero.melee', v('light_melee_damage') ? `${num(v('light_melee_damage'))} / ${num(v('heavy_melee_damage'))}` : undefined],
      ],
    },
  ];

  return (
    <Panel title={t('hero.baseStats')}>
      <div className="base-stats">
        {groups.map((g) => (
          <div key={g.title} className={`base-stats__group tone-${g.tone}`}>
            <h4>{t(g.title)}</h4>
            <dl>
              {g.stats
                .filter(([, val]) => val !== undefined)
                .map(([label, val]) => (
                  <div key={label}>
                    <dt>{t(label)}</dt>
                    <dd className="num">{val}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------ top builds ------------------------------- */
function TopBuilds({ hero, abilities }: { hero: Hero; abilities: Item[] }) {
  const { t } = useT();
  const stats = useHeroBuildStats(hero.id);
  const top = useMemo(() => [...(stats.data ?? [])].sort((a, b) => b.matches - a.matches).slice(0, 3), [stats.data]);
  const { builds, isLoading } = useBuildsByIds(top.map((s) => s.hero_build_id));
  const profiles = useSteamProfiles(useMemo(() => builds.map((b) => b.hero_build.author_account_id), [builds]));
  const statById = new Map(top.map((s) => [s.hero_build_id, s]));

  return (
    <section>
      <SectionTitle
        eyebrow={t('hero.communityBuilds')}
        title={t('hero.mostPlayedBuilds')}
        right={
          <Link to={`/heroes/${hero.slug}/builds`} className="link-more">
            {t('hero.allBuilds')}
          </Link>
        }
      />
      <div className="build-list">
        {stats.isLoading || isLoading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} h={120} r={12} />)
        ) : builds.length === 0 ? (
          <Empty>{t('hero.noBuildData')}</Empty>
        ) : (
          builds.map((b, i) => (
            <BuildCard
              key={b.hero_build.hero_build_id}
              build={b}
              rank={i + 1}
              stat={statById.get(b.hero_build.hero_build_id)}
              profile={profiles.get(b.hero_build.author_account_id)}
              abilities={abilities}
              defaultOpen={i === 0}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ---------------------------------- tab ---------------------------------- */
export function HeroOverview({ hero, abilities }: { hero: Hero; abilities: Item[] }) {
  const { t } = useT();
  return (
    <div className="hero-overview">
      <div className="hero-overview__main">
        <SectionTitle eyebrow={t('hero.kit')} title={t('hero.abilities')} />
        <div className="ability-grid">
          {abilities.length
            ? abilities.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AbilityCard ability={a} index={i} />
                </motion.div>
              ))
            : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={118} r={12} />)}
        </div>
        <SkillOrder hero={hero} abilities={abilities} />
        <TopBuilds hero={hero} abilities={abilities} />
        <HeroPros hero={hero} />
      </div>
      <aside className="hero-overview__side">
        <PositionsPanel hero={hero} />
        <CoreItems hero={hero} />
        <MatchupsMini hero={hero} />
        <BaseStats hero={hero} />
      </aside>
    </div>
  );
}
