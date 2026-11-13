/* POST /api/auth/login { login (username or e-mail), password } → { user } + session cookie. */
import { needAccounts, PASSWORD_MAX } from '../../../server/auth';
import { publicUser, setPassHash, throttle, touchLogin, userByLogin } from '../../../server/db';
import type { Fn } from '../../../server/env';
import { clientIp, fail, json, readJson, sameOrigin } from '../../../server/http';
import { hashPassword, roundsFrom, verifyPassword } from '../../../server/password';
import { sessionCookies } from '../../../server/session';

export const onRequestPost: Fn = async ({ request, env, waitUntil }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  if (!sameOrigin(request)) return fail('bad_origin', 403);

  const body = await readJson<{ login?: unknown; password?: unknown }>(request);
  const login = typeof body?.login === 'string' ? body.login.trim().normalize('NFKC') : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!login || !password || login.length > 254 || password.length > PASSWORD_MAX) return fail('bad_credentials', 401);

  // 15 attempts per 15 minutes per IP — slows down password guessing
  if (!(await throttle(ctx.db, `login:${clientIp(request)}`, 15, 900))) return fail('too_many', 429);

  const rounds = roundsFrom(env.PBKDF2_ITERATIONS);
  const user = await userByLogin(ctx.db, login);
  if (!user?.pass_hash) {
    // same work as a real check, so the answer time doesn't reveal whether the account exists
    await hashPassword(password, rounds);
    return fail('bad_credentials', 401);
  }
  const check = await verifyPassword(password, user.pass_hash);
  if (!check.ok) return fail('bad_credentials', 401);

  waitUntil(touchLogin(ctx.db, user.id).then(() => undefined));
  // the iteration setting was raised since this hash was made → upgrade it now that we know the password
  if (check.rounds < rounds) waitUntil(hashPassword(password, rounds).then((h) => setPassHash(ctx.db, user.id, h)).then(() => undefined));
  return json({ user: publicUser(user) }, {}, await sessionCookies(ctx.secret, user.id));
};
