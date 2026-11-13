import type { Hero, HeroStat, Item } from './types';

export const heroSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const ROLES = ['marksman', 'mystic', 'brawler', 'assassin', 'flex'] as const;
export type Role = (typeof ROLES)[number];

/** Role key (translate with t(`role.${key}`)). Heroes without hero_type are "flex". */
export const roleOf = (h: Hero): Role =>
  h.hero_type && (ROLES as readonly string[]).includes(h.hero_type) ? (h.hero_type as Role) : 'flex';

/** Hero accent color from the API (`colors.ui`), as an "r, g, b" triple for CSS rgb(var(--hero) / a). */
export function heroRgb(h?: Hero): string {
  const c = h?.colors?.ui ?? h?.colors?.style;
  return c ? `${c[0]} ${c[1]} ${c[2]}` : '217 169 91';
}

export const heroCard = (h: Hero) => h.images.icon_hero_card_webp ?? h.images.icon_hero_card ?? '';
export const heroIcon = (h: Hero) => h.images.icon_image_small_webp ?? h.images.icon_image_small ?? '';
export const heroBg = (h: Hero) => h.images.background_image_webp ?? h.images.background_image ?? '';

/** The 4 castable abilities, in slot order (1-3 = signature, 4 = ultimate). */
export function heroAbilities(h: Hero, itemsByClass: Map<string, Item>): Item[] {
  return ['signature1', 'signature2', 'signature3', 'signature4']
    .map((slot) => itemsByClass.get(h.items[slot]))
    .filter((x): x is Item => Boolean(x));
}

export const heroWeapon = (h: Hero, itemsByClass: Map<string, Item>) => itemsByClass.get(h.items.weapon_primary);

/* ------------------------- derived hero stats ----------------------- */

export interface HeroRow {
  hero: Hero;
  stat: HeroStat;
  winRate: number;
  pickRate: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  souls: number;
  damage: number;
  accuracy: number;
  /** matches behind winRate/pickRate (overall, or in one lane for lane rows) */
  matches: number;
  tier: Tier;
  score: number;
}

/**
 * Tier = percentile of a score that is mostly win rate, nudged by popularity
 * (a 54% hero nobody plays is less "meta" than a 53% hero everyone plays).
 * Mutates `score` and `tier`. Used for overall rows and per-lane rows.
 */
export function assignTiers<T extends { winRate: number; pickRate: number; score: number; tier: Tier }>(rows: T[]) {
  for (const r of rows) r.score = (r.winRate - 0.5) * 100 + Math.log2(Math.max(r.pickRate, 0.005) / 0.167) * 0.6;
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  sorted.forEach((r, i) => {
    const p = i / Math.max(sorted.length - 1, 1);
    r.tier = p < 0.1 ? 'S' : p < 0.3 ? 'A' : p < 0.65 ? 'B' : p < 0.88 ? 'C' : 'D';
  });
}

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

/**
 * Builds the meta table rows.
 * - pick rate: each match has 12 heroes, so total matches = Σ(hero matches) / 12
 * - tier: see assignTiers()
 */
export function buildHeroRows(heroes: Hero[], stats: HeroStat[]): HeroRow[] {
  const byId = new Map(heroes.map((h) => [h.id, h]));
  const valid = stats.filter((s) => byId.has(s.hero_id) && s.matches > 0);
  const totalMatches = valid.reduce((a, s) => a + s.matches, 0) / 12 || 1;

  const rows: HeroRow[] = valid.map((s) => {
    const hero = byId.get(s.hero_id)!;
    const kills = s.total_kills / s.matches;
    const deaths = s.total_deaths / s.matches;
    const assists = s.total_assists / s.matches;
    const shots = s.total_shots_hit + s.total_shots_missed;
    return {
      hero,
      stat: s,
      winRate: s.wins / s.matches,
      pickRate: s.matches / totalMatches,
      kda: (kills + assists) / Math.max(deaths, 0.01),
      kills,
      deaths,
      assists,
      souls: s.total_net_worth / s.matches,
      damage: s.total_player_damage / s.matches,
      accuracy: shots ? s.total_shots_hit / shots : 0,
      matches: s.matches,
      tier: 'C',
      score: 0,
    };
  });

  assignTiers(rows);
  return rows;
}
