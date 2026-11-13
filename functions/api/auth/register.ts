/* POST /api/auth/register { username, email, password } → { user } + session cookie. No e-mail confirmation (owner's call). */
import { EMAIL, needAccounts, PASSWORD_MAX, PASSWORD_MIN, USERNAME } from '../../../server/auth';
import { createUser, emailTaken, publicUser, throttle, usernameTaken } from '../../../server/db';
import type { Fn } from '../../../server/env';
import { clientIp, fail, json, readJson, sameOrigin } from '../../../server/http';
import { hashPassword, roundsFrom } from '../../../server/password';
import { sessionCookies } from '../../../server/session';

export const onRequestPost: Fn = async ({ request, env }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  if (!sameOrigin(request)) return fail('bad_origin', 403);

  const body = await readJson<{ username?: unknown; email?: unknown; password?: unknown }>(request);
  const username = typeof body?.username === 'string' ? body.username.trim().normalize('NFKC') : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!USERNAME.test(username)) return fail('username_invalid');
  if (!EMAIL.test(email) || email.length > 254) return fail('email_invalid');
  if (password.length < PASSWORD_MIN) return fail('password_short');
  if (password.length > PASSWORD_MAX) return fail('password_long');

  if (!(await throttle(ctx.db, `register:${clientIp(request)}`, 6, 3600))) return fail('too_many', 429);
  if (await usernameTaken(ctx.db, username)) return fail('username_taken', 409);
  if (await emailTaken(ctx.db, email)) return fail('email_taken', 409);

  const passHash = await hashPassword(password, roundsFrom(env.PBKDF2_ITERATIONS));
  let user;
  try {
    user = await createUser(ctx.db, { username, email, passHash, accountId: null });
  } catch {
    // lost a race with an identical sign-up
    return fail('username_taken', 409);
  }
  if (!user) return fail('server_error', 500);
  return json({ user: publicUser(user) }, {}, await sessionCookies(ctx.secret, user.id));
};
