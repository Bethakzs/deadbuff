/*
 * POST /api/nav {"p":"/uk/heroes/haze","r":"https://www.twitch.tv/…"} — one page view, sent by the SPA with
 * navigator.sendBeacon on every route change (production builds only; `r` = document.referrer, first view of a
 * page load only). Always answers 204: the page never waits for it or sees errors.
 * Bots, other origins, odd paths, /admin and the owner's accounts (ADMIN_USERS) are dropped. No cookie is set:
 * unique visitors and visits are a salted daily hash (server/stats.ts); the session cookie, when there is one,
 * only tells whose visit it is. robots.txt disallows /api/ except /api/dl/, so Googlebot's renders don't count.
 */
import { isAdmin } from '../../server/auth';
import { userById } from '../../server/db';
import { accountEnv, type Fn } from '../../server/env';
import { sameOrigin } from '../../server/http';
import { readSession } from '../../server/session';
import { isBot, normalizePath, recordView, refHost, visitorId } from '../../server/stats';

const done = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export const onRequestPost: Fn = async ({ request, env, waitUntil }) => {
  const ctx = accountEnv(env);
  if (!ctx || !sameOrigin(request) || isBot(request)) return done();
  const text = await request.text().catch(() => '');
  if (!text || text.length > 1000) return done();
  let body: { p?: unknown; r?: unknown };
  try {
    body = JSON.parse(text) as { p?: unknown; r?: unknown };
  } catch {
    return done();
  }
  const path = normalizePath(body?.p);
  if (!path) return done();
  const country = (request.cf as { country?: unknown } | undefined)?.country;
  const ua = request.headers.get('user-agent') ?? '';
  waitUntil(
    (async () => {
      const uid = await readSession(ctx.secret, request);
      const user = uid ? await userById(ctx.db, uid) : null;
      if (isAdmin(env, user)) return; // the owner's own views are not counted
      const vid = await visitorId(ctx.secret, request);
      await recordView(ctx.db, {
        path,
        vid,
        userId: user?.id ?? null,
        country: typeof country === 'string' && /^[A-Z][A-Z0-9]$/.test(country) ? country : null,
        ua,
        ref: refHost(body.r, request),
      });
    })().catch(() => undefined),
  );
  return done();
};
