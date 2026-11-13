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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { de } from '../src/i18n/de';
import { en, type MsgKey } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { ru } from '../src/i18n/ru';
import { LANGS, pathForLang, type Lang } from '../src/i18n/types';
import { uk } from '../src/i18n/uk';
import { buildHeroRows, heroSlug, roleOf, type HeroRow, type Tier } from '../src/lib/heroes';
import { loreParagraphs, stripHtml } from '../src/lib/html';
import { abilityDescription, isShopItem, itemSlug } from '../src/lib/items';
import { patchImpact, patchTimeline, patchWindows, type PatchImpactRow, type PatchPoint } from '../src/lib/patches';
import type { CounterStat, Hero, HeroBuild, HeroStat, Item, ItemBucketStat, ItemStat, LeaderboardEntry, Patch } from '../src/lib/types';

const API = 'https://api.deadlock-api.com/v1';
const DIST = join(process.cwd(), 'dist');
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const DICTS: Record<Lang, Record<MsgKey, unknown>> = { en, uk, de, es, ru };
const HERO_TABS = ['overview', 'builds', 'items', 'matchups', 'lore'] as const;
type HeroTab = (typeof HERO_TABS)[number];

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

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const url = `${API}${path}${qs.toString() ? `?${qs}` : ''}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'deadbuff-prerender' } });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 2 || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
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
  /** newest patch with at least a day of data after it, and its per-hero impact */
  patch?: { point: PatchPoint; rows: PatchImpactRow[] };
  leaderboard: LeaderboardEntry[];
}

async function loadData(): Promise<Data> {
  const hour = 3600;
  const since = Math.floor(Date.now() / 1000 / hour) * hour - 7 * 86400;
  const shop = (items: Item[]) => items.filter(isShopItem);
  const [texts, stats, counters, itemStats, itemByHero, patches, bigDays, leaderboard] = await Promise.all([
    Promise.all(
      LANGS.map(async (l) => {
        const [heroes, items] = await Promise.all([
          get<Hero[]>('/assets/heroes', { only_active: true, language: l.api }),
          get<Item[]>('/assets/items', { language: l.api }),
        ]);
        return [l.id, { heroesRaw: heroes, items }] as const;
      }),
    ),
    get<HeroStat[]>('/analytics/hero-stats', { min_unix_timestamp: since }),
    get<CounterStat[]>('/analytics/hero-counter-stats', { min_unix_timestamp: since, min_matches: 100 }).catch(() => []),
    get<ItemStat[]>('/analytics/item-stats', { min_unix_timestamp: since, min_matches: 50 }).catch(() => [] as ItemStat[]),
    get<ItemBucketStat[]>('/analytics/item-stats', { min_unix_timestamp: since, min_matches: 50, bucket: 'hero' }).catch(() => [] as ItemBucketStat[]),
    get<Patch[]>('/patches').catch(() => [] as Patch[]),
    get<string[]>('/patches/big-days').catch(() => [] as string[]),
    get<{ entries: LeaderboardEntry[] }>('/leaderboard/Europe')
      .then((r) => r.entries)
      .catch(() => [] as LeaderboardEntry[]),
  ]);
  const raw = Object.fromEntries(texts) as Record<Lang, { heroesRaw: Hero[]; items: Item[] }>;
  const local = Object.fromEntries(
    LANGS.map((l) => [
      l.id,
      {
        heroes: new Map(raw[l.id].heroesRaw.map((h) => [h.id, h])),
        items: new Map(raw[l.id].items.map((i) => [i.class_name, i])),
        shop: shop(raw[l.id].items),
      },
    ]),
  ) as Record<Lang, Localised>;
  const heroes = raw.en.heroesRaw
    .filter((h) => h.player_selectable && !h.disabled)
    .map((h) => ({ ...h, name_en: h.name, slug: heroSlug(h.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const builds = new Map<number, HeroBuild[]>();
  await pool(heroes, 6, async (h) => {
    const list = await get<HeroBuild[]>('/builds', { hero_id: h.id, sort_by: 'weekly_favorites', sort_direction: 'desc', only_latest: true, limit: 5 }).catch(() => []);
    builds.set(h.id, list);
  });
  // Patch impact for the newest patch that already has a day of data after it.
  let patch: Data['patch'];
  const timeline = patchTimeline(patches, bigDays);
  const idx = timeline.findIndex((_, i) => patchWindows(timeline, i).afterDays >= 1);
  if (idx >= 0) {
    const w = patchWindows(timeline, idx);
    const win = (x: { min: number; max: number }) => get<HeroStat[]>('/analytics/hero-stats', { min_unix_timestamp: x.min, max_unix_timestamp: x.max });
    const [before, after] = await Promise.all([win(w.before), win(w.after)]).catch(() => [[], []] as HeroStat[][]);
    if (before.length && after.length) patch = { point: timeline[idx], rows: patchImpact(heroes, before, after) };
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
    patch,
    leaderboard,
  };
}

/* ------------------------------- pages ------------------------------ */

interface PageDef {
  /** language-less path, e.g. "/heroes/haze/builds" */
  path: string;
  title: (lang: Lang) => string;
  description: (lang: Lang) => string;
  body: (lang: Lang) => string;
  image?: string;
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
  return `<nav>${link(lang, '/', 'Deadbuff')}${link(lang, '/tier-list', t(lang, 'nav.tierList'))}${link(lang, '/heroes', t(lang, 'nav.heroes'))}${link(lang, '/builds', t(lang, 'nav.builds'))}${link(lang, '/items', t(lang, 'nav.items'))}${link(lang, '/draft', t(lang, 'nav.draft'))}${link(lang, '/patches', t(lang, 'nav.patches'))}${link(lang, '/players', t(lang, 'nav.players'))}${link(lang, '/matches', t(lang, 'nav.matches'))}${link(lang, '/leaderboard', t(lang, 'nav.leaderboard'))}</nav>`;
}

function heroLinks(d: Data, lang: Lang, rows = d.rows) {
  return `<ul>${rows
    .map((r) => `<li>${link(lang, `/heroes/${r.hero.slug}`, heroText(d, r.hero, lang).name)} — ${esc(t(lang, 'stat.winRate'))} ${pct(lang, r.winRate)}, ${esc(t(lang, 'stat.pickRate'))} ${pct(lang, r.pickRate)}</li>`)
    .join('')}</ul>`;
}

/** "Haze — Abrams +2.1%, Lash +1.8%…": the heroes that beat each hero most (vs their own usual win rate). */
function counterLines(d: Data, lang: Lang) {
  const base = new Map(d.rows.map((r) => [r.hero.id, r.winRate]));
  const byId = new Map(d.heroes.map((h) => [h.id, h]));
  return d.heroes
    .map((enemy) => {
      const best = d.counters
        .filter((c) => c.enemy_hero_id === enemy.id && c.matches_played >= 300 && base.has(c.hero_id) && byId.has(c.hero_id))
        // same "beyond the heroes' own strength" effect as the draft helper (lib/draft.ts)
        .map((c) => ({ hero: byId.get(c.hero_id)!, delta: c.wins / c.matches_played - base.get(c.hero_id)! + ((base.get(enemy.id) ?? 0.5) - 0.5) }))
        .filter((x) => x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 4);
      if (!best.length) return '';
      const list = best.map((x) => `${esc(heroText(d, x.hero, lang).name)} +${pct(lang, x.delta)}`).join(', ');
      return `<li>${link(lang, `/heroes/${enemy.slug}/matchups`, heroText(d, enemy, lang).name)} — ${list}</li>`;
    })
    .join('');
}

/** Plain-text description of a shop item (tooltip blurbs, else the short description). */
function itemText(item: Item): string {
  const parts = (item.tooltip_sections ?? []).flatMap((sec) => sec.section_attributes.map((a) => a.loc_string ?? '')).filter(Boolean);
  return stripHtml(parts.length ? parts.join(' ') : item.description?.desc ?? '');
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function pages(d: Data): PageDef[] {
  const byWr = [...d.rows].sort((a, b) => b.winRate - a.winRate);
  // shop items are keyed by the ENGLISH list; localised names are looked up per language by class_name
  // only items with stats get a page (as in the shop view — no empty "no data" pages)
  const listed = d.shopEn.filter((x) => d.itemStats.has(x.item.id));
  const slugOf = new Map<number, string>(listed.map((x) => [x.item.id, x.slug]));
  const playerMatches = d.stats.reduce((a, s) => a + s.matches, 0) || 1;
  const heroStat = new Map(d.stats.map((s) => [s.hero_id, s]));
  const fallbackImage = byWr[0]?.hero.images.icon_hero_card;
  const list: PageDef[] = [
    {
      path: '/',
      title: (l) => t(l, 'meta.title'),
      description: (l) => t(l, 'meta.desc.home'),
      image: fallbackImage,
      body: (l) =>
        `<h1>${esc(`${t(l, 'home.title1')} ${t(l, 'home.title2')} ${t(l, 'home.title3')}`)}</h1><p>${esc(t(l, 'home.lead'))}</p>${navBlock(l)}<h2>${esc(t(l, 'home.pickHero'))}</h2>${heroLinks(d, l, byWr)}`,
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
          `<h1>${esc(t(l, 'items.title'))}</h1><p>${esc(t(l, 'items.sub'))}</p>${navBlock(l)}` +
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
        `<h1>${esc(t(l, 'lb.title'))}</h1><p>${esc(t(l, 'lb.sub'))}</p>${navBlock(l)}<h2>${esc(t(l, 'lb.region.Europe'))}</h2><ol>${d.leaderboard
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
        const modes = (['counter', 'team', 'build'] as const)
          .map((m) => `<li><b>${esc(t(l, `draft.mode.${m}` as MsgKey))}</b> — ${esc(t(l, `draft.sub.${m}` as MsgKey))}</li>`)
          .join('');
        return `<h1>${esc(t(l, 'draft.title'))}</h1><p>${esc(t(l, 'meta.desc.draft'))}</p><ul>${modes}</ul>${navBlock(l)}<h2>${esc(t(l, 'hm.counters'))}</h2><ul>${counterLines(d, l)}</ul>`;
      },
    },
  ];

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
          (into.length ? `<h2>${esc(t(l, 'ip.buildsInto'))}</h2>${itemLinks(into)}` : '')
        );
      },
    });
  }


  for (const hero of d.heroes) {
    const row = d.rows.find((r) => r.hero.id === hero.id);
    const base = `/heroes/${hero.slug}`;
    const titleOf = (l: Lang, tab: HeroTab) => {
      const h = heroText(d, hero, l);
      return t(l, `meta.hero.${tab}` as MsgKey, { name: h.name, en: h.en });
    };
    const description = (l: Lang) => {
      const h = heroText(d, hero, l);
      return t(l, 'meta.desc.hero', { name: h.name, en: h.en, wr: row ? pct(l, row.winRate) : '—' });
    };
    const tabNav = (l: Lang) =>
      `<nav>${HERO_TABS.map((tab) => link(l, tab === 'overview' ? base : `${base}/${tab}`, t(l, `hero.tab.${tab}` as MsgKey))).join('')}</nav>`;
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
      )}${h.tags.length ? ` · ${esc(h.tags.join(' · '))}` : ''}</p>${stats}${tabNav(l)}`;
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

    list.push(
      {
        path: base,
        title: (l) => titleOf(l, 'overview'),
        description,
        image,
        body: (l) => `${intro(l, 'overview')}<h2>${esc(t(l, 'hero.abilities'))}</h2>${abilities(l)}`,
      },
      {
        path: `${base}/builds`,
        title: (l) => titleOf(l, 'builds'),
        description,
        image,
        body: (l) => {
          const builds = d.builds.get(hero.id) ?? [];
          return `${intro(l, 'builds')}<h2>${esc(t(l, 'hb.title'))}</h2><ul>${builds
            .map((b) => `<li>${esc(b.hero_build.name || t(l, 'build.untitled'))} — ID ${b.hero_build.hero_build_id}</li>`)
            .join('')}</ul><p>${esc(t(l, 'build.copyHint'))}</p>`;
        },
      },
      {
        path: `${base}/items`,
        title: (l) => titleOf(l, 'items'),
        description,
        image,
        body: (l) => `${intro(l, 'items')}<p>${esc(t(l, 'items.sub'))}</p>`,
      },
      {
        path: `${base}/matchups`,
        title: (l) => titleOf(l, 'matchups'),
        description,
        image,
        body: (l) => {
          const vs = d.counters
            .filter((c) => c.hero_id === hero.id && c.matches_played > 0)
            .map((c) => ({ other: d.heroes.find((h) => h.id === c.enemy_hero_id), wr: c.wins / c.matches_played }))
            .filter((x): x is { other: Hero; wr: number } => !!x.other)
            .sort((a, b) => b.wr - a.wr);
          const li = (x: { other: Hero; wr: number }) =>
            `<li>${link(l, `/heroes/${x.other.slug}`, heroText(d, x.other, l).name)} — ${pct(l, x.wr)}</li>`;
          return `${intro(l, 'matchups')}<h2>${esc(t(l, 'hero.strongVs'))}</h2><ul>${vs.slice(0, 5).map(li).join('')}</ul><h2>${esc(
            t(l, 'hero.weakVs'),
          )}</h2><ul>${vs.slice(-5).reverse().map(li).join('')}</ul>`;
        },
      },
      {
        path: `${base}/lore`,
        title: (l) => titleOf(l, 'lore'),
        description,
        image,
        body: (l) => {
          const h = heroText(d, hero, l);
          return `${intro(l, 'lore')}${loreParagraphs(h.description.lore)
            .map((p) => `<p>${esc(stripHtml(p))}</p>`)
            .join('')}${h.description.playstyle ? `<h2>${esc(t(l, 'lore.playstyle'))}</h2><p>${esc(stripHtml(h.description.playstyle))}</p>` : ''}`;
        },
      },
    );
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
    head.push(
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Deadbuff',
        url: abs(url),
        inLanguage: meta.locale,
        description,
      }).replace(/</g, '\\u003c')}</script>`,
    );
  }
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${meta.locale}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${head.join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="seo-static container">${page.body(lang)}</div></div>`);
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
  const template = await readFile(existsSync(shell) ? shell : join(DIST, 'index.html'), 'utf8');
  if (!template.includes('<div id="root"></div>')) throw new Error('dist has no clean app shell — run `vite build` first');
  // Plain SPA shell for routes that are never prerendered (player profiles and matches — too many, always fresh).
  await write('app.html', template);
  // Target "/app", not "/app.html": Pages pretty URLs 308-redirect *.html, which would turn the
  // rewrite into a redirect and lose the /players/:id URL.
  // Rules for every language prefix ("", "/uk", "/de", …).
  await write(
    '_redirects',
    [
      ...LANGS.flatMap((l) => ['/players/*', '/matches/*', '/me', '/login', '/account', '/compare'].map((p) => `${l.prefix}${p}  /app  200`)),
      '',
    ].join('\n'),
  );
  // Pages Functions run ONLY for /api/* (own backend + API proxy) — every other request stays a free static file.
  await write('_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));

  let data: Data;
  try {
    data = await loadData();
  } catch (e) {
    console.warn(`[prerender] Deadlock API unavailable (${(e as Error).message}) — shipping the SPA without static pages`);
    return;
  }

  const list = pages(data);
  for (const page of list) for (const l of LANGS) await write(fileFor(pathForLang(page.path, l.id)), render(template, page, l.id));

  const today = new Date().toISOString().slice(0, 10);
  if (SITE_URL) {
    const urls = list.flatMap((page) =>
      LANGS.map(
        (l) =>
          `  <url><loc>${esc(abs(pathForLang(page.path, l.id)))}</loc><lastmod>${today}</lastmod>${LANGS.map(
            (alt) => `<xhtml:link rel="alternate" hreflang="${alt.locale}" href="${esc(abs(pathForLang(page.path, alt.id)))}"/>`,
          ).join('')}</url>`,
      ),
    );
    await write(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`,
    );
    await write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  } else {
    await write('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /api/\n');
    console.warn('[prerender] SITE_URL is not set — skipped canonical/hreflang links and sitemap.xml (set it in the hosting build settings)');
  }
  console.log(`[prerender] ${list.length * LANGS.length} pages written (${list.length} routes × ${LANGS.length} languages)`);
}

main().catch((e) => {
  console.error('[prerender] failed:', e);
  process.exit(1);
});
