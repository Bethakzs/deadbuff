import type { HeroBuild } from './types';

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
