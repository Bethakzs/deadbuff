import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { FavButton } from '../../components/FavButton';
import { FilterBar } from '../../components/FilterBar';
import { PositionChips } from '../../components/Position';
import { CountUp, ErrorState, Page, Skeleton, TierBadge } from '../../components/UI';
import { useHeroes, useItems } from '../../hooks/useAssets';
import { useLaneAgg } from '../../hooks/useHeroData';
import { useHeroRows } from '../../hooks/useStats';
import { bestLane, heroLaneProfile } from '../../lib/lanes';
import { useT, type MsgKey } from '../../i18n';
import { fmtCompact, fmtNum, fmtPct, wrTone } from '../../lib/format';
import { trimDot } from '../../lib/html';
import { useDocumentMeta } from '../../lib/seo';
import { heroAbilities, heroBg, heroCard, heroRgb, roleOf } from '../../lib/heroes';
import type { Hero } from '../../lib/types';
import { HeroBuilds } from './HeroBuilds';
import { HeroItems } from './HeroItems';
import { HeroLore } from './HeroLore';
import { HeroMatchups } from './HeroMatchups';
import { HeroOverview } from './HeroOverview';

export const HERO_TABS = ['overview', 'builds', 'items', 'matchups', 'lore'] as const;
export type HeroTab = (typeof HERO_TABS)[number];

function HeroHeader({ hero }: { hero: Hero }) {
  const { t, lang } = useT();
  const { rows, isLoading } = useHeroRows();
  const row = rows.find((r) => r.hero.id === hero.id);
  const wrRank = row ? [...rows].sort((a, b) => b.winRate - a.winRate).findIndex((r) => r.hero.id === hero.id) + 1 : 0;
  const role = t(`role.${roleOf(hero)}` as MsgKey);
  // The SVG logotype spells the English name — use it whenever the localised name is the same, else typeset it.
  const useLogo = hero.name === hero.name_en && hero.images.name_image;
  const { lanes, agg } = useLaneAgg();
  const best = useMemo(() => (agg ? bestLane(heroLaneProfile(agg, hero.id, lanes)) : undefined), [agg, hero.id, lanes]);

  return (
    <section className="hero-head">
      <motion.img
        key={hero.id}
        className="hero-head__bg"
        src={heroBg(hero)}
        alt=""
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="hero-head__shade" />
      <div className="container hero-head__inner">
        <motion.div
          className="hero-head__portrait"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src={heroCard(hero)} alt={hero.name} />
        </motion.div>

        <div className="hero-head__info">
          <motion.nav className="crumbs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <Link to="/heroes">{t('hero.crumbs')}</Link>
            <span>/</span>
            <span>{role}</span>
          </motion.nav>

          <motion.div
            key={`${hero.id}-${lang}`}
            className="hero-head__name"
            // The name has a wide glow (drop-shadow / text-shadow): reveal it with generous negative
            // insets (same units at both ends so it interpolates) and drop the clip once done,
            // otherwise the glow is cut into a hard-edged box
            initial={{ clipPath: 'inset(-100% 140% -100% -40%)' }}
            animate={{ clipPath: 'inset(-100% -40% -100% -40%)', transitionEnd: { clipPath: 'none' } }}
            transition={{ delay: 0.15, duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          >
            {useLogo ? (
              <>
                <img src={hero.images.name_image} alt={hero.name} />
                <h1 className="sr-only">{hero.name}</h1>
              </>
            ) : (
              <h1 className="display hero-head__name-text">{hero.name}</h1>
            )}
          </motion.div>

          {hero.description.role && (
            <motion.p className="hero-head__role serif" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              “{trimDot(hero.description.role)}”
            </motion.p>
          )}

          <motion.div className="hero-head__tags" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
            <FavButton kind="hero" id={hero.id} label />
            <span className="chip chip--hero">{role}</span>
            <PositionChips hero={hero} colored />
            {hero.complexity ? (
              <span className="chip" title={t('hero.complexity')}>
                {t('hero.complexity')}
                <span className="pips">
                  {[1, 2, 3].map((n) => (
                    <i key={n} className={n <= Math.min(hero.complexity!, 3) ? 'on' : ''} />
                  ))}
                </span>
              </span>
            ) : null}
            {(hero.tags ?? []).map((tag) => (
              <span key={tag} className="chip chip--ghost">
                {tag}
              </span>
            ))}
            {/* secondary info — deliberately last */}
            {best && (
              <span className="lane-chip" style={{ ['--lane' as string]: best.lane.rgb }} title={t('lane.explain')}>
                <i aria-hidden />
                {t('lane.bestLane', { lane: best.lane.name })}
              </span>
            )}
          </motion.div>

          <motion.dl className="hero-head__stats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}>
            {isLoading || !row ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} w={96} h={54} />)
            ) : (
              <>
                <div className="hstat hstat--tier">
                  <dt>{t('stat.tier')}</dt>
                  <dd>
                    <TierBadge tier={row.tier} size="lg" />
                  </dd>
                </div>
                <div className="hstat">
                  <dt>{t('stat.winRate')}</dt>
                  <dd className={`wr wr--${wrTone(row.winRate)}`}>
                    <CountUp value={row.winRate} format={(n) => fmtPct(n, 2)} />
                  </dd>
                </div>
                <div className="hstat">
                  <dt>{t('stat.pickRate')}</dt>
                  <dd>
                    <CountUp value={row.pickRate} format={(n) => fmtPct(n)} />
                  </dd>
                </div>
                <div className="hstat">
                  <dt>{t('stat.kda')}</dt>
                  <dd>
                    <CountUp value={row.kda} format={(n) => fmtNum(n, 2)} />
                  </dd>
                </div>
                <div className="hstat">
                  <dt>{t('stat.matches')}</dt>
                  <dd>
                    <CountUp value={row.stat.matches} format={fmtCompact} />
                  </dd>
                </div>
                <div className="hstat">
                  <dt>{t('stat.wrRank')}</dt>
                  <dd>
                    #{wrRank}
                    <small>/{rows.length}</small>
                  </dd>
                </div>
              </>
            )}
          </motion.dl>
        </div>
      </div>
    </section>
  );
}

