/* ------------------------------------------------------------------ *
 * Build-time snapshots of Deadlock API answers.
 *
 * Every call to our proxy (/api/dl) is a Pages Function invocation, and the Free plan allows
 * 100k a day — a hero page alone used to make ~17. So `scripts/prerender.ts` saves the answers
 * the site asks for with the DEFAULT filters (all ranks, 7 days) — game assets in every language,
 * hero / item / counter stats, top builds, their authors — as static files in dist/data/.
 * Static files are free and unlimited; `lib/api.ts` looks a query up here first and only falls
 * back to the proxy for everything else (other filters, players, matches, leaderboard).
 *
 * Shared by the SPA (lookup) and the prerender (writing) so both compute the same file names.
 * ------------------------------------------------------------------ */

export const SNAPSHOT_DIR = 'data';
/** List of the snapshots in this build — the SPA reads it once per page load. */
export const SNAPSHOT_INDEX = `${SNAPSHOT_DIR}/index.json`;
/** Older snapshots are ignored (the scheduled rebuild has been failing) → the proxy takes over again. */
export const SNAPSHOT_MAX_AGE_MS = 2 * 86_400_000;
/** Steam profiles of build authors, split by account_id % STEAM_SHARDS so a page loads only a few small files. */
export const STEAM_SHARDS = 8;
export const steamShardFile = (shard: number) => `${SNAPSHOT_DIR}/steam-${shard}.json`;

export interface SnapshotIndex {
  /** build time (ms) */
  at: number;
  /** snapshotHash() of every saved query */
  keys: string[];
  /** account ids found in the steam-N.json shards */
  steam: number[];
}

type Params = Record<string, string | number | boolean | null | undefined>;

const DAY = 86_400;

/**
 * One key per query, independent of the day it is made on: params sorted, empty ones dropped, and an open
 * window `min_unix_timestamp = dayStart(N)` written as `days=N` — so the "last 7 days" saved by this morning's
 * build still answers "last 7 days" after midnight UTC (it is then at most a day older, like the static pages).
 */
export function snapshotKey(path: string, params: Params): string {
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const open = params.max_unix_timestamp === undefined || params.max_unix_timestamp === null || params.max_unix_timestamp === '';
  const pairs: [string, string][] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    const ago = typeof v === 'number' ? today - v : NaN;
    if (k === 'min_unix_timestamp' && open && ago >= 0 && ago % DAY === 0) pairs.push(['days', String(ago / DAY)]);
    else pairs.push([k, String(v)]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${path}?${new URLSearchParams(pairs)}`;
}

/** File name of a snapshot (53-bit cyrb53 hash in base 36) — same result in the browser and in Node. */
export function snapshotHash(key: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const snapshotFile = (hash: string) => `${SNAPSHOT_DIR}/${hash}.json`;
