/*
 * POST /api/nav {"p":"/uk/heroes/haze"} — one page view, sent by the SPA with navigator.sendBeacon on every
 * route change (production builds only). Always answers 204: the page never waits for it or sees errors.
 * Bots, other origins and odd paths are dropped. No cookie: unique visitors are a salted daily hash
 * (server/stats.ts). robots.txt disallows /api/ except /api/dl/, so Googlebot's renders don't count.
 */
import { accountEnv, type Fn } from '../../server/env';
import { sameOrigin } from '../../server/http';
import { isBot, normalizePath, recordView, visitorId } from '../../server/stats';

const done = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export const onRequestPost: Fn = async ({ request, env, waitUntil }) => {
  const ctx = accountEnv(env);
  if (!ctx || !sameOrigin(request) || isBot(request)) return done();
  const text = await request.text().catch(() => '');
  if (!text || text.length > 400) return done();
  let path: string | null = null;
  try {
    path = normalizePath((JSON.parse(text) as { p?: unknown }).p);
  } catch {
    return done();
  }
  if (!path) return done();
  waitUntil(visitorId(ctx.secret, request).then((vid) => recordView(ctx.db, path!, vid)));
  return done();
};
