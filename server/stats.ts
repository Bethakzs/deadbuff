/* ------------------------------------------------------------------ *
 * Site statistics for the owner (/admin): accounts, sign-ins, page views, visits.
 *
 *   auth_events   register_password | register_steam | login_password | login_steam | link_steam
 *   user_days     logged-in users seen per UTC day (/api/me)
 *   page_views    views per UTC day and path (POST /api/nav from the SPA; bots are skipped)
 *   day_visitors  unique visitors per day — SHA-256(day + IP + user agent + SESSION_SECRET), truncated:
 *                 no cookie, a new value every day, can't be turned back into an IP
 *   visits        one row per visit: the same daily visitor hash with < 30 min between pages; device,
 *                 browser, country + rough city / region / ISP from the IP (Cloudflare; the IP itself is never
 *                 stored), the account when logged in and where it came from: referrer host (+ its page path
 *                 when the site sends it), search words (rarely passed), the landing link's tags
 *   visit_pages   the pages of each visit in order (path without the language prefix, seconds)
 *
 * The owner's own activity is never shown: /api/nav skips accounts listed in ADMIN_USERS (and the SPA
 * stops sending beacons from a browser that opened /admin); the report also drops their rows from
 * user_days, auth_events and visits, so it holds for data logged before that too.
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

const LANG_PREFIX = /^\/(uk|de|es|ru)(?=\/|$)/;
/** The owner's page — only admins can use it, so it is never counted. */
const ADMIN_PATHS = ['/admin', '/uk/admin', '/de/admin', '/es/admin', '/ru/admin'];
const NOT_ADMIN_PATH = `path NOT IN (${ADMIN_PATHS.map((p) => `'${p}'`).join(', ')})`;

/**
 * "/uk/players/123/" → "/uk/players/:id". Only plain site paths are kept (the slugs are lower-case
 * latin), so junk can't fill the table. Player and match ids are folded — one row per section.
 * /admin is dropped (null).
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  let p = raw.split(/[?#]/)[0].toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  p = p.replace(/\/(players|matches)\/\d+/, '/$1/:id');
  return /^\/[a-z0-9\-/:]{0,120}$/.test(p) && !ADMIN_PATHS.includes(p) ? p : null;
}

/** Where a visit came from — everything the browser tells, which is little: Google never passes the search words. */
export interface Source {
  /** external referrer host ("twitch.tv"; an app id like "com.google.android.googlequicksearchbox"), null = none */
  ref: string | null;
  /** the referrer's page path, when that site sends it (most send only the domain) */
  refPath: string | null;
  /** search words, when the search engine passes them or the link has utm_term */
  term: string | null;
  /** tags of the landing link: "ref=twitch", "utm_source=chatgpt.com", "via=facebook" (ad / app click id) */
  tag: string | null;
}

/** Search engines whose referrer may carry the words (`q`, `p`, `text`…); other sites' `?p=` is not a search. */
const SEARCH_HOST = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|ya|ecosia|baidu|naver|qwant|startpage|seznam|brave)\.[a-z.]+$/;
const TERM_KEYS = ['q', 'query', 'text', 'p', 'wd'];
/** Landing-link tags: the owner's own links (?ref=twitch) and UTM tags that apps add (ChatGPT: utm_source=chatgpt.com). */
const TAG_KEYS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'src', 'source', 'from'];
/** Ad / app click ids: the value is a tracking token, only the platform is kept. */
const CLICK_IDS: Record<string, string> = {
  fbclid: 'facebook',
  igshid: 'instagram',
  gclid: 'google-ads',
  msclkid: 'bing-ads',
  yclid: 'yandex',
  ttclid: 'tiktok',
  twclid: 'x',
};

