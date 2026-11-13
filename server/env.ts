/* ------------------------------------------------------------------ *
 * Runtime configuration of the Pages Functions (functions/api/**).
 * Everything is optional: without DB / SESSION_SECRET the API proxy still
 * works and the account endpoints answer 503 "not_configured".
 *
 * Cloudflare dashboard → Workers & Pages → deadbuff → Settings:
 *   Bindings → D1 database, variable name `DB`
 *   Variables and Secrets → `SESSION_SECRET` (type Secret, long random string)
 * ------------------------------------------------------------------ */
export interface Env {
  /** D1 (SQLite) database: users, favourites, login throttle. Tables are created on first use. */
  DB?: D1Database;
  /** Signs the session cookie (HMAC-SHA256). Changing it logs everybody out. */
  SESSION_SECRET?: string;
  /**
   * PBKDF2-SHA256 rounds for NEW password hashes (default 60000 — fits the Free plan's 10 ms CPU limit;
   * Workers caps it at 100000). The count is stored in every hash, so raising it later is safe:
   * old hashes keep working and are upgraded on the next login.
   */
  PBKDF2_ITERATIONS?: string;
  /** Optional Deadlock API key — the proxy sends it as X-API-KEY (higher rate limits). */
  DEADLOCK_API_KEY?: string;
}

export type Fn<P extends string = string> = PagesFunction<Env, P>;

/** D1 + secret, or null when accounts aren't set up on this deployment. */
export function accountEnv(env: Env): { db: D1Database; secret: string } | null {
  return env.DB && env.SESSION_SECRET && env.SESSION_SECRET.length >= 16 ? { db: env.DB, secret: env.SESSION_SECRET } : null;
}
