/*
 * Favourite heroes and builds of the logged-in user.
 *   GET    /api/favorites                         → { items: [{ kind, id }] } (newest first)
 *   POST   /api/favorites { kind, id }            → add one
 *   POST   /api/favorites { items: [{kind,id}] }  → add many (guest favourites merged on login)
 *   DELETE /api/favorites { kind, id }            → remove one
 * Every answer returns the full list, so the SPA just replaces its copy.
 */
import { currentUser, needAccounts } from '../../server/auth';
import { addFavorites, countFavorites, isFav, listFavorites, MAX_FAVORITES, removeFavorite, type Fav } from '../../server/db';
import type { Fn } from '../../server/env';
import { fail, json, readJson, sameOrigin } from '../../server/http';

export const onRequest: Fn = async ({ request, env }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  const user = await currentUser(ctx, request);
  if (!user) return fail('unauthorized', 401);

  if (request.method === 'GET') return json({ items: await listFavorites(ctx.db, user.id) });
  if (request.method !== 'POST' && request.method !== 'DELETE') return fail('method', 405);
  if (!sameOrigin(request)) return fail('bad_origin', 403);

  const body = await readJson<Fav & { items?: unknown[] }>(request, 32_000);
  if (request.method === 'DELETE') {
    if (!isFav(body)) return fail('bad_request');
    await removeFavorite(ctx.db, user.id, body);
  } else {
    const items = (Array.isArray(body?.items) ? body.items : [body]).filter(isFav).slice(0, MAX_FAVORITES);
    if (!items.length) return fail('bad_request');
    if ((await countFavorites(ctx.db, user.id)) + items.length > MAX_FAVORITES) return fail('too_many_favorites', 400);
    await addFavorites(ctx.db, user.id, items.map((f) => ({ kind: f.kind, id: f.id })));
  }
  return json({ items: await listFavorites(ctx.db, user.id) });
};
