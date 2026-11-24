/* ------------------------------------------------------------------ *
 * SEO prerender — runs after `vite build` (npm run build).
 *
 * The app is a client-side SPA, so crawlers and link previews would only see an empty
 * shell. This script writes a real HTML page for every public route, in every UI language:
 *   dist/heroes/haze.html, dist/uk/heroes/haze/builds.html, dist/de.html, …
 * each with its own <title>, description, canonical + hreflang, Open Graph tags and a
 * static text version of the page (abilities, top builds, counters…) inside #root.
 * React replaces that content as soon as it mounts.
 *
 * Also writes: sitemap.xml + robots.txt (when SITE_URL is set), app.html (the plain SPA
 * shell for dynamic routes like /players/:id) and _redirects (Cloudflare Pages / Netlify).
 *
 *   SITE_URL=https://deadbuff.net npm run build
 *
 * Data comes from the Deadlock API at build time → rebuild daily to keep numbers fresh
 * (.github/workflows/daily-rebuild.yml). If the API is unreachable the build still succeeds
 * (the SPA works without prerendered pages).
 * ------------------------------------------------------------------ */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { de } from '../src/i18n/de';
import { en, type MsgKey } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { ru } from '../src/i18n/ru';
import { LANGS, pathForLang, type Lang } from '../src/i18n/types';
import { uk } from '../src/i18n/uk';
import * as api from '../src/lib/api';
import { BUILD_PAGE, BUILD_STEP, buildCategoryName, uniqueBuilds } from '../src/lib/builds';
import { SNAPSHOT_DIR, SNAPSHOT_INDEX, STEAM_SHARDS, snapshotFile, snapshotHash, snapshotKey, steamShardFile, type SnapshotIndex } from '../src/lib/snapshot';
import { buildHeroRows, heroSlug, roleOf, type HeroRow, type Tier } from '../src/lib/heroes';
import { loreParagraphs, stripHtml } from '../src/lib/html';
import { countersOf, itemsVsLineup, pairIndex } from '../src/lib/draft';
import { abilityDescription, isShopItem, itemSlug } from '../src/lib/items';
import { patchImpact, patchTimeline, patchWindows, type PatchImpactRow, type PatchPoint } from '../src/lib/patches';
import { lanesFromInfo } from '../src/lib/lanes';
import { CAMP_KINDS, DISTRICTS, LANES, OBJECTIVES, TIMELINE, campCount, clock, districtName, midbossVars, placeName, wikiNumbers } from '../src/lib/map';
import { ARTICLES, LEVEL_SOULS, UNLOCK_LEVELS, articlePath, resolveText, type Block, type WikiArticle, type WikiCtx } from '../src/lib/wiki';
import { computePros, HERO_PRO_DAYS, HERO_PRO_LIMIT, itemTally, PRO_REGIONS, proGames, proIds, PROS_FILE, REGION_TAG, type ProGame, type ProsFile } from '../src/lib/pros';
import type {
  BadgeRow,
  CounterStat,
  GameMap,
  GenericData,
  Hero,
  HeroBuild,
  HeroBuildStat,
  HeroStat,
  Item,
  ItemBucketStat,
  ItemStat,
  LeaderboardEntry,
  NpcUnit,
  Patch,
  PlayerRankRow,
  ProMatch,
  ProPlayer,
  Rank,
  SteamProfile,
} from '../src/lib/types';

const API = 'https://api.deadlock-api.com/v1';
const DIST = join(process.cwd(), 'dist');
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const DICTS: Record<Lang, Record<MsgKey, unknown>> = { en, uk, de, es, ru };
const HERO_TABS = ['overview', 'builds', 'items', 'matchups', 'lore'] as const;
type HeroTab = (typeof HERO_TABS)[number];
/** sitemap-<name>.xml per page kind (route path without the language prefix); everything else → sitemap-pages.xml */
const SITEMAP_GROUPS: [string, RegExp][] = [
  ['heroes', /^\/heroes\/[^/]+/],
  ['counters', /^\/counters\/[^/]+/],
  ['items', /^\/items\/[^/]+/],
  ['wiki', /^\/wiki(\/|$)/],
];