const clean = (s: string | null, max: number) => {
  // eslint-disable-next-line no-control-regex
  const v = (s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : null;
};

/**
 * `rawRef` = document.referrer, `rawQuery` = the landing page's `?query` (both from the first view of a page
 * load). Our own pages and junk give nulls. Referrer query strings are dropped (they can hold tokens) except
 * a search engine's words.
 */
export function visitSource(rawRef: unknown, rawQuery: unknown, req: Request): Source {
  const out: Source = { ref: null, refPath: null, term: null, tag: null };
  if (typeof rawRef === 'string' && rawRef && rawRef.length <= 500) {
    try {
      const u = new URL(rawRef);
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const self = new URL(req.url).hostname.toLowerCase().replace(/^www\./, '');
      if (host && host !== self && /^[a-z0-9.-]{1,80}$/.test(host)) {
        out.ref = host;
        if (SEARCH_HOST.test(host)) {
          for (const k of TERM_KEYS) out.term ??= clean(u.searchParams.get(k), 80);
        } else if (/^https?:$/.test(u.protocol)) {
          const path = u.pathname.replace(/\/+$/, '');
          if (path.length > 1 && path.length <= 150 && /^\/[\w\-./~%@:+!,;=()']*$/.test(path)) out.refPath = path;
        }
      }
    } catch {
      /* junk */
    }
  }
  if (typeof rawQuery === 'string' && rawQuery.length > 1 && rawQuery.length <= 400) {
    const p = new URLSearchParams(rawQuery);
    const tags: string[] = [];
    for (const k of TAG_KEYS) {
      const v = clean(p.get(k), 60);
      if (v) tags.push(`${k}=${v}`);
    }
    for (const [k, name] of Object.entries(CLICK_IDS)) if (p.has(k)) tags.push(`via=${name}`);
    if (tags.length) out.tag = tags.join(' · ').slice(0, 200);
    out.term ??= clean(p.get('utm_term'), 80);
  }
  return out;
}

/**
 * Rough place of a visit from Cloudflare's IP geolocation (`request.cf`, free on every plan): country, city,
 * region and the network's owner (ISP / mobile operator). City is a best guess — often the provider's hub, not
 * where the person is; a VPN shows the VPN's place. Coordinates and postal codes are not kept: the IP doesn't
 * know them for real and they would only pretend to be precise.
 */
export interface Geo {
  country: string | null;
  city: string | null;
  region: string | null;
  isp: string | null;
}

export function visitGeo(req: Request): Geo {
  const cf = req.cf as Record<string, unknown> | undefined;
  const text = (k: string) => clean(typeof cf?.[k] === 'string' ? (cf[k] as string) : null, 60);
  const country = typeof cf?.country === 'string' && /^[A-Z][A-Z0-9]$/.test(cf.country) ? cf.country : null;
  return { country, city: text('city'), region: text('region'), isp: text('asOrganization') };
}

/** Device type, browser and OS from the user agent — rough on purpose, only for the owner's breakdowns. */
export function parseUa(ua: string): { device: string; browser: string; os: string } {
  const device = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Valve Steam|GameOverlay/i.test(ua)
    ? 'Steam'
    : /Edg(e|A|iOS)?\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera|OPX\//.test(ua)
        ? 'Opera'
        : /YaBrowser/.test(ua)
          ? 'Yandex'
          : /SamsungBrowser/.test(ua)
            ? 'Samsung'
            : /Firefox\/|FxiOS/.test(ua)
              ? 'Firefox'
              : /Chrome\/|CriOS/.test(ua)
                ? 'Chrome'
                : /Safari\//.test(ua)
                  ? 'Safari'
                  : 'Other';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Other';
  return { device, browser, os };
}

export async function visitorId(secret: string, req: Request): Promise<string> {
  const data = `${today()}|${clientIp(req)}|${req.headers.get('user-agent') ?? ''}|${secret}`;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return [...hash.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface View {
  /** normalized path with the language prefix */
  path: string;
  /** daily visitor hash */
  vid: string;
  /** logged-in account, if any */
  userId: number | null;
  geo: Geo;
  ua: string;
  /** where the page load came from (first page of a page load only, else all null) */
  source: Source;
}

/** A new visit starts after this long without a page view. */
const VISIT_GAP = 30 * 60;

/** One page view: the daily counters + the visit it belongs to (an open one, else a new one). */
export function recordView(db: D1Database, v: View) {
  const day = today();
  const now = nowSec();
  const lang = v.path.match(LANG_PREFIX)?.[1] ?? 'en';
  const bare = v.path.replace(LANG_PREFIX, '') || '/';
  return quiet(
    q(db, async () => {
      const open = await db
        .prepare('SELECT id FROM visits WHERE vid = ? AND last_at >= ? ORDER BY last_at DESC LIMIT 1')
        .bind(v.vid, now - VISIT_GAP)
        .first<{ id: number }>();
      const counters = [
        db.prepare('INSERT INTO page_views (day, path, views) VALUES (?, ?, 1) ON CONFLICT (day, path) DO UPDATE SET views = views + 1').bind(day, v.path),
        db.prepare('INSERT OR IGNORE INTO day_visitors (day, vid) VALUES (?, ?)').bind(day, v.vid),
      ];
      if (open) {
        await db.batch([
          ...counters,
          // a visit without a source takes the first one that comes later (direct, then a new tab from Google
          // within 30 minutes); a known source is never overwritten
          db
            .prepare(
              `UPDATE visits SET last_at = ?2, views = views + 1, user_id = COALESCE(?3, user_id),
                 ref = CASE WHEN ref IS NULL AND tag IS NULL THEN ?4 ELSE ref END,
                 ref_path = CASE WHEN ref IS NULL AND tag IS NULL THEN ?5 ELSE ref_path END,
                 tag = CASE WHEN ref IS NULL AND tag IS NULL THEN ?6 ELSE tag END,
                 term = COALESCE(term, ?7)
               WHERE id = ?1`,
            )
            .bind(open.id, now, v.userId, v.source.ref, v.source.refPath, v.source.tag, v.source.term),
          // n = the visit's new view count (same transaction, so two quick views can't clash)
          db.prepare('INSERT INTO visit_pages (visit_id, n, at, path) SELECT id, views, ?2, ?3 FROM visits WHERE id = ?1').bind(open.id, now, bare),
        ]);
      } else {
        const ua = parseUa(v.ua);
        await db.batch([
          ...counters,
          db
            .prepare(
              `INSERT INTO visits (day, vid, user_id, started_at, last_at, views, lang, country, city, region, isp, device, browser, os, ref, ref_path, term, tag)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              day,
              v.vid,
              v.userId,
              now,
              now,
              lang,
              v.geo.country,
              v.geo.city,
              v.geo.region,
              v.geo.isp,
              ua.device,
              ua.browser,
              ua.os,
              v.source.ref,
              v.source.refPath,
              v.source.term,
              v.source.tag,
            ),
          db.prepare('INSERT INTO visit_pages (visit_id, n, at, path) VALUES (last_insert_rowid(), 1, ?, ?)').bind(now, bare),
        ]);
      }
    }),
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
    /** logged-in users seen in the period (without the owner) */
    active: number;
    favorites: number;
    favoriteUsers: number;
  };
  signups: { day: string; steam: number; password: number }[];
  /** counts in the period (without the owner) */
  events: Record<AuthEvent, number>;
  /** first logged event (unix) — sign-ins are counted from then on */
  eventsSince: number | null;
  /** accountId: linked Steam account (the page shows its persona name, avatar and profile link) */
  recent: { username: string; accountId: number | null; viaSteam: boolean; steamLinked: boolean; createdAt: number; lastLoginAt: number }[];
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
  visits: VisitStats;
}

export interface VisitStats {
  /** first day with logged visits */
  since: string | null;
  sessions: number;
  /** distinct daily visitor hashes (a person on two days counts twice) */
  visitors: number;
  views: number;
  /** visits with a single page */
  bounces: number;
  /** total seconds of the visits with 2+ pages */
  seconds: number;
  /** visits by a logged-in account */
  signedIn: number;
  /** per page (no language prefix): views, distinct visitors, visits, most views by one visitor */
  pages: { path: string; views: number; visitors: number; sessions: number; top: number }[];
  /** most active visitors of the period */
  people: Visitor[];
  /** key = referrer host, "#<tags>" for a tagged link without a referrer, "" = direct (the SPA names and groups them) */
  sources: Count[];
  /** first page of the visits per source key (same keys as `sources`) */
  landings: { key: string; path: string; n: number }[];
  /** landing-link tags ("ref=twitch"), referrer pages ("reddit.com/r/…") and search words, most common first */
  tags: Count[];
  refPages: Count[];
  terms: Count[];
  countries: Count[];
  /** key = "UA|Kyiv" (country code | city) */
  cities: Count[];
  /** network owners: ISPs, mobile operators, VPN / hosting companies */
  isps: Count[];
  devices: Count[];
  browsers: Count[];
  systems: Count[];
  /** newest visits */
  recent: Visit[];
}

export interface Count {
  key: string;
  n: number;
}

export interface Visitor {
  /** short label of the daily visitor hash — the same label = the same browser that day */
  id: string;
  day: string;
  username: string | null;
  accountId: number | null;
  views: number;
  sessions: number;
  /** distinct pages */
  pages: number;
  country: string | null;
  city: string | null;
  device: string;
  browser: string;
  os: string;
  lastAt: number;
}

export interface Visit {
  id: number;
  visitor: string;
  username: string | null;
  accountId: number | null;
  startedAt: number;
  lastAt: number;
  views: number;
  lang: string;
  country: string | null;
  /** rough place from the IP (Cloudflare): city, region, network owner — see visitGeo */
  city: string | null;
  region: string | null;
  isp: string | null;
  device: string;
  browser: string;
  os: string;
  ref: string | null;
  refPath: string | null;
  term: string | null;
  tag: string | null;
  /** pages in order, t = seconds since the visit started */
  pages: { path: string; t: number }[];
}

/** Short visitor label shown on /admin (the full hash never leaves the server). */
const label = (vid: string) => vid.slice(0, 6);

/** Source of a visit for grouping: the referrer host, else the tagged link ("#ref=twitch"), else "" (direct). */
const SOURCE_KEY = `COALESCE(v.ref, '#' || v.tag, '')`;

/** Statements for the visits section: ?1 = first day, ?2 = JSON array of admin user ids. */
function visitStatements(db: D1Database, sinceDay: string, adminIds: string) {
  const own = 'v.day >= ?1 AND COALESCE(v.user_id, 0) NOT IN (SELECT value FROM json_each(?2))';
  const count = (expr: string, limit = 10, where = '') =>
    db
      .prepare(`SELECT COALESCE(${expr}, '') AS key, COUNT(*) AS n FROM visits v WHERE ${own} ${where} GROUP BY key ORDER BY n DESC LIMIT ${limit}`)
      .bind(sinceDay, adminIds);
  return [
    db
      .prepare(
        `SELECT COUNT(*) AS sessions, COUNT(DISTINCT v.vid) AS visitors, COALESCE(SUM(v.views), 0) AS views,
                COALESCE(SUM(v.views = 1), 0) AS bounces,
                COALESCE(SUM(CASE WHEN v.views > 1 THEN v.last_at - v.started_at END), 0) AS seconds,
                COALESCE(SUM(v.user_id IS NOT NULL), 0) AS signedIn
         FROM visits v WHERE ${own}`,
      )
      .bind(sinceDay, adminIds),
    db
      .prepare(
        `SELECT path, SUM(n) AS views, COUNT(*) AS visitors, SUM(s) AS sessions, MAX(n) AS top FROM (
           SELECT p.path AS path, v.vid AS vid, COUNT(*) AS n, COUNT(DISTINCT p.visit_id) AS s
           FROM visits v JOIN visit_pages p ON p.visit_id = v.id
           WHERE ${own} GROUP BY p.path, v.vid
         ) GROUP BY path ORDER BY views DESC, visitors DESC LIMIT 30`,
      )
      .bind(sinceDay, adminIds),
    db
      .prepare(
        `SELECT v.vid AS id, MIN(v.day) AS day, MAX(u.username) AS username, MAX(u.account_id) AS accountId, SUM(v.views) AS views, COUNT(*) AS sessions,
                (SELECT COUNT(DISTINCT p.path) FROM visits w JOIN visit_pages p ON p.visit_id = w.id WHERE w.vid = v.vid) AS pages,
                MAX(v.country) AS country, MAX(v.city) AS city, MAX(v.device) AS device, MAX(v.browser) AS browser, MAX(v.os) AS os, MAX(v.last_at) AS lastAt
         FROM visits v LEFT JOIN users u ON u.id = v.user_id
         WHERE ${own} GROUP BY v.vid ORDER BY views DESC, lastAt DESC LIMIT 12`,
      )
      .bind(sinceDay, adminIds),
    count(SOURCE_KEY, 40),
    db
      .prepare(
        `SELECT ${SOURCE_KEY} AS key, p.path AS path, COUNT(*) AS n
         FROM visits v JOIN visit_pages p ON p.visit_id = v.id AND p.n = 1
         WHERE ${own} GROUP BY key, p.path ORDER BY n DESC LIMIT 150`,
      )
      .bind(sinceDay, adminIds),
    count('v.tag', 10, 'AND v.tag IS NOT NULL'),
    count(`v.ref || v.ref_path`, 10, 'AND v.ref_path IS NOT NULL'),
    count('v.term', 10, 'AND v.term IS NOT NULL'),
    count('v.country'),
    count(`COALESCE(v.country, '') || '|' || v.city`, 12, 'AND v.city IS NOT NULL'),
    count('v.isp', 10, 'AND v.isp IS NOT NULL'),
    count('v.device'),
    count('v.browser'),
    count('v.os'),
    db
      .prepare(
        `SELECT v.id, v.vid AS visitor, u.username, u.account_id AS accountId, v.started_at AS startedAt, v.last_at AS lastAt, v.views, v.lang,
                v.country, v.city, v.region, v.isp, v.device, v.browser, v.os, v.ref, v.ref_path AS refPath, v.term, v.tag,
                (SELECT group_concat(x, ' ') FROM (
                   SELECT p.path || ',' || (p.at - v.started_at) AS x FROM visit_pages p WHERE p.visit_id = v.id ORDER BY p.n LIMIT 40
                 )) AS pages
         FROM visits v LEFT JOIN users u ON u.id = v.user_id
         WHERE ${own} ORDER BY v.id DESC LIMIT 60`,
      )
      .bind(sinceDay, adminIds),
    db.prepare('SELECT MIN(day) AS day FROM visits'),
  ];
}

export async function adminStats(db: D1Database, days: number, adminIds: number[] = []): Promise<AdminStats> {
  const sinceSec = days ? nowSec() - days * 86400 : 0;
  const sinceDay = days ? new Date((nowSec() - (days - 1) * 86400) * 1000).toISOString().slice(0, 10) : '0000-00-00';
  const admins = JSON.stringify(adminIds);
  const notAdmin = 'COALESCE(user_id, 0) NOT IN (SELECT value FROM json_each(?2))';
  const [users, signups, active, events, eventsSince, favs, recent, byDay, paths, trafficSince, ...visitRes] = await q(db, () =>
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
      db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM user_days WHERE day >= ?1 AND ${notAdmin}`).bind(sinceDay, admins),
      db.prepare(`SELECT kind, COUNT(*) AS n FROM auth_events WHERE at >= ?1 AND ${notAdmin} GROUP BY kind`).bind(sinceSec, admins),
      db.prepare('SELECT MIN(at) AS at FROM auth_events'),
      db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM favorites'),
      db.prepare(
        `SELECT username, account_id AS accountId, pass_hash IS NULL AS viaSteam, account_id IS NOT NULL AS steamLinked, created_at AS createdAt, last_login_at AS lastLoginAt
         FROM users ORDER BY created_at DESC LIMIT 25`,
      ),
      db
        .prepare(
          `SELECT p.day AS day, SUM(p.views) AS views, (SELECT COUNT(*) FROM day_visitors v WHERE v.day = p.day) AS visitors
           FROM page_views p WHERE p.day >= ? AND ${NOT_ADMIN_PATH} GROUP BY p.day ORDER BY p.day`,
        )
        .bind(sinceDay),
      db.prepare(`SELECT path, SUM(views) AS views FROM page_views WHERE day >= ? AND ${NOT_ADMIN_PATH} GROUP BY path`).bind(sinceDay),
      db.prepare('SELECT MIN(day) AS day FROM page_views'),
      ...visitStatements(db, sinceDay, admins),
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

  const [vSum, vPages, vPeople, vSources, vLandings, vTags, vRefPages, vTerms, vCountries, vCities, vIsps, vDevices, vBrowsers, vSystems, vRecent, vSince] = visitRes;
  const vs = first<Record<string, number>>(vSum);
  const visits: VisitStats = {
    since: first<{ day: string | null }>(vSince).day ?? null,
    sessions: vs.sessions ?? 0,
    visitors: vs.visitors ?? 0,
    views: vs.views ?? 0,
    bounces: vs.bounces ?? 0,
    seconds: vs.seconds ?? 0,
    signedIn: vs.signedIn ?? 0,
    pages: rows(vPages),
    people: rows<Visitor>(vPeople).map((r) => ({ ...r, id: label(r.id) })),
    sources: rows(vSources),
    landings: rows(vLandings),
    tags: rows(vTags),
    refPages: rows(vRefPages),
    terms: rows(vTerms),
    countries: rows(vCountries),
    cities: rows(vCities),
    isps: rows(vIsps),
    devices: rows(vDevices),
    browsers: rows(vBrowsers),
    systems: rows(vSystems),
    recent: rows<Omit<Visit, 'pages'> & { pages: string | null }>(vRecent).map((r) => ({
      ...r,
      visitor: label(r.visitor),
      pages: (r.pages ?? '')
        .split(' ')
        .filter(Boolean)
        .map((x) => {
          const i = x.lastIndexOf(',');
          return { path: x.slice(0, i), t: Number(x.slice(i + 1)) || 0 };
        }),
    })),
  };

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
    visits,
  };
}
