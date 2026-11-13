/* DELETE /api/me/steam → unlinks the Steam account (only when the user can still log in with a password). */
import { currentUser, needAccounts } from '../../../server/auth';
import { publicUser, setAccount } from '../../../server/db';
import type { Fn } from '../../../server/env';
import { fail, json, sameOrigin } from '../../../server/http';

export const onRequestDelete: Fn = async ({ request, env }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  if (!sameOrigin(request)) return fail('bad_origin', 403);
  const user = await currentUser(ctx, request);
  if (!user) return fail('unauthorized', 401);
  if (!user.pass_hash) return fail('needs_password', 400);
  const updated = await setAccount(ctx.db, user.id, null);
  return json({ user: publicUser(updated ?? { ...user, account_id: null }) });
};
