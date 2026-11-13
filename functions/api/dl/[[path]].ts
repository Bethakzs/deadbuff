/* ------------------------------------------------------------------ *
 * GET /api/dl/<path>?<query>  →  https://api.deadlock-api.com/v1/<path>?<query>
 *
 * Same-origin caching proxy for the Deadlock API. The upstream answers a
 * cold analytics query in 1–5 s; this keeps every answer in Cloudflare's
 * edge cache and serves it instantly, refreshing it in the background once
 * it is older than its `fresh` time (stale-while-revalidate). Only the very
 * first visitor of a query (per data centre) waits for the API.
 *
 * Only GET, only the API sections the site uses. Responses carry
 * `x-proxy-upstream: 1` when they come from the API (even errors like a 404
 * "match not parsed yet") — the SPA falls back to calling the API directly
 * when that header is missing (Function quota exceeded, outage…).
 * ------------------------------------------------------------------ */
import type { Env, Fn } from '../../../server/env';

const UPSTREAM = 'https://api.deadlock-api.com/v1/';
const SECTIONS = /^(assets|analytics|builds|players|matches|leaderboard|patches)(\/|$)/;

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

interface Policy {
  /** seconds an answer counts as fresh */
  fresh: number;
  /** seconds a stale answer may still be served while it is refreshed (0 = no stale serving) */
  stale: number;
  /** browser cache (max-age) */
  browser: number;
}

function policy(path: string): Policy {
  if (/^matches\/\d+\/metadata$/.test(path)) return { fresh: 30 * DAY, stale: 0, browser: DAY }; // immutable once parsed
  if (path.startsWith('assets/')) return { fresh: 6 * HOUR, stale: 7 * DAY, browser: HOUR };
  if (path.startsWith('analytics/')) return { fresh: HOUR, stale: 2 * DAY, browser: 10 * MIN };
  if (path.startsWith('patches')) return { fresh: HOUR, stale: 7 * DAY, browser: 30 * MIN };
  if (path.startsWith('leaderboard/')) return { fresh: 15 * MIN, stale: DAY, browser: 5 * MIN };
  if (path === 'builds') return { fresh: 15 * MIN, stale: DAY, browser: 5 * MIN };
  if (path === 'players/steam') return { fresh: HOUR, stale: 7 * DAY, browser: 30 * MIN };
  if (path === 'players/rank') return { fresh: 15 * MIN, stale: DAY, browser: 5 * MIN };
  // match history, hero stats, mate stats, one player's rank: change after every game → short, no stale
  return { fresh: 2 * MIN, stale: 0, browser: MIN };
}

/** Same query in any parameter order → one cache entry. */
function canonicalQuery(url: URL): string {
  const pairs = [...url.searchParams].filter(([, v]) => v !== '').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(pairs).toString();
}

/** One upstream request per cache key at a time inside this isolate. */
const inflight = new Map<string, Promise<Response>>();

async function fetchUpstream(env: Env, path: string, query: string): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'deadbuff.net proxy' };
  if (env.DEADLOCK_API_KEY) headers['x-api-key'] = env.DEADLOCK_API_KEY;
  return fetch(`${UPSTREAM}${path}${query ? `?${query}` : ''}`, { headers });
}

/** Fetches from the API and stores a cacheable copy (200 for its policy, 404 for a minute). */
function refresh(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, cacheKey: Request, path: string, query: string, p: Policy): Promise<Response> {
  const key = cacheKey.url;
  const running = inflight.get(key);
  if (running) return running.then((r) => r.clone());
  const task = (async () => {
    const res = await fetchUpstream(env, path, query);
    const keep = res.status === 200 ? p.fresh + p.stale : res.status === 404 ? MIN : 0;
    const body = await res.arrayBuffer();
    const stored = new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': `public, max-age=${keep}`,
        'x-fetched-at': String(Date.now()),
      },
    });
    if (keep > 0) ctx.waitUntil(caches.default.put(cacheKey, stored.clone()));
    return stored;
  })();
  inflight.set(key, task);
  task.finally(() => inflight.delete(key)).catch(() => undefined);
  return task.then((r) => r.clone());
}

/** Copy for the browser: its own Cache-Control, a debug header, and the marker the SPA checks. */
function toClient(res: Response, p: Policy, state: 'hit' | 'stale' | 'miss'): Response {
  const out = new Response(res.body, res);
  out.headers.set('cache-control', res.status === 200 ? `public, max-age=${p.browser}` : 'no-store');
  out.headers.set('x-cache', state);
  out.headers.set('x-proxy-upstream', '1');
  out.headers.delete('x-fetched-at');
  return out;
}

export const onRequestGet: Fn<'path'> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean).join('/');
  if (!SECTIONS.test(path) || path.length > 200 || url.search.length > 4000) {
    return new Response('Not found', { status: 404 });
  }

  const p = policy(path);
  const query = canonicalQuery(url);
  const cacheKey = new Request(`${url.origin}/api/dl/${path}${query ? `?${query}` : ''}`, { method: 'GET' });

  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const age = (Date.now() - Number(cached.headers.get('x-fetched-at') ?? 0)) / 1000;
    if (age <= p.fresh || cached.status !== 200) return toClient(cached, p, 'hit');
    if (p.stale > 0) {
      // serve the old copy right away, refresh behind it
      context.waitUntil(refresh(env, context, cacheKey, path, query, p).catch(() => undefined));
      return toClient(cached, p, 'stale');
    }
  }

  try {
    const res = await refresh(env, context, cacheKey, path, query, p);
    // the API is struggling but we still have an older answer: better than an error
    if (res.status >= 500 && cached) return toClient(cached, p, 'stale');
    return toClient(res, p, 'miss');
  } catch {
    if (cached) return toClient(cached, p, 'stale');
    return new Response(JSON.stringify({ error: 'upstream_unreachable' }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-proxy-upstream': '1' },
    });
  }
};
