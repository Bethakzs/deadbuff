import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { heroIcon, heroRgb } from '../lib/heroes';
import type { Hero } from '../lib/types';

export function HeroAvatar({ hero, size = 36 }: { hero: Hero; size?: number }) {
  return (
    <span className="hero-avatar" style={{ ['--hero' as string]: heroRgb(hero), width: size, height: size }}>
      <img src={heroIcon(hero)} alt="" loading="lazy" />
    </span>
  );
}

/** Avatar + name, linking to the hero page. */
export function HeroChip({ hero, size = 36, sub }: { hero: Hero; size?: number; sub?: ReactNode }) {
  return (
    <Link to={`/heroes/${hero.slug}`} className="hero-chip" style={{ ['--hero' as string]: heroRgb(hero) }}>
      <HeroAvatar hero={hero} size={size} />
      <span className="hero-chip__text">
        <span className="hero-chip__name">{hero.name}</span>
        {sub && <span className="hero-chip__sub">{sub}</span>}
      </span>
    </Link>
  );
}
