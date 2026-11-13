/*
 * GET    /api/me → { user } (null when logged out; a stale session cookie is cleared)
 * DELETE /api/me → deletes the account and its favourites, logs out
 */
import { currentUser } from '../../../server/auth';
import { deleteUser, publicUser } from '../../../server/db';
import { accountEnv, type Fn } from '../../../server/env';
import { fail, json, sameOrigin } from '../../../server/http';
import { clearCookies, hasSessionCookie } from '../../../server/session';

export const onRequestGet: Fn = async ({ request, env }) => {
  const ctx = accountEnv(env);
  // accounts not configured → simply "nobody is logged in"
  const user = ctx ? await currentUser(ctx, request) : null;
  if (user) return json({ user: publicUser(user) });
  return json({ user: null }, {}, hasSessionCookie(request) ? clearCookies() : []);
};

export const onRequestDelete: Fn = async ({ request, env }) => {
  const ctx = accountEnv(env);
  if (!ctx) return fail('not_configured', 503);
  if (!sameOrigin(request)) return fail('bad_origin', 403);
  const user = await currentUser(ctx, request);
  if (!user) return fail('unauthorized', 401);
  await deleteUser(ctx.db, user.id);
  return json({ ok: true }, {}, clearCookies());
};
