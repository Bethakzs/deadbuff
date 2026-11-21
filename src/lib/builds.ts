import type { MsgKey } from '../i18n/en';
import type { HeroBuild } from './types';

/** The game's default category names come as localisation tokens ("#Citadel_HeroBuilds_EarlyGame"). */
const CAT_TOKENS: Record<string, MsgKey> = {
  early: 'build.cat.early',
  earlygame: 'build.cat.early',
  lane: 'build.cat.lane',
  mid: 'build.cat.mid',
  midgame: 'build.cat.mid',
  late: 'build.cat.late',
  lategame: 'build.cat.late',
};

/**
 * Display name of a build category: the author's own name as is, a game token translated, any other
 * token (or no name) → "Section N". `t` is the app's or the prerender's translate function.
 */
export function buildCategoryName(name: string | null | undefined, index: number, t: (key: MsgKey, vars?: Record<string, string | number>) => string): string {
  const raw = (name ?? '').trim();
  if (!raw.startsWith('#')) return raw || t('build.section', { n: index + 1 });
  const key = CAT_TOKENS[raw.replace(/^#Citadel_HeroBuilds_/i, '').toLowerCase()];
  return key ? t(key) : t('build.section', { n: index + 1 });
}

/** Builds revealed per "Show more" click. */
export const BUILD_STEP = 10;
/** API page size for build searches. */
export const BUILD_PAGE = 50;

/**
 * Flattens paginated /builds results, keeping the first copy of each build id —
 * pages can overlap when many builds tie on the sort key (e.g. equal favourites).
 */
export function uniqueBuilds(pages: HeroBuild[][] | undefined): HeroBuild[] {
  const seen = new Set<number>();
  return (pages ?? []).flat().filter((b) => {
    const id = b.hero_build.hero_build_id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
