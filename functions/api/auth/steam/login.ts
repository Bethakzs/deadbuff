/*
 * GET /api/auth/steam/login?mode=login|link&next=/path → 302 to Steam's OpenID page.
 *   mode=login (default): sign in / sign up with Steam
 *   mode=link: attach a Steam account to the logged-in user
 * A random nonce goes both into return_to (signed by Steam) and into a short-lived HttpOnly cookie;
 * the callback requires them to match, so nobody can push a foreign Steam login into your browser.
 */
import { needAccounts } from '../../../../server/auth';
import type { Fn } from '../../../../server/env';
import { randomToken, safeNext } from '../../../../server/http';
import { NONCE_COOKIE, steamRedirectUrl } from '../../../../server/steam-openid';

export const onRequestGet: Fn = async ({ request, env }) => {
  const ctx = needAccounts(env);
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'link' ? 'link' : 'login';
  const next = safeNext(url.searchParams.get('next'), mode === 'link' ? '/account' : '/me');
  const nonce = randomToken();

  const back = new URL('/api/auth/steam/callback', url.origin);
  back.searchParams.set('mode', mode);
  back.searchParams.set('next', next);
  back.searchParams.set('n', nonce);

  return new Response(null, {
    status: 302,
    headers: {
      location: steamRedirectUrl(back.toString(), url.origin),
      'set-cookie': `${NONCE_COOKIE}=${nonce}; Path=/api/auth/steam; Max-Age=900; Secure; SameSite=Lax; HttpOnly`,
      'cache-control': 'no-store',
    },
  });
};
