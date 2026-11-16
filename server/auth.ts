/* Shared glue for the account endpoints: config check, current user, validation rules. */
import { parseAccountInput } from '../src/lib/steam';
import { accountEnv, type Env } from './env';
import { nameKey, publicUser, userById, type UserRow } from './db';
import { fail } from './http';
import { readSession } from './session';

export interface AuthCtx {
  db: D1Database;
  secret: string;
}

/** Account config, or a 503 the SPA shows as "accounts aren't available yet". */
export function needAccounts(env: Env): AuthCtx | Response {
  return accountEnv(env) ?? fail('not_configured', 503);
}

/** The logged-in user (row), or null. */
export async function currentUser(ctx: AuthCtx, req: Request): Promise<UserRow | null> {
  const id = await readSession(ctx.secret, req);
  return id ? userById(ctx.db, id) : null;
}

/** ADMIN_USERS lists this user — by Deadbuff username (any case) or by the linked Steam account. */
export function isAdmin(env: Env, u: UserRow | null): boolean {
  if (!u || !env.ADMIN_USERS) return false;
  return env.ADMIN_USERS.split(/[\s,;]+/)
    .filter(Boolean)
    .some((token) => nameKey(token) === nameKey(u.username) || (u.account_id !== null && parseAccountInput(token) === u.account_id));
}

/** What the SPA gets for the logged-in user: the public fields + `admin: true` for the owner. */
export const userPayload = (env: Env, u: UserRow) => ({ ...publicUser(u), ...(isAdmin(env, u) ? { admin: true } : {}) });

/** Letters (any script), digits, "_", "-", "." — 3 to 24 characters. */
export const USERNAME = /^[\p{L}\p{N}_.-]{3,24}$/u;
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Steam persona name → a valid username base ("[TAG] Dr. Who!" → "TAG_Dr.Who"). */
export function usernameFromPersona(name: string | undefined): string {
  const base = (name ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_.-]/gu, '')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 18);
  return base.length >= 3 ? base : `player${base}`;
}
