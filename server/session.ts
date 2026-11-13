/* ------------------------------------------------------------------ *
 * Stateless sessions: an HttpOnly cookie `db_session = <userId>.<expires>.<hmac>`
 * signed with SESSION_SECRET (HMAC-SHA256, Web Crypto — verified in constant time).
 *
 * A second, script-readable cookie `db_auth=1` carries no secret: it only tells the SPA that a
 * session exists, so guests never call /api/me (one request — and one Function invocation — saved
 * on every page load).
 * ------------------------------------------------------------------ */
import { b64url, fromB64url, getCookie, nowSec } from './http';

const COOKIE = 'db_session';
const HINT = 'db_auth';
export const SESSION_DAYS = 30;
const MAX_AGE = SESSION_DAYS * 86400;

let cached: { secret: string; key: Promise<CryptoKey> } | null = null;
function hmacKey(secret: string): Promise<CryptoKey> {
  if (cached?.secret !== secret) {
    const key = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    cached = { secret, key };
  }
  return cached.key;
}

const cookie = (name: string, value: string, maxAge: number, httpOnly: boolean) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}`;

/** Set-Cookie headers that log `userId` in for 30 days. */
export async function sessionCookies(secret: string, userId: number): Promise<string[]> {
  const payload = `${userId}.${nowSec() + MAX_AGE}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload)));
  return [cookie(COOKIE, `${payload}.${b64url(sig)}`, MAX_AGE, true), cookie(HINT, '1', MAX_AGE, false)];
}

/** Set-Cookie headers that log out. */
export const clearCookies = () => [cookie(COOKIE, '', 0, true), cookie(HINT, '', 0, false)];

/** The logged-in user id, or null (no cookie, bad signature or expired). */
export async function readSession(secret: string, req: Request): Promise<number | null> {
  const raw = getCookie(req, COOKIE);
  const m = raw?.match(/^(\d{1,12})\.(\d{1,12})\.([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const [, id, exp, sig] = m;
  if (Number(exp) < nowSec()) return null;
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromB64url(sig);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, new TextEncoder().encode(`${id}.${exp}`));
  return ok ? Number(id) : null;
}

/** True when the request carries any session cookie (valid or not) — used to clean up stale ones. */
export const hasSessionCookie = (req: Request) => getCookie(req, COOKIE) !== null || getCookie(req, HINT) !== null;
