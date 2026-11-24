/*
 * GET /api/auth/steam/callback?mode=…&next=…&n=…&openid.*=…  (Steam sends the user here)
 *   login: the Steam account's user, or a new one named after the Steam persona → session → `next`
 *   link:  attaches the Steam account to the logged-in user → `next?steam=linked|taken`
 * Any failure → `next?steam=error`.
 */
import { currentUser, needAccounts, usernameFromPersona } from '../../../../server/auth';
import { createUser, setAccount, touchLogin, userByAccount, usernameTaken } from '../../../../server/db';
import type { Env, Fn } from '../../../../server/env';
import { getCookie, safeNext } from '../../../../server/http';
import { sessionCookies } from '../../../../server/session';
import { logEvent } from '../../../../server/stats';
import { NONCE_COOKIE, verifySteamCallback } from '../../../../server/steam-openid';

const clearNonce = `${NONCE_COOKIE}=; Path=/api/auth/steam; Max-Age=0; Secure; SameSite=Lax; HttpOnly`;

function redirect(origin: string, next: string, steam: string | null, cookies: string[] = []): Response {
  const to = new URL(next, origin);
  if (steam) to.searchParams.set('steam', steam);
  const headers = new Headers({ location: to.pathname + to.search, 'cache-control': 'no-store' });
  for (const c of [clearNonce, ...cookies]) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

/**
 * Steam persona name for a new account's username (best effort): the Deadlock API first, with the same user agent
 * and key as the proxy (the first Steam accounts all got "player-1234", so the bare request gave no name here),
 * then the public Steam profile XML.
 */
async function personaName(env: Env, accountId: number): Promise<string | undefined> {
  try {
    const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'deadbuff.net' };
    if (env.DEADLOCK_API_KEY) headers['x-api-key'] = env.DEADLOCK_API_KEY;
    const res = await fetch(`https://api.deadlock-api.com/v1/players/steam?account_ids=${accountId}`, { headers });
    const list = res.ok ? ((await res.json()) as { personaname?: string }[]) : [];
    if (list[0]?.personaname) return list[0].personaname;
  } catch {
    /* fall through to Steam */
  }
  try {
    const steam64 = (BigInt(accountId) + 76561197960265728n).toString();
    const res = await fetch(`https://steamcommunity.com/profiles/${steam64}/?xml=1`, { headers: { 'user-agent': 'deadbuff.net' } });
    const xml = res.ok ? await res.text() : '';
    return xml.match(/<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/)?.[1];
  } catch {
    return undefined;
  }
}

export const onRequestGet: Fn = async ({ request, env, waitUntil }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);

  const verified = await verifySteamCallback(url).catch(() => null);
  const mode = verified?.returnTo.searchParams.get('mode') === 'link' ? 'link' : 'login';
  const next = safeNext(verified?.returnTo.searchParams.get('next'), mode === 'link' ? '/account' : '/me');
  const nonce = getCookie(request, NONCE_COOKIE);
  if (!verified || !nonce || verified.returnTo.searchParams.get('n') !== nonce) {
    return redirect(url.origin, mode === 'link' ? next : '/login', 'error');
  }
  const { accountId } = verified;
  const owner = await userByAccount(ctx.db, accountId);

  if (mode === 'link') {
    const me = await currentUser(ctx, request);
    if (!me) return redirect(url.origin, '/login', 'error');
    if (owner && owner.id !== me.id) return redirect(url.origin, next, 'taken');
    if (!owner) {
      await setAccount(ctx.db, me.id, accountId);
      waitUntil(logEvent(ctx.db, 'link_steam', me.id));
    }
    return redirect(url.origin, next, 'linked');
  }

  // sign in with the account this Steam id belongs to, or create one
  let user = owner;
  if (user) {
    waitUntil(touchLogin(ctx.db, user.id).then(() => undefined));
    waitUntil(logEvent(ctx.db, 'login_steam', user.id));
  } else {
    const base = usernameFromPersona(await personaName(env, accountId));
    let name = base;
    for (let i = 0; i < 6 && (await usernameTaken(ctx.db, name)); i++) name = `${base.slice(0, 19)}-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      user = await createUser(ctx.db, { username: name, email: null, passHash: null, accountId });
      if (user) waitUntil(logEvent(ctx.db, 'register_steam', user.id));
    } catch {
      user = await userByAccount(ctx.db, accountId); // a parallel callback created it first
    }
  }
  if (!user) return redirect(url.origin, '/login', 'error');
  return redirect(url.origin, next, null, await sessionCookies(ctx.secret, user.id));
};
