/* ------------------------------------------------------------------ *
 * Site statistics for the owner (/admin): accounts, sign-ins, page views.
 *
 *   auth_events   register_password | register_steam | login_password | login_steam | link_steam
 *   user_days     logged-in users seen per UTC day (/api/me)
 *   page_views    views per UTC day and path (POST /api/nav from the SPA; bots are skipped)
 *   day_visitors  unique visitors per day — SHA-256(day + IP + user agent + SESSION_SECRET), truncated:
 *                 no cookie, a new value every day, can't be turned back into an IP
 *
 * Sign-up method of EVERY account (also the ones from before this log existed) comes from the users
 * table itself: accounts made through Steam never get a password, so pass_hash IS NULL = Steam sign-up.
 * Tables are created on first use like the rest of the schema (server/db.ts).
 * ------------------------------------------------------------------ */
import { q } from './db';
import { clientIp, nowSec } from './http';

export type AuthEvent = 'register_password' | 'register_steam' | 'login_password' | 'login_steam' | 'link_steam';
const EVENTS: AuthEvent[] = ['register_password', 'register_steam', 'login_password', 'login_steam', 'link_steam'];

/** UTC day, "2026-11-17". */
export const today = () => new Date().toISOString().slice(0, 10);

/** Never fails the request it rides along with (called through waitUntil). */
const quiet = (p: Promise<unknown>) => p.then(() => undefined).catch(() => undefined);

export const logEvent = (db: D1Database, kind: AuthEvent, userId: number) =>
  quiet(q(db, () => db.prepare('INSERT INTO auth_events (kind, user_id, at) VALUES (?, ?, ?)').bind(kind, userId, nowSec()).run()));

export const markActive = (db: D1Database, userId: number) =>
  quiet(q(db, () => db.prepare('INSERT OR IGNORE INTO user_days (user_id, day) VALUES (?, ?)').bind(userId, today()).run()));

/* ------------------------------ page views ----------------------------- */

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|discord|telegram|whatsapp|curl|wget|python|axios|node-fetch|go-http/i;
export const isBot = (req: Request) => BOT.test(req.headers.get('user-agent') ?? '') || !req.headers.get('user-agent');

/**
 * "/uk/players/123/" → "/uk/players/:id". Only plain site paths are kept (the slugs are lower-case
 * latin), so junk can't fill the table. Player and match ids are folded — one row per section.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  let p = raw.split(/[?#]/)[0].toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  p = p.replace(/\/(players|matches)\/\d+/, '/$1/:id');
  return /^\/[a-z0-9\-/:]{0,120}$/.test(p) ? p : null;
}

export async function visitorId(secret: string, req: Request): Promise<string> {
  const data = `${today()}|${clientIp(req)}|${req.headers.get('user-agent') ?? ''}|${secret}`;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return [...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function recordView(db: D1Database, path: string, vid: string) {
  const day = today();
  return quiet(
    q(db, () =>
      db.batch([
        db.prepare('INSERT INTO page_views (day, path, views) VALUES (?, ?, 1) ON CONFLICT (day, path) DO UPDATE SET views = views + 1').bind(day, path),
        db.prepare('INSERT OR IGNORE INTO day_visitors (day, vid) VALUES (?, ?)').bind(day, vid),
      ]),
    ),
  );
}

/* ------------------------------- the report ----------------------------- */

export interface AdminStats {
  /** period in days, 0 = all time */
  days: number;
  users: {
    total: number;
    steam: number;
    password: number;
    /** password accounts that linked Steam later */
    passwordLinked: number;
    /** signed up in the period */
    newTotal: number;
    newSteam: number;
    newPassword: number;
    /** logged-in users seen in the period */
    active: number;
    favorites: number;
    favoriteUsers: number;
  };
  signups: { day: string; steam: number; password: number }[];
  /** counts in the period */
  events: Record<AuthEvent, number>;
  /** first logged event (unix) — sign-ins are counted from then on */
  eventsSince: number | null;
  recent: { username: string; viaSteam: boolean; steamLinked: boolean; createdAt: number; lastLoginAt: number }[];
  traffic: {
    /** first day with counted views */
    since: string | null;
    views: number;
    /** sum of the daily unique visitors */
    visitors: number;
    byDay: { day: string; views: number; visitors: number }[];
    /** paths without the language prefix */
    top: { path: string; views: number }[];
    langs: { lang: string; views: number }[];
  };
}

const LANG_PREFIX = /^\/(uk|de|es|ru)(?=\/|$)/;

