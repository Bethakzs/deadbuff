/* ------------------------------------------------------------------ *
 * D1 (SQLite) access. The schema below is the single source of truth:
 * tables are created automatically the first time a query hits a missing
 * table, so a fresh D1 database needs no manual migration — just bind it
 * as `DB`. Add columns with a new `ALTER TABLE` entry at the end of SCHEMA
 * (each statement must be safe to run again).
 * ------------------------------------------------------------------ */
import { nowSec } from './http';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     username      TEXT NOT NULL,
     -- lower-cased username: SQLite NOCASE only folds ASCII, this keeps "Тестер" and "тестер" one name
     username_key  TEXT NOT NULL UNIQUE,
     -- stored lower-cased
     email         TEXT UNIQUE,
     pass_hash     TEXT,
     account_id    INTEGER UNIQUE,
     created_at    INTEGER NOT NULL,
     last_login_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS favorites (
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind       TEXT NOT NULL CHECK (kind IN ('hero', 'build')),
     ref_id     INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, kind, ref_id)
   )`,
  `CREATE TABLE IF NOT EXISTS auth_throttle (
     key      TEXT PRIMARY KEY,
     hits     INTEGER NOT NULL,
     reset_at INTEGER NOT NULL
   )`,
  // ---- site statistics for the owner (/admin), see server/stats.ts ----
  // sign-ups, sign-ins and Steam links; user_id is cleared when the account is deleted
  `CREATE TABLE IF NOT EXISTS auth_events (
     id      INTEGER PRIMARY KEY AUTOINCREMENT,
     kind    TEXT NOT NULL,
     user_id INTEGER,
     at      INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS auth_events_at ON auth_events (at)`,
  // logged-in users seen per UTC day (one row per user and day — /api/me)
  `CREATE TABLE IF NOT EXISTS user_days (
     user_id INTEGER NOT NULL,
     day     TEXT NOT NULL,
     PRIMARY KEY (user_id, day)
   )`,
  // page views per UTC day and path (counted by the SPA's beacon, bots skipped)
  `CREATE TABLE IF NOT EXISTS page_views (
     day   TEXT NOT NULL,
     path  TEXT NOT NULL,
     views INTEGER NOT NULL,
     PRIMARY KEY (day, path)
   )`,
  // unique visitors per day: a salted daily hash of IP + browser, no cookie, can't be traced back
  `CREATE TABLE IF NOT EXISTS day_visitors (
     day TEXT NOT NULL,
     vid TEXT NOT NULL,
     PRIMARY KEY (day, vid)
   )`,
  // one row per visit (session): the same daily visitor hash with less than 30 minutes between pages.
  // user_id = logged-in account, country = Cloudflare geo, ref = host of the external referrer
  `CREATE TABLE IF NOT EXISTS visits (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     day        TEXT NOT NULL,
     vid        TEXT NOT NULL,
     user_id    INTEGER,
     started_at INTEGER NOT NULL,
     last_at    INTEGER NOT NULL,
     views      INTEGER NOT NULL,
     lang       TEXT NOT NULL,
     country    TEXT,
     device     TEXT NOT NULL,
     browser    TEXT NOT NULL,
     os         TEXT NOT NULL,
     ref        TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS visits_vid ON visits (vid)`,
  `CREATE INDEX IF NOT EXISTS visits_day ON visits (day)`,
  // the pages of a visit in order (n = 1, 2, …); path without the language prefix
  `CREATE TABLE IF NOT EXISTS visit_pages (
     visit_id INTEGER NOT NULL,
     n        INTEGER NOT NULL,
     at       INTEGER NOT NULL,
     path     TEXT NOT NULL,
     PRIMARY KEY (visit_id, n)
   ) WITHOUT ROWID`,
];

/** Runs `fn`; if a table is missing (fresh database) creates the schema and runs it once more. */
export async function q<T>(db: D1Database, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!/no such table/i.test(String(e))) throw e;
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    return fn();
  }
}

/* -------------------------------- users ------------------------------- */

export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  pass_hash: string | null;
  account_id: number | null;
  created_at: number;
  last_login_at: number;
}

/** What the SPA gets from /api/me (never the hash). */
export interface PublicUser {
  id: number;
  username: string;
  email: string | null;
  /** linked Steam account (SteamID3 / Deadlock account_id) */
  accountId: number | null;
  hasPassword: boolean;
  createdAt: number;
}

export const publicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  email: u.email,
  accountId: u.account_id,
  hasPassword: !!u.pass_hash,
  createdAt: u.created_at,
});

export const userById = (db: D1Database, id: number) =>
  q(db, () => db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>());

/** Case-insensitive key of a username (any script). */
export const nameKey = (username: string) => username.normalize('NFKC').toLowerCase();

/** Login by username OR e-mail (both case-insensitive). */
export const userByLogin = (db: D1Database, login: string) =>
  q(db, () => db.prepare('SELECT * FROM users WHERE username_key = ?1 OR email = ?1').bind(nameKey(login)).first<UserRow>());

export const userByAccount = (db: D1Database, accountId: number) =>
  q(db, () => db.prepare('SELECT * FROM users WHERE account_id = ?').bind(accountId).first<UserRow>());

export async function usernameTaken(db: D1Database, username: string) {
  return !!(await q(db, () => db.prepare('SELECT 1 AS x FROM users WHERE username_key = ?').bind(nameKey(username)).first()));
}

export async function emailTaken(db: D1Database, email: string) {
  return !!(await q(db, () => db.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(email.toLowerCase()).first()));
}

export function createUser(
  db: D1Database,
  u: { username: string; email: string | null; passHash: string | null; accountId: number | null },
): Promise<UserRow | null> {
  const now = nowSec();
  return q(db, () =>
    db
      .prepare('INSERT INTO users (username, username_key, email, pass_hash, account_id, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
      .bind(u.username, nameKey(u.username), u.email?.toLowerCase() ?? null, u.passHash, u.accountId, now, now)
      .first<UserRow>(),
  );
}

export const touchLogin = (db: D1Database, id: number) =>
  q(db, () => db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowSec(), id).run());

export const setPassHash = (db: D1Database, id: number, hash: string) =>
  q(db, () => db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(hash, id).run());

export const setAccount = (db: D1Database, id: number, accountId: number | null) =>
  q(db, () => db.prepare('UPDATE users SET account_id = ? WHERE id = ? RETURNING *').bind(accountId, id).first<UserRow>());

export async function deleteUser(db: D1Database, id: number) {
  await q(db, () =>
    db.batch([
      db.prepare('DELETE FROM favorites WHERE user_id = ?').bind(id),
      db.prepare('DELETE FROM user_days WHERE user_id = ?').bind(id),
      // keep the counts, forget who
      db.prepare('UPDATE auth_events SET user_id = NULL WHERE user_id = ?').bind(id),
      db.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ]),
  );
}

/* ------------------------------ favourites ----------------------------- */

export type FavKind = 'hero' | 'build';
export interface Fav {
  kind: FavKind;
  id: number;
}
export const MAX_FAVORITES = 300;

export const isFav = (x: unknown): x is Fav => {
  const f = x as Fav;
  return !!f && (f.kind === 'hero' || f.kind === 'build') && Number.isInteger(f.id) && f.id > 0 && f.id < 2 ** 31;
};

export async function listFavorites(db: D1Database, userId: number): Promise<Fav[]> {
  const res = await q(db, () =>
    db.prepare('SELECT kind, ref_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all<{ kind: FavKind; ref_id: number }>(),
  );
  return (res.results ?? []).map((r) => ({ kind: r.kind, id: r.ref_id }));
}

export async function addFavorites(db: D1Database, userId: number, favs: Fav[]) {
  if (!favs.length) return;
  const now = nowSec();
  await q(db, () =>
    db.batch(
      favs.map((f, i) =>
        // newer first: a bulk import keeps its order by giving each row its own second
        db.prepare('INSERT OR IGNORE INTO favorites (user_id, kind, ref_id, created_at) VALUES (?, ?, ?, ?)').bind(userId, f.kind, f.id, now - i),
      ),
    ),
  );
}

export const removeFavorite = (db: D1Database, userId: number, f: Fav) =>
  q(db, () => db.prepare('DELETE FROM favorites WHERE user_id = ? AND kind = ? AND ref_id = ?').bind(userId, f.kind, f.id).run());

export async function countFavorites(db: D1Database, userId: number): Promise<number> {
  const row = await q(db, () => db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').bind(userId).first<{ n: number }>());
  return row?.n ?? 0;
}

/* -------------------------------- throttle ----------------------------- */

/**
 * Fixed-window counter: returns false once `key` was hit more than `limit` times in `windowS` seconds.
 * One UPSERT per call; expired rows are swept now and then.
 */
export async function throttle(db: D1Database, key: string, limit: number, windowS: number): Promise<boolean> {
  const now = nowSec();
  const row = await q(db, () =>
    db
      .prepare(
        `INSERT INTO auth_throttle (key, hits, reset_at) VALUES (?1, 1, ?2 + ?3)
         ON CONFLICT(key) DO UPDATE SET
           hits = CASE WHEN reset_at <= ?2 THEN 1 ELSE hits + 1 END,
           reset_at = CASE WHEN reset_at <= ?2 THEN ?2 + ?3 ELSE reset_at END
         RETURNING hits`,
      )
      .bind(key, now, windowS)
      .first<{ hits: number }>(),
  );
  if (Math.random() < 0.02) await db.prepare('DELETE FROM auth_throttle WHERE reset_at < ?').bind(now).run();
  return (row?.hits ?? 0) <= limit;
}
