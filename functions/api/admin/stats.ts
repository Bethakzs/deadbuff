/*
 * GET /api/admin/stats?days=7|30|90|0 → AdminStats (server/stats.ts), only for the users listed in ADMIN_USERS.
 *   401 unauthorized — not logged in · 403 forbidden — logged in, not an admin (the SPA shows "owner only")
 */
import { currentUser, isAdmin, needAccounts } from '../../../server/auth';
import type { Fn } from '../../../server/env';
import { fail, json } from '../../../server/http';
import { adminStats } from '../../../server/stats';

const PERIODS = [7, 30, 90, 0];

export const onRequestGet: Fn = async ({ request, env }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  const user = await currentUser(ctx, request);
  if (!user) return fail('unauthorized', 401);
  if (!isAdmin(env, user)) return fail('forbidden', 403);
  const asked = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const days = PERIODS.includes(asked) ? asked : 30;
  return json(await adminStats(ctx.db, days));
};