export async function adminStats(db: D1Database, days: number): Promise<AdminStats> {
  const sinceSec = days ? nowSec() - days * 86400 : 0;
  const sinceDay = days ? new Date((nowSec() - (days - 1) * 86400) * 1000).toISOString().slice(0, 10) : '0000-00-00';
  const [users, signups, active, events, eventsSince, favs, recent, byDay, paths, trafficSince] = await q(db, () =>
    db.batch([
      db
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(pass_hash IS NULL), 0) AS steam,
                  COALESCE(SUM(pass_hash IS NOT NULL), 0) AS password,
                  COALESCE(SUM(pass_hash IS NOT NULL AND account_id IS NOT NULL), 0) AS passwordLinked,
                  COALESCE(SUM(created_at >= ?1), 0) AS newTotal,
                  COALESCE(SUM(created_at >= ?1 AND pass_hash IS NULL), 0) AS newSteam,
                  COALESCE(SUM(created_at >= ?1 AND pass_hash IS NOT NULL), 0) AS newPassword
           FROM users`,
        )
        .bind(sinceSec),
      db
        .prepare(
          `SELECT date(created_at, 'unixepoch') AS day, SUM(pass_hash IS NULL) AS steam, SUM(pass_hash IS NOT NULL) AS password
           FROM users WHERE created_at >= ? GROUP BY day ORDER BY day`,
        )
        .bind(sinceSec),
      db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM user_days WHERE day >= ?').bind(sinceDay),
      db.prepare('SELECT kind, COUNT(*) AS n FROM auth_events WHERE at >= ? GROUP BY kind').bind(sinceSec),
      db.prepare('SELECT MIN(at) AS at FROM auth_events'),
      db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM favorites'),
      db.prepare(
        `SELECT username, pass_hash IS NULL AS viaSteam, account_id IS NOT NULL AS steamLinked, created_at AS createdAt, last_login_at AS lastLoginAt
         FROM users ORDER BY created_at DESC LIMIT 25`,
      ),
      db
        .prepare(
          `SELECT p.day AS day, SUM(p.views) AS views, (SELECT COUNT(*) FROM day_visitors v WHERE v.day = p.day) AS visitors
           FROM page_views p WHERE p.day >= ? GROUP BY p.day ORDER BY p.day`,
        )
        .bind(sinceDay),
      db.prepare('SELECT path, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY path').bind(sinceDay),
      db.prepare('SELECT MIN(day) AS day FROM page_views'),
    ]),
  );

  const first = <T>(r: D1Result) => (r.results?.[0] ?? {}) as T;
  const rows = <T>(r: D1Result) => (r.results ?? []) as T[];
  const u = first<Record<string, number>>(users);
  const f = first<{ n: number; users: number }>(favs);
  const ev = Object.fromEntries(EVENTS.map((k) => [k, 0])) as Record<AuthEvent, number>;
  for (const r of rows<{ kind: AuthEvent; n: number }>(events)) if (r.kind in ev) ev[r.kind] = r.n;

  // top pages without the language prefix + the language split
  const byPath = new Map<string, number>();
  const byLang = new Map<string, number>();
  for (const r of rows<{ path: string; views: number }>(paths)) {
    const lang = r.path.match(LANG_PREFIX)?.[1] ?? 'en';
    const bare = r.path.replace(LANG_PREFIX, '') || '/';
    byPath.set(bare, (byPath.get(bare) ?? 0) + r.views);
    byLang.set(lang, (byLang.get(lang) ?? 0) + r.views);
  }
  const daysRows = rows<{ day: string; views: number; visitors: number }>(byDay);

  return {
    days,
    users: {
      total: u.total ?? 0,
      steam: u.steam ?? 0,
      password: u.password ?? 0,
      passwordLinked: u.passwordLinked ?? 0,
      newTotal: u.newTotal ?? 0,
      newSteam: u.newSteam ?? 0,
      newPassword: u.newPassword ?? 0,
      active: first<{ n: number }>(active).n ?? 0,
      favorites: f.n ?? 0,
      favoriteUsers: f.users ?? 0,
    },
    signups: rows(signups),
    events: ev,
    eventsSince: first<{ at: number | null }>(eventsSince).at ?? null,
    recent: rows<AdminStats['recent'][number]>(recent).map((r) => ({ ...r, viaSteam: !!r.viaSteam, steamLinked: !!r.steamLinked })),
    traffic: {
      since: first<{ day: string | null }>(trafficSince).day ?? null,
      views: daysRows.reduce((a, r) => a + r.views, 0),
      visitors: daysRows.reduce((a, r) => a + r.visitors, 0),
      byDay: daysRows,
      top: [...byPath].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 15),
      langs: [...byLang].map(([lang, views]) => ({ lang, views })).sort((a, b) => b.views - a.views),
    },
  };
}
