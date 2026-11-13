import { HERO_ROLES, ROLE_KEYS, type RoleKey, type RoleScores } from '../data/roles';
import type { Hero } from './types';

export { ROLE_KEYS };
export type { RoleKey, RoleScores };

/** Role ("position") ratings of a hero, or undefined for a hero we haven't rated yet. */
export function heroRoleScores(hero: Hero): RoleScores | undefined {
  return HERO_ROLES[hero.slug];
}

/** A role counts as a hero's position when it is rated ≥ 7. */
export const STRONG_ROLE = 7;

/**
 * True when the ratings don't single anything out (all four equal). The owner does NOT want such
 * heroes labelled "flex/universal" — they get no position and must be reported so the owner can
 * re-rate them in data/roles.ts.
 */
export function isUndecided(s: RoleScores) {
  return ROLE_KEYS.every((k) => s[k] === s[ROLE_KEYS[0]]);
}

/**
 * The hero's positions, strongest first: every role rated ≥ 7, plus the top-rated
 * role(s) so heroes without a 7+ still have a position. Undecided heroes get none.
 * Used for chips (first 2) and for the position filter (all of them).
 */
export function heroPositions(hero: Hero): RoleKey[] {
  const s = heroRoleScores(hero);
  if (!s || isUndecided(s)) return [];
  const top = Math.max(...ROLE_KEYS.map((k) => s[k]));
  return ROLE_KEYS.filter((k) => s[k] >= STRONG_ROLE || s[k] === top).sort((x, y) => s[y] - s[x]);
}

export const playsPosition = (hero: Hero, role: RoleKey) => heroPositions(hero).includes(role);