export function HeroPage() {
  const { slug = '', tab = 'overview' } = useParams();
  const { t } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const hero = heroes.bySlug.get(slug);
  const abilities = useMemo(() => (hero && items.byClass.size ? heroAbilities(hero, items.byClass) : []), [hero, items.byClass]);

  // Tint the page glow with the hero's colour.
  useEffect(() => {
    if (!hero) return;
    const root = document.documentElement;
    root.style.setProperty('--hero', heroRgb(hero));
    return () => {
      root.style.removeProperty('--hero');
    };
  }, [hero]);

  // Same title/description scheme as scripts/prerender.ts (one title per tab, hero name in both languages).
  const heroRows = useHeroRows();
  const wr = hero ? heroRows.rows.find((r) => r.hero.id === hero.id)?.winRate : undefined;
  const tabKey = (HERO_TABS as readonly string[]).includes(tab) ? (tab as HeroTab) : 'overview';
  useDocumentMeta(
    hero ? t(`meta.hero.${tabKey}` as MsgKey, { name: hero.name, en: hero.name_en }) : undefined,
    hero ? t('meta.desc.hero', { name: hero.name, en: hero.name_en, wr: wr ? fmtPct(wr) : '—' }) : undefined,
  );

  if (heroes.error)
    return (
      <Page>
        <div className="container">
          <ErrorState error={heroes.error} onRetry={() => heroes.refetch()} />
        </div>
      </Page>
    );
  if (heroes.isLoading) {
    return (
      <Page>
        <div className="container">
          <Skeleton h={360} r={14} />
        </div>
      </Page>
    );
  }
  if (!hero) return <Navigate to="/heroes" replace />;
  if (!(HERO_TABS as readonly string[]).includes(tab)) return <Navigate to={`/heroes/${slug}`} replace />;

  const base = `/heroes/${hero.slug}`;

  return (
    <Page className="hero-page">
      <div style={{ ['--hero' as string]: heroRgb(hero) }}>
        <HeroHeader hero={hero} />

        <div className="hero-tabs-bar">
          <div className="container hero-tabs-bar__inner">
            <nav className="tabs">
              {HERO_TABS.map((id) => (
                <NavLink key={id} to={id === 'overview' ? base : `${base}/${id}`} end className={() => `tabs__link ${tab === id ? 'is-active' : ''}`}>
                  {t(`hero.tab.${id}`)}
                  {tab === id && <motion.span layoutId="hero-tab" className="tabs__underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                </NavLink>
              ))}
            </nav>
            {tab !== 'lore' && <FilterBar />}
          </div>
        </div>

        <div className="container hero-body">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === 'overview' && <HeroOverview hero={hero} abilities={abilities} />}
              {tab === 'builds' && <HeroBuilds hero={hero} abilities={abilities} />}
              {tab === 'items' && <HeroItems hero={hero} />}
              {tab === 'matchups' && <HeroMatchups hero={hero} />}
              {tab === 'lore' && <HeroLore hero={hero} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Page>
  );
}
