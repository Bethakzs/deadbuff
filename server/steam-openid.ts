/* ------------------------------------------------------------------ *
 * "Sign in through Steam" = OpenID 2.0 (Steam has no OAuth). The password
 * never touches our site and no API key is needed.
 *
 *   1. redirect to steamcommunity.com/openid/login (checkid_setup)
 *   2. Steam sends the user back to return_to with openid.* params
 *   3. MANDATORY: post those params back with mode=check_authentication and
 *      require "is_valid:true" — without it anyone could forge a login
 * ------------------------------------------------------------------ */
import { steam64ToAccountId } from '../src/lib/steam';

/** Short-lived HttpOnly cookie with the login nonce (path-scoped to /api/auth/steam). */
export const NONCE_COOKIE = 'db_oid';

const OP = 'https://steamcommunity.com/openid/login';
const ID_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function steamRedirectUrl(returnTo: string, realm: string): string {
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': ID_SELECT,
    'openid.claimed_id': ID_SELECT,
  });
  return `${OP}?${p}`;
}

/**
 * Verifies Steam's answer on our callback URL. Returns the Deadlock account id and the
 * return_to URL Steam signed (our own query params — mode, next, nonce — are read from it,
 * not from the outer URL), or null when anything is off.
 */
export async function verifySteamCallback(url: URL): Promise<{ accountId: number; returnTo: URL } | null> {
  const p = url.searchParams;
  if (p.get('openid.mode') !== 'id_res' || p.get('openid.op_endpoint') !== OP) return null;
  const claimed = p.get('openid.claimed_id') ?? '';
  const m = claimed.match(CLAIMED);
  if (!m || p.get('openid.identity') !== claimed) return null;

  let returnTo: URL;
  try {
    returnTo = new URL(p.get('openid.return_to') ?? '');
  } catch {
    return null;
  }
  // the answer must be for THIS callback
  if (returnTo.origin !== url.origin || returnTo.pathname !== url.pathname) return null;

  const body = new URLSearchParams();
  for (const [k, v] of p) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  const res = await fetch(OP, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!/^is_valid\s*:\s*true\s*$/m.test(text)) return null;

  return { accountId: steam64ToAccountId(m[1]), returnTo };
}
