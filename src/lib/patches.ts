/* ------------------------------------------------------------------ *
 * Patch timeline + before/after windows for the patch impact page.
 * Pure functions — also used by scripts/prerender.ts.
 * ------------------------------------------------------------------ */
import { buildHeroRows } from './heroes';
import type { Hero, HeroStat, Patch } from './types';

const DAY = 86400;

export interface PatchPoint {
  /** "YYYY-MM-DD" (UTC) — the day the patch went live; also the ?patch= URL value */
  day: string;
  /** unix seconds, 00:00 UTC of that day */
  start: number;
  /** official changelog post, when the day matches one */
  link?: string;
  /** listed by the API as a big gameplay patch day */
  big: boolean;
}

/** "09-29-2026 Update" → "2026-09-29" (the forum post date can be weeks later than the patch). */
function dayFromTitle(title: string): string | undefined {
  const m = title.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

/** Changelog posts + big patch days merged into one list, newest first. */
export function patchTimeline(patches: Patch[] = [], bigDays: string[] = [], limit = 16): PatchPoint[] {
  const map = new Map<string, PatchPoint>();
  for (const iso of bigDays) {
    const day = iso.slice(0, 10);
    map.set(day, { day, start: dayStart(day), big: true });
  }
  for (const p of patches) {
    const day = dayFromTitle(p.title) ?? p.pub_date.slice(0, 10);
    const prev = map.get(day);
    map.set(day, {
      day,
      start: dayStart(day),
      link: p.link,
      big: prev?.big ?? false,
    });
  }
  return [...map.values()]
    .filter((p) => Number.isFinite(p.start))
    .sort((a, b) => b.start - a.start)
    .slice(0, limit);
}

export interface PatchWindows {
  before: { min: number; max: number };
  after: { min: number; max: number };
  /** length of the "after" window in days (0 = the patch is too fresh to judge) */
  afterDays: number;
}

/**
 * Up to `span` days before the patch day vs up to `span` days from the day after it.
 * The patch day itself is skipped (mixed versions), and each window stops at the neighbouring
 * patch so another update doesn't leak into the comparison. Rounded to the hour (stable cache keys).
 */
export function patchWindows(timeline: PatchPoint[], index: number, nowS = Date.now() / 1000, span = 7): PatchWindows {
  const p = timeline[index];
  const newer = timeline[index - 1];
  const older = timeline[index + 1];
  const hour = (t: number) => Math.floor(t / 3600) * 3600;
  const before = {
    min: Math.max(p.start - span * DAY, older ? older.start + DAY : -Infinity),
    max: p.start,
  };
  const afterMin = p.start + DAY;
  const afterMax = hour(Math.min(afterMin + span * DAY, newer ? newer.start : Infinity, nowS));
  return {
    before,
    after: { min: afterMin, max: Math.max(afterMin, afterMax) },
    afterDays: Math.max(0, (afterMax - afterMin) / DAY),
  };
}

export interface PatchImpactRow {
  hero: Hero;
  wrBefore: number;
  wrAfter: number;
  prBefore: number;
  prAfter: number;
  matchesAfter: number;
  dWr: number;
  dPr: number;
}

/** Per-hero win rate / pick rate change; heroes with too few games on either side are left out. */
export function patchImpact(heroes: Hero[], before: HeroStat[], after: HeroStat[], minMatches = 200): PatchImpactRow[] {
  const a = new Map(buildHeroRows(heroes, before).map((r) => [r.hero.id, r]));
  const b = new Map(buildHeroRows(heroes, after).map((r) => [r.hero.id, r]));
  const out: PatchImpactRow[] = [];
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y || x.stat.matches < minMatches || y.stat.matches < minMatches) continue;
    out.push({
      hero: x.hero,
      wrBefore: x.winRate,
      wrAfter: y.winRate,
      prBefore: x.pickRate,
      prAfter: y.pickRate,
      matchesAfter: y.stat.matches,
      dWr: y.winRate - x.winRate,
      dPr: y.pickRate - x.pickRate,
    });
  }
  return out.sort((p, q) => q.dWr - p.dWr);
}
