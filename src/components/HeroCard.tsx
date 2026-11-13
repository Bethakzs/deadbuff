import { motion } from 'framer-motion';
import { forwardRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { fmtPct } from '../lib/format';
import { useT, type MsgKey } from '../i18n';
import { heroCard, heroRgb, roleOf, type HeroRow } from '../lib/heroes';
import type { Hero } from '../lib/types';
import { PositionChips } from './Position';
import { TierBadge } from './UI';
import { WinRate } from './WinRate';

/** Moves a soft light under the cursor (CSS vars, no re-render). */
function track(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

interface Props {
  hero: Hero;
  row?: HeroRow;
  index?: number;
  size?: 'sm' | 'md';
  showTier?: boolean;
}

/**
 * Portrait card: hero art on a hero-tinted backdrop, swaps to the "gloat" pose on hover.
 * forwardRef + layout="position" so grids can use <AnimatePresence mode="popLayout"> when filtering:
 * cards glide to their new slot without being scaled.
 */
export const HeroCard = forwardRef<HTMLDivElement, Props>(function HeroCard({ hero, row, index = 0, size = 'md', showTier }, ref) {
  const { t } = useT();
  const gloat = hero.images.hero_card_gloat_webp;
  return (
    <motion.div
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
      transition={{
        duration: 0.45,
        delay: Math.min(index * 0.025, 0.6),
        ease: [0.22, 1, 0.36, 1],
        layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      <Link
        to={`/heroes/${hero.slug}`}
        className={`hero-card hero-card--${size}`}
        style={{ ['--hero' as string]: heroRgb(hero) }}
        onMouseMove={track}
      >
        <div className="hero-card__art">
          <img className="hero-card__img" src={heroCard(hero)} alt={hero.name} loading="lazy" decoding="async" />
          {gloat && <img className="hero-card__img hero-card__img--alt" src={gloat} alt="" loading="lazy" decoding="async" />}
        </div>
        <span className="hero-card__pos">
          <PositionChips hero={hero} max={1} compact />
        </span>
        {showTier && row && (
          <span className="hero-card__tier">
            <TierBadge tier={row.tier} size="sm" />
          </span>
        )}
        <div className="hero-card__foot">
          <span className="hero-card__name">{hero.name}</span>
          {row ? (
            <span className="hero-card__stats">
              <WinRate value={row.winRate} />
              <span className="hero-card__pick num">{t('stat.pickShort', { pct: fmtPct(row.pickRate) })}</span>
            </span>
          ) : (
            <span className="hero-card__role">{t(`role.${roleOf(hero)}` as MsgKey)}</span>
          )}
        </div>
      </Link>
    </motion.div>
  );
});