/* ------------------------------ helpers ----------------------------- */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Same rules as the app's t(): {var} placeholders, plural entries fall back to `other`. */
function t(lang: Lang, key: MsgKey, vars: Record<string, string | number> = {}) {
  const raw = DICTS[lang][key] ?? en[key];
  const msg = typeof raw === 'string' ? raw : (raw as { other: string }).other;
  return msg.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

const pct = (lang: Lang, v: number) =>
  `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v * 100)}%`;

/** Headline from a page title: "Haze Build, Win Rate & Abilities — Deadlock | Deadbuff" → "Haze Build, Win Rate & Abilities". */
const headline = (title: string) => title.split(/ [—·] Deadlock| \| Deadbuff/)[0];

const link = (lang: Lang, path: string, text: string) => `<a href="${esc(pathForLang(path, lang))}">${esc(text)}</a>`;

type Params = Record<string, string | number | boolean | undefined>;

/** `snap`: also save the answer as a static snapshot (dist/data/, see src/lib/snapshot.ts). */
async function get<T>(path: string, params: Params = {}, snap = false): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const url = `${API}${path}${qs.toString() ? `?${qs}` : ''}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'deadbuff-prerender' } });
    if (res.ok) {
      const body = await res.text();
      const data = JSON.parse(body) as T;
      if (snap) await saveSnapshot(path, params, body);
      return data;
    }
    if (attempt >= 2 || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}

/*
 * Every call made through src/lib/api.ts (fetchHeroes(), fetchHeroStats(DEFAULT_FILTERS)…) builds its query exactly
 * like the SPA does and is saved as a snapshot — the SPA then finds the same file name for the same query.
 * Direct get() calls (leaderboard, Steam lookups) are not saved.
 */
api.setTransport((path, params) => get(path, params as Params, true));

/** Snapshots written in this run: file hash → query key. Two keys on one hash → both left out of the index. */
const snapKeys = new Map<string, string>();
const snapClash = new Set<string>();

async function saveSnapshot(path: string, params: Params, body: string) {
  const key = snapshotKey(path, params);
  const hash = snapshotHash(key);
  const known = snapKeys.get(hash);
  if (known !== undefined && known !== key) {
    snapClash.add(hash);
    return;
  }
  snapKeys.set(hash, key);
  await write(snapshotFile(hash), body);
}

/** Runs `fn` over items with limited concurrency (be gentle with the free API). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* -------------------------------- data ------------------------------ */

/** Game texts in one language (official localisation from the API). */
interface Localised {
  heroes: Map<number, Hero>;
  items: Map<string, Item>;
  shop: Item[];
  /** York, Broadway, Greenwich in this language (wiki) */
  lanes: string[];
  /** generic-data in this language (wiki: place names, prices, soul shares, Rejuvenator) */
  generic?: GenericData;
  /** rank names + badges in this language (wiki → ranks) */
  ranks: Rank[];
}

interface Data {
  heroes: Hero[];
  local: Record<Lang, Localised>;
  rows: HeroRow[];
  stats: HeroStat[];
  counters: CounterStat[];
  builds: Map<number, HeroBuild[]>;
  /** shop items with their English slug (item pages) */
  shopEn: { item: Item; slug: string }[];
  itemStats: Map<number, ItemStat>;
  itemByHero: ItemBucketStat[];
  /** item stats of every hero in games where this hero was an enemy (counter pages: "items against Haze") */
  itemsVs: Map<number, ItemStat[]>;
  /** newest patch with at least a day of data after it, and its per-hero impact */
  patch?: { point: PatchPoint; rows: PatchImpactRow[] };
  leaderboard: LeaderboardEntry[];
  /** wiki: everything on the map + NPC health / souls (English npc data — only numbers are used) */
  map?: GameMap;
  npcs: Map<string, NpcUnit>;
  /** players by rank, last 30 days (wiki → ranks) */
  badges: BadgeRow[];
  /** first /builds page (weekly favourites, BUILD_PAGE builds) per hero — `builds` is its top 5; the rest is for snapshots */
  buildPages: Map<number, HeroBuild[]>;
  /** pro players (top of every region's leaderboard, see src/lib/pros.ts) → dist/data/pros.json */
  pros: ProPlayer[];
  /** the pros' games on each hero, last HERO_PRO_DAYS (the hero page's query, saved as a snapshot) */
  proMatches: Map<number, ProMatch[]>;
}

/*
 * All stats use DEFAULT_FILTERS (all ranks, 7 days from the start of the UTC day) — the very queries a first visit
 * makes, so the static pages show the same numbers as the app and every answer doubles as a snapshot.
 */
async function loadData(): Promise<Data> {
  const F = api.DEFAULT_FILTERS;
  const shop = (items: Item[]) => items.filter(isShopItem);
  const [texts, stats, counters, itemStats, itemByHero, patches, bigDays, leaderboard, map, npcs, badges] = await Promise.all([
    Promise.all(
      LANGS.map(async (l) => {
        const [heroes, items, generic, ranks] = await Promise.all([
          api.fetchHeroes(l.api),
          api.fetchItems(l.api),
          api.fetchGenericData(l.api).catch(() => undefined),
          api.fetchRanks(l.api).catch(() => [] as Rank[]),
        ]);
        return [l.id, { heroesRaw: heroes, items, generic, ranks, lanes: lanesFromInfo(generic?.lane_info).map((x) => x.name) }] as const;
      }),
    ),
    api.fetchHeroStats(F),
    api.fetchCounterStats(F).catch(() => [] as CounterStat[]),
    api.fetchItemStats(F).catch(() => [] as ItemStat[]),
    api.fetchItemStatsBucket(F, 'hero').catch(() => [] as ItemBucketStat[]),
    api.fetchPatches().catch(() => [] as Patch[]),
    api.fetchBigPatchDays().catch(() => [] as string[]),
    // live in the app (changes hourly) — not saved as a snapshot
    get<{ entries: LeaderboardEntry[] }>('/leaderboard/Europe')
      .then((r) => r.entries)
      .catch(() => [] as LeaderboardEntry[]),
    api.fetchMap().catch(() => undefined),
    api.fetchNpcUnits('english').catch(() => [] as NpcUnit[]),
    api.fetchBadgeDistribution(api.dayStart(30)).catch(() => [] as BadgeRow[]),
  ]);
  const raw = Object.fromEntries(texts) as Record<Lang, { heroesRaw: Hero[]; items: Item[]; lanes: string[]; generic?: GenericData; ranks: Rank[] }>;
  const local = Object.fromEntries(
    LANGS.map((l) => [
      l.id,
      {
        heroes: new Map(raw[l.id].heroesRaw.map((h) => [h.id, h])),
        items: new Map(raw[l.id].items.map((i) => [i.class_name, i])),
        shop: shop(raw[l.id].items),
        lanes: raw[l.id].lanes,
        generic: raw[l.id].generic,
        ranks: raw[l.id].ranks,
      },
    ]),
  ) as Record<Lang, Localised>;
  const heroes = raw.en.heroesRaw
    .filter((h) => h.player_selectable && !h.disabled)
    .map((h) => ({ ...h, name_en: h.name, slug: heroSlug(h.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const builds = new Map<number, HeroBuild[]>();
  const buildPages = new Map<number, HeroBuild[]>();
  const itemsVs = new Map<number, ItemStat[]>();
  await pool(heroes, 6, async (h) => {
    const [list, vs] = await Promise.all([
      // the same first page the /builds browser and the hero's "Trending" tab load
      api.fetchBuilds({ heroId: h.id, sortBy: 'weekly_favorites', start: 0, limit: BUILD_PAGE }).catch(() => [] as HeroBuild[]),
      api.fetchItemStatsVsEnemy(F, undefined, h.id).catch(() => [] as ItemStat[]),
    ]);
    buildPages.set(h.id, list);
    builds.set(h.id, list.slice(0, 5));
    itemsVs.set(h.id, vs);
  });
  // Patch impact for the newest patch that already has a day of data after it.
  let patch: Data['patch'];
  const timeline = patchTimeline(patches, bigDays);
  const idx = timeline.findIndex((_, i) => patchWindows(timeline, i).afterDays >= 1);
  if (idx >= 0) {
    const w = patchWindows(timeline, idx);
    const win = (x: { min: number; max: number }) => api.fetchHeroStatsWindow(x.min, x.max, undefined);
    const [before, after] = await Promise.all([win(w.before), win(w.after)]).catch(() => [[], []] as HeroStat[][]);
    if (before.length && after.length) patch = { point: timeline[idx], rows: patchImpact(heroes, before, after) };
  }

  // Pro players: the leaderboards (~1 MB each) and rank lookups are direct calls — not snapshots, the SPA reads the
  // small pros.json instead (and /leaderboard stays live). Each hero's pro games go through api.* → saved as the
  // snapshot the hero page reads; "no games" (404) is saved as [] so that hero page makes no request either.
  const pros = await computePros(undefined, {
    leaderboard: (r) => get<{ entries: LeaderboardEntry[] }>(`/leaderboard/${r}`),
    ranks: (ids) => get<PlayerRankRow[]>('/players/rank', { account_ids: ids.join(',') }),
  }).catch(() => [] as ProPlayer[]);
  const proMatches = new Map<number, ProMatch[]>();
  if (pros.length) {
    const accountIds = proIds(pros);
    await pool(heroes, 4, async (h) => {
      const q = { accountIds, heroId: h.id, days: HERO_PRO_DAYS, limit: HERO_PRO_LIMIT };
      try {
        proMatches.set(h.id, await api.fetchProMatches(q));
      } catch (e) {
        if (!String((e as Error).message).startsWith('404')) return; // the SPA asks the proxy then
        await saveSnapshot('/matches/metadata', api.proMatchParams(q) as Params, '[]');
        proMatches.set(h.id, []);
      }
    });
  }

  return {
    heroes,
    local,
    rows: buildHeroRows(heroes, stats),
    stats,
    counters,
    builds,
    shopEn: shop(raw.en.items).map((item) => ({ item, slug: itemSlug(item.name) })),
    itemStats: new Map(itemStats.map((x) => [x.item_id, x])),
    itemByHero,
    itemsVs,
    patch,
    leaderboard,
    map,
    npcs: new Map(npcs.map((n) => [n.class_name, n])),
    badges,
    buildPages,
    pros,
    proMatches,
  };
}

/* ----------------------------- snapshots ---------------------------- */

/**
 * Saves the rest of what a first visit asks for with the default filters (loadData() already saved the rest):
 * assets the static pages don't need, per-hero stats, the "Most played" builds one by one (hero overview shows
 * 3, the Builds tab the first BUILD_STEP), home's trending builds and the Steam profiles of every author shown.
 * A failed query is skipped — the app then asks the proxy for it. Returns the account ids in the Steam shards.
 */
async function saveSnapshots(d: Data): Promise<number[]> {
  const F = api.DEFAULT_FILTERS;
  const skip = () => undefined;
  const [trending] = await Promise.all([
    api.fetchBuilds({ sortBy: 'weekly_favorites', limit: 6 }).catch(() => [] as HeroBuild[]),
    Promise.all([
      ...LANGS.flatMap((l) => [api.fetchBuildTags(l.api).catch(skip), l.api === 'english' ? undefined : api.fetchNpcUnits(l.api).catch(skip)]),
      api.fetchUpgradesEn().catch(skip),
      api.fetchSynergyStats(F).catch(skip),
      api.fetchLaneStats(F).catch(skip),
      api.fetchItemStatsBucket(F, 'game_time_min').catch(skip),
    ]),
  ]);

  const listed = new Map<number, HeroBuild>();
  for (const b of [...trending, ...[...d.buildPages.values()].flat()]) listed.set(b.hero_build.hero_build_id, b);
  // authors on screen: home's trending builds, the first BUILD_STEP of each /builds page, the "Most played" builds
  const shown: HeroBuild[] = [...trending, ...[...d.buildPages.values()].flatMap((list) => uniqueBuilds([list]).slice(0, BUILD_STEP))];

  await pool(d.heroes, 6, async (h) => {
    const [buildStats] = await Promise.all([
      api.fetchHeroBuildStats(F, h.id).catch(() => [] as HeroBuildStat[]),
      api.fetchAbilityOrders(F, h.id).catch(skip),
      api.fetchItemStats(F, h.id).catch(skip),
    ]);
    // same ranking as HeroOverview / HeroBuilds ("Most played")
    const top = [...buildStats].sort((a, b) => b.matches - a.matches).slice(0, BUILD_STEP);
    for (const { hero_build_id: id } of top) {
      // a build from a list is the same object /builds?build_id= returns (both only_latest) — no extra request
      const known = listed.get(id);
      const build = known ?? (await api.fetchBuildById(id).catch(() => null));
      if (known) await saveSnapshot('/builds', { build_id: id, only_latest: true }, JSON.stringify([known]));
      if (build) shown.push(build);
    }
  });

  const authors = [...new Set(shown.map((b) => b.hero_build.author_account_id).filter((id) => id > 0))];
  const profiles: SteamProfile[] = [];
  for (let i = 0; i < authors.length; i += 100) {
    const chunk = await get<SteamProfile[]>('/players/steam', { account_ids: authors.slice(i, i + 100).join(',') }).catch(() => [] as SteamProfile[]);
    // only the fields the app shows (the API sends ~9 KB per profile)
    for (const p of chunk) profiles.push({ account_id: p.account_id, personaname: p.personaname, avatar: p.avatar, avatarmedium: p.avatarmedium });
  }
  for (let n = 0; n < STEAM_SHARDS; n++) await write(steamShardFile(n), JSON.stringify(profiles.filter((p) => p.account_id % STEAM_SHARDS === n)));
  return profiles.map((p) => p.account_id);
}

/* ------------------------------- pages ------------------------------ */

interface PageDef {
  /** language-less path, e.g. "/heroes/haze/builds" */
  path: string;
  title: (lang: Lang) => string;
  description: (lang: Lang) => string;
  body: (lang: Lang) => string;
  image?: string;
  /** structured data for this page (needs SITE_URL; the home page has its own WebSite block) */
  jsonLd?: (lang: Lang, url: string) => Record<string, unknown>;
}

function heroText(d: Data, hero: Hero, lang: Lang) {
  const local = lang === 'en' ? undefined : d.local[lang].heroes.get(hero.id);
  return {
    name: local?.name ?? hero.name,
    en: hero.name,
    description: local?.description ?? hero.description,
    tags: local?.tags ?? hero.tags ?? [],
  };
}

function navBlock(lang: Lang) {
  return `<nav>${link(lang, '/', 'Deadbuff')}${link(lang, '/tier-list', t(lang, 'nav.tierList'))}${link(lang, '/heroes', t(lang, 'nav.heroes'))}${link(lang, '/builds', t(lang, 'nav.builds'))}${link(lang, '/items', t(lang, 'nav.items'))}${link(lang, '/draft', t(lang, 'nav.draft'))}${link(lang, '/pros', t(lang, 'nav.pros'))}${link(lang, '/counters', t(lang, 'ctr.eyebrow'))}${link(lang, '/wiki', t(lang, 'nav.wiki'))}${link(lang, '/patches', t(lang, 'nav.patches'))}${link(lang, '/players', t(lang, 'nav.players'))}${link(lang, '/matches', t(lang, 'nav.matches'))}${link(lang, '/leaderboard', t(lang, 'nav.leaderboard'))}</nav>`;
}

function heroLinks(d: Data, lang: Lang, rows = d.rows) {
  return `<ul>${rows
    .map((r) => `<li>${link(lang, `/heroes/${r.hero.slug}`, heroText(d, r.hero, lang).name)} — ${esc(t(lang, 'stat.winRate'))} ${pct(lang, r.winRate)}, ${esc(t(lang, 'stat.pickRate'))} ${pct(lang, r.pickRate)}</li>`)
    .join('')}</ul>`;
}

/** Every hero scored against one enemy — the same maths as the app (lib/draft.ts countersOf), per enemy. */
function counterData(d: Data) {
  const baseWr = new Map(d.rows.map((r) => [r.hero.id, r.winRate]));
  const idx = pairIndex(d.counters);
  return new Map(d.heroes.map((h) => [h.id, countersOf(h, d.heroes, baseWr, idx)]));
}

/** "Haze counters — Abrams +2.1%, Lash +1.8%…": the heroes that beat each hero most, each linking to its counter page. */
function counterLines(d: Data, lang: Lang, ctr: ReturnType<typeof counterData>) {
  return d.heroes
    .map((enemy) => {
      const best = (ctr.get(enemy.id)?.counters ?? []).slice(0, 4);
      if (!best.length) return '';
      const list = best.map((x) => `${esc(heroText(d, x.hero, lang).name)} +${pct(lang, x.fx.delta)}`).join(', ');
      return `<li>${link(lang, `/counters/${enemy.slug}`, t(lang, 'ctr.linkName', { name: heroText(d, enemy, lang).name }))} — ${list}</li>`;
    })
    .join('');
}

/** Plain-text description of a shop item (tooltip blurbs, else the short description). */
function itemText(item: Item): string {
  const parts = (item.tooltip_sections ?? []).flatMap((sec) => sec.section_attributes.map((a) => a.loc_string ?? '')).filter(Boolean);
  return stripHtml(parts.length ? parts.join(' ') : item.description?.desc ?? '');
}

const mmss = (s: number) => {
  const total = Math.round(s); // rounding only the remainder gave "10:60"
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Context for a declarative wiki article (lib/wiki.ts) in one language — the same texts the app renders. */
function wikiCtx(d: Data, lang: Lang): WikiCtx {
  const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(LANGS.find((x) => x.id === lang)!.locale, o);
  return {
    t: (k, v) => t(lang, k, v),
    d: { generic: d.local[lang].generic, npcs: d.npcs, map: d.map, shop: d.local[lang].shop },
    f: {
      int: (n) => nf({ maximumFractionDigits: 0 }).format(n),
      pct: (r) => `${nf({ maximumFractionDigits: 0 }).format(r * 100)}%`,
      flex: (n) => nf({ maximumFractionDigits: 2, useGrouping: false }).format(n),
    },
  };
}

function wikiBlockHtml(d: Data, lang: Lang, c: WikiCtx, b: Block): string {
  const x = (v: Parameters<typeof resolveText>[1]) => esc(resolveText(c, v));
  switch (b.k) {
    case 'p':
      return `<p>${x(b.text)}</p>`;
    case 'cards':
      return `<ul>${b.items.map((it) => `<li><b>${x(it.title)}</b>${it.tag ? ` (${x(it.tag)})` : ''} — ${x(it.text)}</li>`).join('')}</ul>`;
    case 'table':
      return `<table><tr>${b.head.map((h) => `<th>${esc(c.t(h))}</th>`).join('')}</tr>${b
        .rows(c)
        .map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
        .join('')}</table>`;
    case 'terms':
      return `<dl>${b.items.map((it) => `<dt>${esc(c.t(it.term))}</dt><dd>${esc(c.t(it.text))}</dd>`).join('')}</dl>`;
    case 'link':
      return `<p>${link(lang, b.to, c.t(b.text))}</p>`;
    case 'levels':
      return `<table>${LEVEL_SOULS.map(
        (souls, lvl) => `<tr><td>${esc(c.t('wiki.souls.lvl', { n: lvl }))}</td><td>${esc(c.f.int(souls))}</td><td>${esc(c.t(UNLOCK_LEVELS.has(lvl) ? 'wiki.souls.unlock' : 'wiki.souls.point'))}</td></tr>`,
      ).join('')}</table>`;
    case 'tiers': {
      const prices = c.d.generic?.item_price_per_tier ?? [];
      const roman = ['', 'I', 'II', 'III', 'IV'];
      return `<ul>${[1, 2, 3, 4]
        .map((tier) => {
          const n = c.d.shop.filter((it) => it.item_tier === tier).length;
          return `<li><b>${esc(c.t('item.tier', { roman: roman[tier] }))}</b> — ${prices[tier] !== undefined ? esc(c.f.int(prices[tier])) : ''} · ${esc(c.t('wiki.shop.items', { n }).replace('{n}', String(n)))}</li>`;
        })
        .join('')}</ul>`;
    }
    case 'ranks': {
      const byTier = new Map<number, number>();
      for (const r of d.badges) {
        const tier = Math.floor(r.badge_level / 10);
        if (tier >= 1) byTier.set(tier, (byTier.get(tier) ?? 0) + r.unique_players);
      }
      const total = [...byTier.values()].reduce((a, b) => a + b, 0);
      const ranks = d.local[lang].ranks.filter((r) => r.tier >= 1).sort((a, b) => b.tier - a.tier);
      return `<ol>${ranks
        .map((r) => `<li><b>${esc(r.name)}</b>${total ? ` — ${esc(c.t('wiki.ranks.share', { pct: pct(lang, (byTier.get(r.tier) ?? 0) / total) }))}` : ''}</li>`)
        .join('')}</ol>`;
    }
  }
}

/** Links to every wiki article (static pages link to each other, like the tabs on the page). */
const wikiTabs = (lang: Lang) => `<ul>${ARTICLES.map((x) => `<li>${link(lang, articlePath(x), t(lang, x.tab))}</li>`).join('')}</ul>`;

/** The app's footer links on every static page (wiki articles, counter guides, about) — the same links Google sees after rendering. */
const footBlock = (lang: Lang) =>
  `<footer><h2>${esc(t(lang, 'nav.wiki'))}</h2>${wikiTabs(lang)}<p>${link(lang, '/counters', t(lang, 'ctr.eyebrow'))} · ${link(lang, '/about', t(lang, 'nav.about'))}</p></footer>`;

/**
 * Structured data for a wiki page: an Article about Deadlock (author = the owner, BethakZS) + breadcrumbs
 * Deadbuff › Wiki › article, and for the glossary the terms as a DefinedTermSet.
 */
function wikiJsonLd(a: WikiArticle, image?: string) {
  const modified = new Date().toISOString().slice(0, 10);
  return (lang: Lang, url: string): Record<string, unknown> => {
    const abs = (path: string) => `${SITE_URL}${pathForLang(path, lang)}`;
    const crumbs = [
      { name: 'Deadbuff', item: abs('/') },
      { name: t(lang, 'wiki.eyebrow'), item: abs('/wiki') },
      ...(a.slug ? [{ name: t(lang, a.tab), item: url }] : []),
    ];
    const terms = a.sections.flatMap((s) => s.blocks.flatMap((b) => (b.k === 'terms' ? b.items : [])));
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          headline: headline(t(lang, a.meta)),
          description: t(lang, a.metaDesc),
          url,
          mainEntityOfPage: url,
          inLanguage: LANGS.find((x) => x.id === lang)!.locale,
          dateModified: modified,
          ...(image ? { image } : {}),
          about: { '@type': 'VideoGame', name: 'Deadlock' },
          author: { '@type': 'Person', name: 'BethakZS', url: 'https://www.twitch.tv/bethakzs' },
          publisher: { '@type': 'Organization', name: 'Deadbuff', url: abs('/') },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
        },
        ...(terms.length
          ? [
              {
                '@type': 'DefinedTermSet',
                name: t(lang, a.title),
                url,
                hasDefinedTerm: terms.map((x) => ({ '@type': 'DefinedTerm', name: t(lang, x.term), description: t(lang, x.text) })),
              },
            ]
          : []),
      ],
    };
  };
}

/** A declarative wiki article as static text (React replaces it on mount). */
function wikiArticleBody(d: Data, lang: Lang, a: WikiArticle) {
  const c = wikiCtx(d, lang);
  return (
    `<h1>${esc(t(lang, 'wiki.eyebrow'))} — ${esc(t(lang, a.title))}</h1><p>${esc(t(lang, a.lead))}</p>${navBlock(lang)}${wikiTabs(lang)}` +
    a.sections
      .map(
        (s) =>
          `<h2 id="${s.id}">${esc(t(lang, s.title))}</h2>${s.sub ? `<p>${esc(resolveText(c, s.sub))}</p>` : ''}${s.blocks.map((b) => wikiBlockHtml(d, lang, c, b)).join('')}`,
      )
      .join('') +
    `<p>${esc(t(lang, 'wiki.note'))}</p>`
  );
}

/** /wiki as text: lanes, districts, objectives with health, the camp table, events, timings, getting around. */
function wikiBody(d: Data, lang: Lang) {
  const num = wikiNumbers(d.npcs);
  const places = d.local[lang].generic?.map_districts;
  const rejuv = midbossVars(d.local[lang].generic?.rejuv_params);
  const pctOf = (r: number) => `${new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(r * 100)}%`;
  const boss = rejuv ? t(lang, 'wiki.ev.midboss.d', { min: rejuv.min, hp: pctOf(rejuv.hp), resp: pctOf(rejuv.resp) }) : t(lang, 'wiki.ev.midboss.short');
  const int = (n: number | undefined) => (n === undefined ? '—' : new Intl.NumberFormat(lang).format(n));
  const team = (n: number) => t(lang, n ? 'match.team1' : 'match.team0');
  const lanes = LANES.map(
    (l, i) =>
      `<li><b>${esc(d.local[lang].lanes[i] ?? '')}</b> (${esc(t(lang, l.side === 'mid' ? 'wiki.lane.mid' : 'wiki.lane.side'))}) — ${esc(t(lang, l.text))} · ${esc(l.spots.map((x) => placeName(x, places)).join(', '))} · ${esc(t(lang, 'wiki.lane.near'))}: ${esc(l.near.map((x) => districtName(x, places)).join(', '))}</li>`,
  ).join('');
  const districts = DISTRICTS.map((x) => `<li><b>${esc(districtName(x.id, places))}</b> (${esc(t(lang, 'wiki.side', { team: team(x.team) }))}) — ${esc(t(lang, x.text))}</li>`).join('');
  const objText = (id: (typeof OBJECTIVES)[number]['id']) => {
    if (id === 'walker' && num.walker) return t(lang, 'wiki.obj.walker.d', { dmg: num.walker.dmg, pct: num.walker.pct, stun: num.walker.stun });
    const p = num.patron;
    if (id === 'patron' && p?.hp2 && p.regen && p.delay && p.growth && p.from)
      return t(lang, 'wiki.obj.patron.d', { hp: int(p.hp2), regen: p.regen, delay: p.delay, growth: p.growth, from: p.from });
    return t(lang, (id === 'walker' ? 'wiki.obj.walker.short' : id === 'patron' ? 'wiki.obj.patron.short' : `wiki.obj.${id}.d`) as MsgKey);
  };
  const objectives = OBJECTIVES.map((o) => {
    const hp = o.npc ? num.hp(o.npc) : undefined;
    return `<li><b>${esc(t(lang, `wiki.obj.${o.id}` as MsgKey))}</b> — ${esc(t(lang, 'wiki.perTeam', { n: o.count }))}${hp ? `, ${esc(int(hp))} ${esc(t(lang, 'wiki.health'))}` : ''} · ${esc(objText(o.id))}</li>`;
  }).join('');
  const campName: Record<string, MsgKey> = { weak: 'wiki.neu.weak', medium: 'wiki.neu.medium', strong: 'wiki.neu.strong', vault: 'wiki.layer.sinners' };
  const camps = CAMP_KINDS.map(
    (c) =>
      `<tr><td>${esc(t(lang, campName[c.kind]))}</td><td>${d.map ? campCount(d.map, c.kind) : '—'}</td><td>${esc(int(num.hp(c.npc)))}</td><td>${esc(int(num.souls(c.npc)))}</td><td>${clock(c.spawn)}</td><td>${clock(c.respawn)}</td></tr>`,
  ).join('');
  const head = (['wiki.neu.camp', 'wiki.neu.count', 'wiki.health', 'wiki.neu.souls', 'wiki.neu.spawn', 'wiki.neu.respawn'] as MsgKey[]).map((k) => `<th>${esc(t(lang, k))}</th>`).join('');
  const events = (
    [
      ['wiki.ev.midboss', t(lang, 'wiki.ev.start'), boss],
      ['wiki.layer.urn', clock(600), 'wiki.ev.urn.d'],
      ['wiki.layer.rift', `≈ ${clock(660)}`, 'wiki.ev.rift.d'],
      ['wiki.layer.bridge', t(lang, 'wiki.ev.every5'), 'wiki.ev.bridge.d'],
      ['wiki.layer.snacks', clock(150), 'wiki.ev.snacks.d'],
      ['wiki.ev.boxes', clock(180), 'wiki.ev.boxes.d'],
      // the rest are dictionary keys
    ] as [MsgKey, string, string][]
  )
    .map(([title, when, text]) => `<li><b>${esc(t(lang, title))}</b> (${esc(when)}) — ${esc(text.startsWith('wiki.') ? t(lang, text as MsgKey) : text)}</li>`)
    .join('');
  const timeline = TIMELINE.map((e) => `<li><b>${e.approx ? '≈ ' : ''}${clock(e.at)}</b> — ${esc(t(lang, e.text))}</li>`).join('');
  const moving = (
    [
      ['wiki.map.lanes', 'wiki.move.zip'],
      ['wiki.layer.teleporters', 'wiki.move.tp'],
      ['wiki.layer.pads', 'wiki.move.pads'],
      ['wiki.layer.ropes', 'wiki.move.ropes'],
      ['wiki.layer.vents', 'wiki.move.vents'],
      ['wiki.layer.veils', 'wiki.move.veils'],
      ['wiki.move.secret', 'wiki.move.secret.d'],
      ['wiki.move.fog', 'wiki.move.fog.d'],
    ] as [MsgKey, MsgKey][]
  )
    .map(([title, text]) => `<li><b>${esc(t(lang, title))}</b> — ${esc(t(lang, text))}</li>`)
    .join('');
  return (
    `<h1>${esc(t(lang, 'wiki.eyebrow'))} — ${esc(t(lang, 'wiki.title'))}</h1><p>${esc(t(lang, 'wiki.lead'))}</p>${navBlock(lang)}${wikiTabs(lang)}` +
    `<h2 id="wiki-lanes">${esc(t(lang, 'wiki.lanes.title'))}</h2><p>${esc(t(lang, 'wiki.lanes.sub'))}</p><ul>${lanes}</ul>` +
    `<h3>${esc(t(lang, 'wiki.districts.title'))}</h3><ul>${districts}</ul>` +
    `<h2 id="wiki-objectives">${esc(t(lang, 'wiki.obj.title'))}</h2><p>${esc(t(lang, 'wiki.obj.sub'))}</p><ol>${objectives}</ol>` +
    `<h2 id="wiki-neutrals">${esc(t(lang, 'wiki.neu.title'))}</h2><p>${esc(t(lang, 'wiki.neu.sub', { pct: num.soulGrowth ?? 1 }))}</p><table><tr>${head}</tr>${camps}</table>` +
    `<h2 id="wiki-events">${esc(t(lang, 'wiki.ev.title'))}</h2><ul>${events}</ul>` +
    `<h2 id="wiki-timings">${esc(t(lang, 'wiki.tl.title'))}</h2><ul>${timeline}</ul>` +
    `<h2 id="wiki-moving">${esc(t(lang, 'wiki.move.title'))}</h2><ul>${moving}</ul>` +
    `<p>${esc(t(lang, 'wiki.note'))}</p>`
  );
}

function pages(d: Data): PageDef[] {
  const byWr = [...d.rows].sort((a, b) => b.winRate - a.winRate);
  // shop items are keyed by the ENGLISH list; localised names are looked up per language by class_name
  // only items with stats get a page (as in the shop view — no empty "no data" pages)
  const listed = d.shopEn.filter((x) => d.itemStats.has(x.item.id));
  const slugOf = new Map<number, string>(listed.map((x) => [x.item.id, x.slug]));
  const playerMatches = d.stats.reduce((a, s) => a + s.matches, 0) || 1;
  const heroStat = new Map(d.stats.map((s) => [s.hero_id, s]));
  const fallbackImage = byWr[0]?.hero.images.icon_hero_card;
  const ctr = counterData(d);
  const list: PageDef[] = [
    {
      path: '/',
      title: (l) => t(l, 'meta.title'),
      description: (l) => t(l, 'meta.desc.home'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(`Deadbuff — ${t(l, 'home.eyebrow')} — ${t(l, 'home.title1')} ${t(l, 'home.title2')} ${t(l, 'home.title3')}`)}</h1><p>${esc(t(l, 'home.lead'))}</p>${navBlock(l)}<h2>${esc(t(l, 'home.pickHero'))}</h2>${heroLinks(d, l, byWr)}`,
    },
    {
      path: '/heroes',
      title: (l) => t(l, 'meta.heroes'),
      description: (l) => t(l, 'meta.desc.heroes'),
      image: fallbackImage,
      body: (l) => `<h1>${esc(t(l, 'heroes.title'))}</h1><p>${esc(t(l, 'meta.desc.heroes'))}</p>${navBlock(l)}${heroLinks(d, l, byWr)}`,
    },
    {
      path: '/tier-list',
      title: (l) => t(l, 'meta.tier'),
      description: (l) => t(l, 'meta.desc.tier'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(t(l, 'tier.title'))}</h1><p>${esc(t(l, 'tier.sub'))}</p>${navBlock(l)}` +
        (['S', 'A', 'B', 'C', 'D'] as Tier[])
          .map((tier) => {
            const rows = [...d.rows].filter((r) => r.tier === tier).sort((a, b) => b.score - a.score);
            return `<h2>${tier} — ${esc(t(l, `tier.${tier}` as MsgKey))}</h2>${heroLinks(d, l, rows)}`;
          })
          .join(''),
    },
    {
      path: '/items',
      title: (l) => t(l, 'meta.items'),
      description: (l) => t(l, 'meta.desc.items'),
      image: fallbackImage,
      body: (l) => {
        const shop = d.local[l].shop.filter((i) => slugOf.has(i.id));
        return (
          `<h1>${esc(t(l, 'items.title'))}</h1><p>${esc(t(l, 'items.sub'))}</p><p>${link(l, '/wiki/shop', t(l, 'wiki.link.shop'))}</p>${navBlock(l)}` +
          (['weapon', 'vitality', 'spirit'] as const)
            .map(
              (slot) =>
                `<h2>${esc(t(l, `slot.${slot}` as MsgKey))}</h2><ul>${shop
                  .filter((i) => i.item_slot_type === slot)
                  .sort((a, b) => (a.item_tier ?? 0) - (b.item_tier ?? 0) || a.name.localeCompare(b.name))
                  .map((i) => `<li>${slugOf.has(i.id) ? link(l, `/items/${slugOf.get(i.id)}`, i.name) : esc(i.name)} — ${esc(t(l, 'item.tierShort', { n: i.item_tier ?? 0 }))}</li>`)
                  .join('')}</ul>`,
            )
            .join('')
        );
      },
    },
    {
      path: '/builds',
      title: (l) => t(l, 'meta.builds'),
      description: (l) => t(l, 'meta.desc.builds'),
      image: fallbackImage,
      body: (l) => `<h1>${esc(t(l, 'builds.title'))}</h1><p>${esc(t(l, 'builds.sub'))}</p>${navBlock(l)}${heroLinks(d, l, byWr)}`,
    },
    {
      path: '/players',
      title: (l) => t(l, 'meta.players'),
      description: (l) => t(l, 'meta.desc.players'),
      image: fallbackImage,
      body: (l) => `<h1>${esc(t(l, 'players.title'))}</h1><p>${esc(t(l, 'players.sub'))}</p>${navBlock(l)}`,
    },
    {
      path: '/patches',
      title: (l) => t(l, 'meta.patches'),
      description: (l) => t(l, 'meta.desc.patches'),
      image: fallbackImage,
      body: (l) => {
        const p = d.patch;
        if (!p) return `<h1>${esc(t(l, 'patch.title'))}</h1><p>${esc(t(l, 'patch.sub'))}</p>${navBlock(l)}`;
        const li = (r: PatchImpactRow) =>
          `<li>${link(l, `/heroes/${r.hero.slug}`, heroText(d, r.hero, l).name)} — ${pct(l, r.wrBefore)} → ${pct(l, r.wrAfter)} (${r.dWr >= 0 ? '+' : '−'}${pct(l, Math.abs(r.dWr))})</li>`;
        return (
          `<h1>${esc(t(l, 'patch.title'))} — ${esc(p.point.day)}</h1><p>${esc(t(l, 'patch.sub'))}</p>${navBlock(l)}` +
          `<h2>${esc(t(l, 'patch.winners'))}</h2><ul>${p.rows.filter((r) => r.dWr > 0).slice(0, 8).map(li).join('')}</ul>` +
          `<h2>${esc(t(l, 'patch.losers'))}</h2><ul>${[...p.rows].reverse().filter((r) => r.dWr < 0).slice(0, 8).map(li).join('')}</ul>`
        );
      },
    },
    {
      path: '/leaderboard',
      title: (l) => t(l, 'meta.leaderboard'),
      description: (l) => t(l, 'meta.desc.leaderboard'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(t(l, 'lb.title'))}</h1><p>${esc(t(l, 'lb.sub'))}</p><p>${link(l, '/wiki/ranks', t(l, 'wiki.link.ranks'))}</p>${navBlock(l)}<h2>${esc(t(l, 'lb.region.Europe'))}</h2><ol>${d.leaderboard
          .slice(0, 50)
          .map((e) => `<li>${esc(e.account_name)}</li>`)
          .join('')}</ol>`,
    },
    {
      path: '/matches',
      title: (l) => t(l, 'meta.matches'),
      description: (l) => t(l, 'meta.desc.matches'),
      image: fallbackImage,
      body: (l) => `<h1>${esc(t(l, 'matches.title'))}</h1><p>${esc(t(l, 'matches.sub'))}</p>${navBlock(l)}`,
    },
    {
      // draft helper: the three modes + every hero's best counter-picks as text ("deadlock haze counter")
      path: '/draft',
      title: (l) => t(l, 'meta.draft'),
      description: (l) => t(l, 'meta.desc.draft'),
      image: fallbackImage,
      body: (l) => {
        const steps = (['draft.step1', 'draft.step2', 'draft.step3'] as const).map((k) => `<li>${esc(t(l, k))}</li>`).join('');
        return `<h1>${esc(t(l, 'draft.title'))}</h1><p>${esc(t(l, 'draft.sub'))}</p><h2>${esc(t(l, 'draft.howTitle'))}</h2><ol>${steps}</ol>${navBlock(l)}<h2>${esc(t(l, 'draft.counterPages'))}</h2><ul>${counterLines(d, l, ctr)}</ul>`;
      },
    },
    {
      // who makes the site (the owner is the Deadlock streamer BethakZS) and where the data comes from
      path: '/about',
      title: (l) => t(l, 'meta.about'),
      description: (l) => t(l, 'meta.desc.about'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(`${t(l, 'about.title1')} ${t(l, 'about.title2')}`)}</h1><p>${esc(t(l, 'about.lead'))}</p>${navBlock(l)}` +
        `<h2>${esc(t(l, 'about.what'))}</h2><ul>${(['f1', 'f2', 'f3'] as const)
          .map((f) => `<li><b>${esc(t(l, `about.${f}.t` as MsgKey))}</b> — ${esc(t(l, `about.${f}.d` as MsgKey))}</li>`)
          .join('')}</ul>` +
        `<h2>${esc(t(l, 'about.who'))}</h2><p>${esc(t(l, 'about.whoText', { name: 'BethakZS' }))}</p><p><a href="https://www.twitch.tv/bethakzs">${esc(t(l, 'about.twitch'))}</a></p>` +
        `<h2>${esc(t(l, 'about.data'))}</h2><p>${esc(t(l, 'about.dataText'))}</p><p><a href="https://deadlock-api.com">Deadlock API</a> · <a href="https://deadlock-api.com/ingest-cache">${esc(t(l, 'about.ingest'))}</a></p>`,
      jsonLd: (l, url) => ({
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: t(l, 'meta.about'),
        url,
        inLanguage: LANGS.find((x) => x.id === l)!.locale,
        about: { '@type': 'WebSite', name: 'Deadbuff', url: `${SITE_URL}/` },
        author: { '@type': 'Person', name: 'BethakZS', url: 'https://www.twitch.tv/bethakzs', sameAs: ['https://www.twitch.tv/bethakzs'] },
      }),
    },
    {
      // wiki: the map — lanes, objectives with health, neutral camps, events and match timings
      path: '/wiki',
      title: (l) => t(l, 'meta.wiki'),
      description: (l) => t(l, 'meta.desc.wiki'),
      image: fallbackImage,
      body: (l) => wikiBody(d, l),
      jsonLd: wikiJsonLd(ARTICLES[0], fallbackImage),
    },
    ...ARTICLES.filter((a) => a.id !== 'map').map<PageDef>((a) => ({
      path: articlePath(a),
      title: (l) => t(l, a.meta),
      description: (l) => t(l, a.metaDesc),
      image: fallbackImage,
      body: (l) => wikiArticleBody(d, l, a),
      jsonLd: wikiJsonLd(a, fallbackImage),
    })),
    {
      // counter guides index: every hero with its top counters
      path: '/counters',
      title: (l) => t(l, 'meta.countersIndex'),
      description: (l) => t(l, 'meta.desc.countersIndex'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(t(l, 'ctr.indexTitle'))}</h1><p>${esc(t(l, 'ctr.indexSub'))}</p>${navBlock(l)}<p>${link(l, '/draft', t(l, 'home.draftCta'))}</p><ul>${counterLines(d, l, ctr)}</ul>`,
    },
  ];

  // one counter page per hero: who beats it (draft maths), whom it beats, items that work against it
  const itemSlugOf = new Map(d.shopEn.map((x) => [x.item.id, x.slug]));
  const baseItems = [...d.itemStats.values()];
  for (const hero of d.heroes) {
    const res = ctr.get(hero.id) ?? { counters: [], victims: [] };
    const row = d.rows.find((r) => r.hero.id === hero.id);
    const items = itemsVsLineup(baseItems, [{ enemyId: hero.id, stats: d.itemsVs.get(hero.id) ?? [] }], (id) => itemSlugOf.has(id))
      .filter((x) => x.score > 0.002)
      .slice(0, 8);
    const nameIn = (l: Lang) => heroText(d, hero, l).name;
    const itemName = (l: Lang, id: number) => {
      const en = d.shopEn.find((x) => x.item.id === id)?.item;
      return en ? (d.local[l].items.get(en.class_name)?.name ?? en.name) : '';
    };
    list.push({
      path: `/counters/${hero.slug}`,
      title: (l) => t(l, 'meta.counters', { name: nameIn(l), en: hero.name }),
      description: (l) => t(l, 'meta.desc.counters', { name: nameIn(l), en: hero.name }),
      image: hero.images.icon_hero_card ?? fallbackImage,
      body: (l) => {
        const name = nameIn(l);
        const heroLi = (x: { hero: Hero; base: number; fx: { wr: number; delta: number; matches: number } }) =>
          `<li>${link(l, `/heroes/${x.hero.slug}`, heroText(d, x.hero, l).name)} — ${esc(t(l, 'ctr.vsName', { name }))} ${pct(l, x.fx.wr)} · ${esc(t(l, 'ctr.usual'))} ${pct(l, x.base - ((row?.winRate ?? 0.5) - 0.5))} · ${esc(t(l, 'ctr.effect'))} ${x.fx.delta >= 0 ? '+' : '−'}${pct(l, Math.abs(x.fx.delta))} · ${x.fx.matches} ${esc(t(l, 'ctr.games'))}</li>`;
        return (
          `<h1>${esc(t(l, 'ctr.title', { name }))}</h1><p>${esc(t(l, 'ctr.sub', { name }))}</p>` +
          (row ? `<p>${esc(t(l, 'stat.winRate'))} ${pct(l, row.winRate)} · ${esc(t(l, 'stat.pickRate'))} ${pct(l, row.pickRate)}</p>` : '') +
          `${navBlock(l)}<p>${link(l, `/draft?e=${hero.slug}`, t(l, 'ctr.openDraft'))} · ${link(l, `/heroes/${hero.slug}`, t(l, 'ctr.heroPage', { name }))}</p>` +
          `<h2>${esc(t(l, 'ctr.best'))}</h2><ol>${res.counters.slice(0, 10).map(heroLi).join('')}</ol>` +
          (res.victims.length ? `<h2>${esc(t(l, 'ctr.strongVs', { name }))}</h2><ul>${res.victims.slice(0, 6).map(heroLi).join('')}</ul>` : '') +
          (items.length
            ? `<h2>${esc(t(l, 'ctr.items', { name }))}</h2><ul>${items
                .map((x) => `<li>${link(l, `/items/${itemSlugOf.get(x.itemId)}`, itemName(l, x.itemId))} +${pct(l, x.score)}</li>`)
                .join('')}</ul>`
            : '') +
          `<h2>${esc(t(l, 'ctr.others'))}</h2><ul>${d.heroes
            .map((h) => `<li>${link(l, `/counters/${h.slug}`, t(l, 'ctr.linkName', { name: heroText(d, h, l).name }))}</li>`)
            .join('')}</ul>`
        );
      },
    });
  }

  // one page per shop item (English slug in every language)
  for (const { item, slug } of listed) {
    const stat = d.itemStats.get(item.id);
    const wr = stat ? stat.wins / stat.matches : undefined;
    const localItem = (l: Lang) => d.local[l].items.get(item.class_name) ?? item;
    const nameIn = (l: Lang, it: Item) => d.local[l].items.get(it.class_name)?.name ?? it.name;
    const buyers = d.itemByHero
      .filter((r) => r.item_id === item.id)
      .map((r) => {
        const hero = d.heroes.find((h) => h.id === r.bucket);
        const hs = heroStat.get(r.bucket);
        return hero && hs?.matches ? { hero, share: r.matches / hs.matches, wr: r.wins / r.matches } : null;
      })
      .filter((x): x is { hero: Hero; share: number; wr: number } => !!x)
      .sort((a, b) => b.share - a.share)
      .slice(0, 10);
    const from = (item.component_items ?? []).map((c) => listed.find((x) => x.item.class_name === c)).filter((x): x is { item: Item; slug: string } => !!x);
    const into = listed.filter((x) => x.item.component_items?.includes(item.class_name));
    // the rest of its shop column (same slot and tier) — item pages link to each other, not only up to heroes
    const siblings = listed.filter((x) => x.item.id !== item.id && x.item.item_slot_type === item.item_slot_type && x.item.item_tier === item.item_tier);
    list.push({
      path: `/items/${slug}`,
      title: (l) => t(l, 'meta.item', { name: localItem(l).name }),
      description: (l) => t(l, 'meta.desc.item', { name: localItem(l).name, wr: wr !== undefined ? pct(l, wr) : '—' }),
      image: item.shop_image ?? fallbackImage,
      body: (l) => {
        const it = localItem(l);
        const slot = item.item_slot_type ? t(l, `slot.${item.item_slot_type}` as MsgKey) : '';
        const statLine = stat
          ? `<p>${esc(t(l, 'stat.winRate'))} ${pct(l, wr!)} · ${esc(t(l, 'stat.pickRate'))} ${pct(l, stat.matches / playerMatches)}${
              stat.avg_buy_time_s ? ` · ${esc(t(l, 'stat.avgBuy'))} ${mmss(stat.avg_buy_time_s)}` : ''
            }</p>`
          : '';
        const itemLinks = (xs: { item: Item; slug: string }[]) => `<ul>${xs.map((x) => `<li>${link(l, `/items/${x.slug}`, nameIn(l, x.item))}</li>`).join('')}</ul>`;
        return (
          `<h1>${esc(it.name)}</h1><p>${esc(slot)}${item.item_tier ? ` · ${esc(t(l, 'item.tierShort', { n: item.item_tier }))}` : ''}${item.cost ? ` · ${item.cost}` : ''}</p>` +
          `<p>${esc(itemText(it))}</p>${statLine}${navBlock(l)}` +
          (buyers.length
            ? `<h2>${esc(t(l, 'ip.heroes'))}</h2><ul>${buyers
                .map((x) => `<li>${link(l, `/heroes/${x.hero.slug}`, heroText(d, x.hero, l).name)} — ${pct(l, x.share)} · ${esc(t(l, 'stat.winRate'))} ${pct(l, x.wr)}</li>`)
                .join('')}</ul>`
            : '') +
          (from.length ? `<h2>${esc(t(l, 'ip.buildsFrom'))}</h2>${itemLinks(from)}` : '') +
          (into.length ? `<h2>${esc(t(l, 'ip.buildsInto'))}</h2>${itemLinks(into)}` : '') +
          (siblings.length ? `<h2>${esc(slot)}${item.item_tier ? ` · ${esc(t(l, 'item.tierShort', { n: item.item_tier }))}` : ''}</h2>${itemLinks(siblings)}` : '')
        );
      },
    });
  }


  // item names in any language by id (hero item lists, builds); links only to items that have a page
  const enItemById = new Map([...d.local.en.items.values()].map((i) => [i.id, i]));
  const itemNameIn = (l: Lang, id: number) => {
    const en = enItemById.get(id);
    return en ? (d.local[l].items.get(en.class_name)?.name ?? en.name) : '';
  };
  const itemRef = (l: Lang, id: number) => (slugOf.has(id) ? link(l, `/items/${slugOf.get(id)}`, itemNameIn(l, id)) : esc(itemNameIn(l, id)));

  // pro games as text (hero pages and /pros): who, result, K/D/A
  const prosById = new Map(d.pros.map((p) => [p.id, p]));
  const proLi = (l: Lang, g: ProGame, withHero: boolean) => {
    const hero = withHero ? d.heroes.find((h) => h.id === g.player.hero_id) : undefined;
    return `<li>${esc(g.pro.name)} (${REGION_TAG[g.pro.region]} #${g.pro.rank})${hero ? ` — ${link(l, `/heroes/${hero.slug}`, heroText(d, hero, l).name)}` : ''} — ${esc(
      t(l, g.won ? 'player.win' : 'player.loss'),
    )} · ${g.player.kills}/${g.player.deaths}/${g.player.assists} · ${g.match.match_id}</li>`;
  };

  for (const hero of d.heroes) {
    const row = d.rows.find((r) => r.hero.id === hero.id);
    const heroPros = proGames(d.proMatches.get(hero.id), prosById, enItemById, hero.id);
    const proBuild = itemTally(heroPros).slice(0, 8);
    const prosHtml = (l: Lang, name: string) =>
      heroPros.length
        ? `<h2>${esc(t(l, 'pros.onHero', { hero: name }))}</h2><ul>${heroPros
            .slice(0, 8)
            .map((g) => proLi(l, g, false))
            .join('')}</ul>${proBuild.length ? `<p>${esc(t(l, 'pros.theyBuild'))}: ${proBuild.map((b) => `${itemRef(l, b.itemId)} ${pct(l, b.share)}`).join(', ')}</p>` : ''}<p>${link(
            l,
            '/pros',
            t(l, 'pros.allGames'),
          )}</p>`
        : '';
    const base = `/heroes/${hero.slug}`;
    const titleOf = (l: Lang, tab: HeroTab) => {
      const h = heroText(d, hero, l);
      return t(l, `meta.hero.${tab}` as MsgKey, { name: h.name, en: h.en });
    };
    // one description per tab — the same keys as HeroPage's useDocumentMeta()
    const descOf = (l: Lang, tab: HeroTab) => {
      const h = heroText(d, hero, l);
      return t(l, (tab === 'overview' ? 'meta.desc.hero' : `meta.desc.hero.${tab}`) as MsgKey, { name: h.name, en: h.en, wr: row ? pct(l, row.winRate) : '—' });
    };
    const tabNav = (l: Lang) =>
      `<nav>${HERO_TABS.map((tab) => link(l, tab === 'overview' ? base : `${base}/${tab}`, t(l, `hero.tab.${tab}` as MsgKey))).join('')}</nav>`;
    // what this hero buys, as on the Items tab: share of its games with the item, win rate with it, average buy minute
    const hs = heroStat.get(hero.id);
    const bought = hs?.matches
      ? d.itemByHero
          .filter((r) => r.bucket === hero.id && r.matches > 0 && slugOf.has(r.item_id))
          .map((r) => ({ id: r.item_id, share: r.matches / hs.matches, wr: r.wins / r.matches, buy: r.avg_buy_time_s }))
          .sort((a, b) => b.share - a.share)
      : [];
    const itemLi = (l: Lang, x: (typeof bought)[number]) => {
      const it = enItemById.get(x.id);
      const slot = it?.item_slot_type ? t(l, `slot.${it.item_slot_type}` as MsgKey) : '';
      return `<li>${itemRef(l, x.id)} — ${esc(slot)}${it?.item_tier ? ` · ${esc(t(l, 'item.tierShort', { n: it.item_tier }))}` : ''} · ${esc(t(l, 'stat.pickRate'))} ${pct(l, x.share)} · ${esc(
        t(l, 'stat.winRate'),
      )} ${pct(l, x.wr)}${x.buy ? ` · ${esc(t(l, 'stat.avgBuy'))} ${mmss(x.buy)}` : ''}</li>`;
    };
    const res = ctr.get(hero.id) ?? { counters: [], victims: [] };
    const sameRole = d.heroes.filter((h) => h.id !== hero.id && roleOf(h) === roleOf(hero));
    /** Counter guide + the other heroes of the same class — every tab links out, not only to its siblings. */
    const related = (l: Lang) =>
      `<p>${link(l, `/counters/${hero.slug}`, t(l, 'ctr.linkName', { name: heroText(d, hero, l).name }))} · ${link(l, '/draft', t(l, 'nav.draft'))}</p>` +
      (sameRole.length
        ? `<h2>${esc(t(l, 'nav.heroes'))} · ${esc(t(l, `role.${roleOf(hero)}` as MsgKey))}</h2><ul>${sameRole
            .map((h) => `<li>${link(l, `/heroes/${h.slug}`, heroText(d, h, l).name)}</li>`)
            .join('')}</ul>`
        : '');
    const intro = (l: Lang, tab: HeroTab) => {
      const h = heroText(d, hero, l);
      const stats = row
        ? `<p>${esc(t(l, 'stat.winRate'))} ${pct(l, row.winRate)} · ${esc(t(l, 'stat.pickRate'))} ${pct(l, row.pickRate)} · KDA ${new Intl.NumberFormat(l, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(row.kda)} · ${esc(t(l, 'stat.tier'))} ${row.tier}</p>`
        : '';
      return `<h1>${esc(headline(titleOf(l, tab)))}</h1>${h.description.role ? `<p><em>${esc(h.description.role)}</em></p>` : ''}<p>${esc(
        t(l, `role.${roleOf(hero)}` as MsgKey),
      )}${h.tags.length ? ` · ${esc(h.tags.join(' · '))}` : ''}</p>${stats}${tabNav(l)}${navBlock(l)}`;
    };
    const abilities = (l: Lang) => {
      const items = d.local[l].items;
      return ['signature1', 'signature2', 'signature3', 'signature4']
        .map((slot) => items.get(hero.items[slot]) ?? d.local.en.items.get(hero.items[slot]))
        .filter((a): a is Item => !!a)
        .map((a, i) => {
          const ups = [a.description?.t1_desc, a.description?.t2_desc, a.description?.t3_desc]
            .map((u, n) => (u ? `<li>T${n + 1}: ${esc(stripHtml(u))}</li>` : ''))
            .join('');
          return `<h3>${i === 3 ? esc(t(l, 'ability.ultimate')) : esc(t(l, 'ability.n', { n: i + 1 }))}: ${esc(a.name)}</h3><p>${esc(
            stripHtml(abilityDescription(a)),
          )}</p>${ups ? `<ul>${ups}</ul>` : ''}`;
        })
        .join('');
    };
    const image = hero.images.icon_hero_card ?? fallbackImage;
    /** A community build as text: name, the author's note, every item by category (items link to their pages). */
    const buildHtml = (l: Lang, b: HeroBuild) => {
      const hb = b.hero_build;
      const note = hb.description ? stripHtml(hb.description).replace(/\s+/g, ' ').trim() : '';
      const isShop = (id: number) => {
        const it = enItemById.get(id);
        return !!it && isShopItem(it);
      };
      // same numbering as BuildCard: categories with items, "#Citadel_…" game tokens translated
      const cats = (hb.details?.mod_categories ?? [])
        .filter((c) => c.mods?.length)
        .map((c, i) => ({ name: buildCategoryName(c.name, i, (k, v) => t(l, k, v)), ids: [...new Set(c.mods.map((m) => m.ability_id))].filter(isShop) }))
        .filter((c) => c.ids.length);
      return (
        `<h3>${esc(hb.name || t(l, 'build.untitled'))}</h3>${note ? `<p>${esc(note.length > 280 ? `${note.slice(0, 277)}…` : note)}</p>` : ''}` +
        (cats.length ? `<ul>${cats.map((c) => `<li><b>${esc(c.name)}</b>: ${c.ids.map((id) => itemRef(l, id)).join(', ')}</li>`).join('')}</ul>` : '') +
        `<p>ID ${hb.hero_build_id}</p>`
      );
    };
    // win rate against every enemy hero (hero-counter-stats), best first
    const vs = d.counters
      .filter((c) => c.hero_id === hero.id && c.matches_played > 0)
      .map((c) => ({ other: d.heroes.find((h) => h.id === c.enemy_hero_id), wr: c.wins / c.matches_played, games: c.matches_played }))
      .filter((x): x is { other: Hero; wr: number; games: number } => !!x.other)
      .sort((a, b) => b.wr - a.wr);

    list.push(
      {
        path: base,
        title: (l) => titleOf(l, 'overview'),
        description: (l) => descOf(l, 'overview'),
        image,
        body: (l) => {
          const name = heroText(d, hero, l).name;
          return (
            `${intro(l, 'overview')}<h2>${esc(t(l, 'hero.abilities'))}</h2>${abilities(l)}` +
            (bought.length
              ? `<h2>${esc(t(l, 'hi.title'))}</h2><ul>${bought.slice(0, 6).map((x) => itemLi(l, x)).join('')}</ul><p>${link(l, `${base}/items`, t(l, 'hi.eyebrow', { name }))}</p>`
              : '') +
            (res.counters.length
              ? `<h2>${esc(t(l, 'ctr.best'))}</h2><ul>${res.counters
                  .slice(0, 3)
                  .map((x) => `<li>${link(l, `/heroes/${x.hero.slug}`, heroText(d, x.hero, l).name)} +${pct(l, x.fx.delta)}</li>`)
                  .join('')}</ul>`
              : '') +
            `<p>${link(l, `${base}/builds`, t(l, 'hb.eyebrow', { name }))}</p>${prosHtml(l, name)}${related(l)}`
          );
        },
      },
      {
        path: `${base}/builds`,
        title: (l) => titleOf(l, 'builds'),
        description: (l) => descOf(l, 'builds'),
        image,
        body: (l) =>
          `${intro(l, 'builds')}<h2>${esc(t(l, 'hb.title'))}</h2>${(d.builds.get(hero.id) ?? []).map((b) => buildHtml(l, b)).join('')}<p>${esc(
            t(l, 'build.copyHint'),
          )}</p>${related(l)}`,
      },
      {
        path: `${base}/items`,
        title: (l) => titleOf(l, 'items'),
        description: (l) => descOf(l, 'items'),
        image,
        body: (l) =>
          `${intro(l, 'items')}<h2>${esc(t(l, 'hi.title'))}</h2><ul>${bought
            .slice(0, 40)
            .map((x) => itemLi(l, x))
            .join('')}</ul>${related(l)}`,
      },
      {
        path: `${base}/matchups`,
        title: (l) => titleOf(l, 'matchups'),
        description: (l) => descOf(l, 'matchups'),
        image,
        body: (l) => {
          const li = (x: (typeof vs)[number]) =>
            `<li>${link(l, `/heroes/${x.other.slug}`, heroText(d, x.other, l).name)} — ${pct(l, x.wr)} · ${x.games} ${esc(t(l, 'ctr.games'))}</li>`;
          return (
            `${intro(l, 'matchups')}<h2>${esc(t(l, 'hero.strongVs'))}</h2><ul>${vs.slice(0, 5).map(li).join('')}</ul><h2>${esc(t(l, 'hero.weakVs'))}</h2><ul>${vs
              .slice(-5)
              .reverse()
              .map(li)
              .join('')}</ul>` +
            `<p>${link(l, `/counters/${hero.slug}`, t(l, 'ctr.fullGuide', { name: heroText(d, hero, l).name }))}</p>` +
            `<h2>${esc(t(l, 'hm.titleVs'))}</h2><ul>${vs.map(li).join('')}</ul>${related(l)}`
          );
        },
      },
      {
        path: `${base}/lore`,
        title: (l) => titleOf(l, 'lore'),
        description: (l) => descOf(l, 'lore'),
        image,
        body: (l) => {
          const h = heroText(d, hero, l);
          return `${intro(l, 'lore')}${loreParagraphs(h.description.lore)
            .map((p) => `<p>${esc(stripHtml(p))}</p>`)
            .join('')}${h.description.playstyle ? `<h2>${esc(t(l, 'lore.playstyle'))}</h2><p>${esc(stripHtml(h.description.playstyle))}</p>` : ''}${related(l)}`;
        },
      },
    );
  }

  // /pros: the newest pro games of the build (every hero's list, merged) and the pro list per region
  if (d.pros.length) {
    const latest = d.heroes
      .flatMap((h) => proGames(d.proMatches.get(h.id), prosById, enItemById, h.id))
      .sort((a, b) => b.at - a.at)
      .slice(0, 25);
    list.push({
      path: '/pros',
      title: (l) => t(l, 'meta.pros'),
      description: (l) => t(l, 'meta.desc.pros'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(t(l, 'pros.title'))}</h1><p>${esc(t(l, 'pros.sub'))}</p><p>${link(l, '/leaderboard', t(l, 'pros.toLeaderboard'))}</p>${navBlock(l)}` +
        (latest.length ? `<h2>${esc(t(l, 'pros.recent'))}</h2><ul>${latest.map((g) => proLi(l, g, true)).join('')}</ul>` : '') +
        PRO_REGIONS.map((r) => {
          const inRegion = d.pros.filter((p) => p.region === r).sort((a, b) => a.rank - b.rank);
          return inRegion.length
            ? `<h2>${esc(t(l, 'pros.list'))} — ${esc(t(l, `lb.region.${r}` as MsgKey))}</h2><ol>${inRegion
                .slice(0, 25)
                .map((p) => `<li>#${p.rank} ${esc(p.name)}</li>`)
                .join('')}</ol>`
            : '';
        }).join('') +
        `<p>${esc(t(l, 'pros.about'))}</p>`,
    });
  }
  return list;
}

/* ------------------------------- output ----------------------------- */

const fileFor = (urlPath: string) => (urlPath === '/' ? 'index.html' : `${urlPath.slice(1)}.html`);
const abs = (urlPath: string) => `${SITE_URL}${urlPath === '/' ? '/' : urlPath}`;

function render(template: string, page: PageDef, lang: Lang) {
  const meta = LANGS.find((l) => l.id === lang)!;
  const url = pathForLang(page.path, lang);
  const title = page.title(lang);
  const description = page.description(lang);
  const head: string[] = [];
  if (SITE_URL) {
    head.push(`<link rel="canonical" href="${esc(abs(url))}" />`);
    for (const l of LANGS) head.push(`<link rel="alternate" hreflang="${l.locale}" href="${esc(abs(pathForLang(page.path, l.id)))}" />`);
    head.push(`<link rel="alternate" hreflang="x-default" href="${esc(abs(pathForLang(page.path, 'en')))}" />`);
    head.push(`<meta property="og:url" content="${esc(abs(url))}" />`);
  }
  head.push(
    `<meta property="og:site_name" content="Deadbuff" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="${meta.og}" />`,
    ...LANGS.filter((l) => l.id !== lang).map((l) => `<meta property="og:locale:alternate" content="${l.og}" />`),
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  );
  if (page.image) head.push(`<meta property="og:image" content="${esc(page.image)}" />`, `<meta name="twitter:image" content="${esc(page.image)}" />`);
  if (page.path === '/' && SITE_URL) {
    // brand signals for Google: the site name (WebSite at the domain root, same @id in every language — /uk etc.
    // point at the root too) and who runs it. Add Deadbuff's own profiles (Reddit, Discord, X…) to sameAs when they exist
    const home = `${SITE_URL}/`;
    const twitch = 'https://www.twitch.tv/bethakzs';
    head.push(
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${home}#website`,
            name: 'Deadbuff',
            alternateName: ['DeadBuff', 'deadbuff.net'],
            url: home,
            inLanguage: meta.locale,
            description,
            about: { '@type': 'VideoGame', name: 'Deadlock' },
            publisher: { '@id': `${home}#organization` },
          },
          {
            '@type': 'Organization',
            '@id': `${home}#organization`,
            name: 'Deadbuff',
            alternateName: 'deadbuff.net',
            url: home,
            logo: `${SITE_URL}/favicon-192.png`,
            sameAs: ['https://github.com/Bethakzs/deadbuff'],
            founder: { '@type': 'Person', name: 'BethakZS', url: twitch, sameAs: [twitch] },
          },
        ],
      }).replace(/</g, '\\u003c')}</script>`,
    );
  }
  if (page.jsonLd && SITE_URL) {
    head.push(`<script type="application/ld+json">${JSON.stringify(page.jsonLd(lang, abs(url))).replace(/</g, '\\u003c')}</script>`);
  }
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${meta.locale}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${head.join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="seo-static container">${page.body(lang)}${footBlock(lang)}</div></div>`);
}

async function write(file: string, content: string) {
  const full = join(DIST, file);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

async function main() {
  // The pristine Vite shell. After the first run dist/index.html is the prerendered home page,
  // so re-runs (npm run prerender) must start from the saved app.html instead.
  const shell = join(DIST, 'app.html');
  let template = await readFile(existsSync(shell) ? shell : join(DIST, 'index.html'), 'utf8');
  if (!template.includes('<div id="root"></div>')) throw new Error('dist has no clean app shell — run `vite build` first');
  // the app reads the snapshot index before its first API call: start loading it with the HTML
  // (crossorigin="anonymous" = the mode of a same-origin fetch(), so the preload is reused)
  if (!template.includes(SNAPSHOT_INDEX))
    template = template.replace('</head>', `  <link rel="preload" href="/${SNAPSHOT_INDEX}" as="fetch" crossorigin="anonymous" />\n  </head>`);
  // Plain SPA shell for routes that are never prerendered (player profiles and matches — too many, always fresh).
  await write('app.html', template);
  // Target "/app", not "/app.html": Pages pretty URLs 308-redirect *.html, which would turn the
  // rewrite into a redirect and lose the /players/:id URL.
  // Rules for every language prefix ("", "/uk", "/de", …).
  await write(
    '_redirects',
    [
      ...LANGS.flatMap((l) => ['/players/*', '/matches/*', '/me', '/login', '/account', '/compare', '/admin'].map((p) => `${l.prefix}${p}  /app  200`)),
      '',
    ].join('\n'),
  );
  // Pages Functions run ONLY for /api/* (own backend + API proxy) — every other request stays a free static file.
  await write('_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
  // Snapshots (dist/data/): short browser cache — a rebuild replaces them several times a day — and never indexed.
  await write('_headers', `/${SNAPSHOT_DIR}/*\n  Cache-Control: public, max-age=300\n  X-Robots-Tag: noindex\n`);
  await rm(join(DIST, SNAPSHOT_DIR), { recursive: true, force: true });

  let data: Data;
  try {
    data = await loadData();
  } catch (e) {
    // no index.json is written → the app ignores any partial snapshots and uses the proxy
    console.warn(`[prerender] Deadlock API unavailable (${(e as Error).message}) — shipping the SPA without static pages`);
    return;
  }

  // the pro list for /pros and the hero pages (the SPA builds it from the leaderboards only when this is missing)
  if (data.pros.length) await write(PROS_FILE, JSON.stringify({ at: Date.now(), pros: data.pros } satisfies ProsFile));
  console.log(`[prerender] ${data.pros.length} pro players, their games on ${[...data.proMatches.values()].filter((m) => m.length).length} heroes`);

  const list = pages(data);
  for (const page of list) for (const l of LANGS) await write(fileFor(pathForLang(page.path, l.id)), render(template, page, l.id));

  // Googlebot renders pages with JS and obeys robots.txt for every request the page makes. React replaces
  // the static text on mount, so if the data calls are blocked Google indexes a skeleton / error state
  // instead of the page ("Crawled – currently not indexed"). The API proxy must stay crawlable
  // (longest rule wins: Allow /api/dl/ beats Disallow /api/); the direct fallback, api.deadlock-api.com,
  // disallows all bots in its own robots.txt. Auth / account endpoints stay blocked.
  const robots = 'User-agent: *\nAllow: /\nAllow: /api/dl/\nDisallow: /api/\n';
  const today = new Date().toISOString().slice(0, 10);
  if (SITE_URL) {
    // sitemap.xml is an index of one sitemap per page kind: Search Console then reports indexing per file
    // (Sitemaps → a file → "See page indexing"), so it is visible which kind of page Google leaves out.
    const groupOf = (path: string) => SITEMAP_GROUPS.find(([, re]) => re.test(path))?.[0] ?? 'pages';
    const groups = new Map<string, string[]>();
    for (const page of list) {
      const entries = LANGS.map(
        (l) =>
          `  <url><loc>${esc(abs(pathForLang(page.path, l.id)))}</loc><lastmod>${today}</lastmod>${LANGS.map(
            (alt) => `<xhtml:link rel="alternate" hreflang="${alt.locale}" href="${esc(abs(pathForLang(page.path, alt.id)))}"/>`,
          ).join('')}</url>`,
      );
      const name = groupOf(page.path);
      groups.set(name, [...(groups.get(name) ?? []), ...entries]);
    }
    for (const [name, urls] of groups)
      await write(
        `sitemap-${name}.xml`,
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`,
      );
    await write(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...groups.keys()]
        .map((name) => `  <sitemap><loc>${esc(abs(`/sitemap-${name}.xml`))}</loc><lastmod>${today}</lastmod></sitemap>`)
        .join('\n')}\n</sitemapindex>\n`,
    );
    await write('robots.txt', `${robots}\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  } else {
    await write('robots.txt', robots);
    console.warn('[prerender] SITE_URL is not set — skipped canonical/hreflang links and sitemap.xml (set it in the hosting build settings)');
  }
  console.log(`[prerender] ${list.length * LANGS.length} pages written (${list.length} routes × ${LANGS.length} languages)`);

  let steam: number[] = [];
  try {
    steam = await saveSnapshots(data);
  } catch (e) {
    console.warn(`[prerender] some snapshots were not saved (${(e as Error).message}) — the app asks the proxy for those`);
  }
  const keys = [...snapKeys.keys()].filter((h) => !snapClash.has(h));
  const index: SnapshotIndex = { at: Date.now(), keys, steam };
  await write(SNAPSHOT_INDEX, JSON.stringify(index));
  console.log(`[prerender] ${keys.length} API snapshots + ${steam.length} Steam profiles in dist/${SNAPSHOT_DIR}/${snapClash.size ? ` (${snapClash.size} hash clashes left out)` : ''}`);
}

main().catch((e) => {
  console.error('[prerender] failed:', e);
  process.exit(1);
});
