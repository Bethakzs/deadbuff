# Deadbuff — handbook for AI agents

> Read this file before changing anything. It explains what the project is, how data flows,
> which API endpoints are used (and their quirks), the design system, and the conventions
> every change must follow. Keep it up to date when you change architecture, routes or data.
>
> Project status, hosting / domain / Search Console setup, the owner's decision history, open questions and the
> roadmap live in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) (Ukrainian) — read it first in a new session.

---

## 1. What this is

**Deadbuff** is a Dotabuff-style stats site for Valve's game **Deadlock**.

Main goals (in priority order):

1. **Hero builds** — community builds ranked by real match win rate / usage.
2. **Hero win-rate statistics** — sortable meta table + tier list, filterable by rank bracket and time window.
3. **Hero pages** — what every ability does (description, cooldowns, T1/T2/T3 upgrades), popular skill order, core items, matchups, base stats, lore.
4. Item stats (shop view + table + a page per item), a global build browser, match pages, patch impact
   and the ranked leaderboard.

There is **no backend**. The site is a static SPA that calls the public
[Deadlock API](https://api.deadlock-api.com/docs) directly from the browser (CORS `*`).
All hero/item art comes from `assets-bucket.deadlock-api.com`.

UI languages: **English, Ukrainian, German, Spanish, Russian** (EN / UA / DE / ES / RU), picked from the globe
menu in the header, see §8. The owner communicates in Ukrainian — answer them in Ukrainian.

**Copy rule (owner's request): no full stop at the end of any UI text** — headings, subtitles, blurbs,
buttons, errors, and also API descriptions (stripped automatically, see §8). Write one sentence per string
and join clauses with "—" or "·" instead of ".".

---

## 2. Stack

| Concern | Choice |
|---|---|
| Build | Vite 5 + TypeScript 5 (strict) |
| UI | React 18 |
| Routing | react-router-dom 6 (`BrowserRouter`, v7 future flags on) |
| Data fetching / cache | @tanstack/react-query 5 |
| Animation | framer-motion 11 |
| Tooltips | @floating-ui/react |
| Styling | Plain CSS with design tokens (no Tailwind, no CSS-in-JS) |
| i18n | Own tiny layer in `src/i18n` (typed dictionaries, `Intl.PluralRules`, no library) |
| Fonts | Google Fonts. EN / DE / ES: Big Shoulders Display (display) + Barlow (body). UA / RU: Oswald + Fira Sans (Big Shoulders/Barlow have no Cyrillic), size-matched with `font-size-adjust` (§8). Cormorant Garamond (serif/lore) for all |

Versions are **pinned exactly** in `package.json`. Don't bump majors casually.

---

## 3. Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build && tsx scripts/prerender.ts  -> dist/
npm run prerender    # re-run only the SEO prerender on an existing dist/ (idempotent)
npm run preview      # tsx scripts/preview.ts — serves dist/ like Cloudflare Pages on :4173
npm run typecheck
```

**Local machine note (Windows):** on the owner's machine Node is installed through **fnm** and is not on PATH
in non-interactive shells — use the fnm install path (`%APPDATA%\fnm\node-versions\<version>\installation\node.exe`)
or prepend that folder to PATH. `.claude/launch.json` (git-ignored, machine-specific) has `deadbuff-dev` (Vite)
and `deadbuff-preview` (production preview) configs.

### Deploy — Cloudflare Pages (chosen host)
Why Cloudflare: free static hosting + registrar at cost + room for a backend later in the same project
(Pages Functions in `/functions`, D1 database, KV cache, cron) on the same domain → same-origin cookies, no CORS.
- Build command `npm run build`, output `dist`, env `SITE_URL=https://<domain>` (no trailing slash). Node from `.node-version`.
- Without `SITE_URL` the build still works but skips canonical/hreflang/sitemap (warning in the log).
- `.github/workflows/daily-rebuild.yml` pings a Pages deploy hook daily (secret `CF_PAGES_DEPLOY_HOOK`) so
  prerendered numbers stay fresh. GitHub pauses scheduled workflows after 60 days without repo activity.
- Routing: `/x/y` → `x/y.html` (Pages pretty URLs); `_redirects` (generated) rewrites `/players/*`, `/me`
  (+ the same under every language prefix `/uk`, `/de`, `/es`, `/ru`) to the SPA shell `app.html` — the rule target must be **`/app`, not `/app.html`** (Pages 308-redirects
  `*.html` to the extensionless URL, which turned the rewrite into a redirect and lost the player URL). Unknown
  paths → `index.html` (Pages SPA mode — keep NO top-level `404.html`, it would disable that). `vercel.json`
  mirrors this for Vercel (`cleanUrls` + rewrites).
- Live: https://deadbuff.pages.dev (Pages project `deadbuff`, production branch `main`), domain `deadbuff.net`
  (registered at Namecheap, DNS on Cloudflare).

### Planned stage 2 (backend) — keep the code ready for it
- Steam login = OpenID 2.0, verified server-side (`check_authentication`) in a Pages Function
  (`/api/auth/steam/login`, `/api/auth/steam/callback`, `/api/me`), session in an HttpOnly signed cookie.
- Steam returns SteamID64; Deadlock API uses `account_id` → `lib/steam.ts` (`steam64 − 76561197960265728`).
- `lib/me.ts` (`useMe`/`setMe`, localStorage "It's me") is the stage-1 stand-in: replace its source with `/api/me`.
- Own backend calls go through `lib/api.ts` using relative `/api/...` URLs; secrets (session key, Deadlock
  API key `X-API-KEY`) live only in Cloudflare env vars — never in the frontend bundle.

---

## 4. File map

```
index.html                 fonts, preconnects, favicons, default meta (the prerender rewrites title/meta per page)
public/
  favicon.svg              source of the mark; favicon.ico + favicon-48/96/192.png + apple-touch-icon.png are
                           generated from it — Google only shows a site icon it can fetch as a raster file, and
                           /favicon.ico must exist or the SPA fallback answers it with HTML
vite.config.ts             single "vendor" chunk for node_modules
scripts/
  prerender.ts             SEO: static HTML per route × language, sitemap.xml, robots.txt, app.html, _redirects
  preview.ts               local server for dist/ that mimics Cloudflare Pages routing
.github/workflows/
  daily-rebuild.yml        daily Cloudflare Pages deploy-hook ping (fresh prerendered numbers)
src/
  data/
    roles.ts               HERO_ROLES: Dota-style position ratings 0–10 per hero (edit numbers here)
  main.tsx                 I18nProvider > QueryClient > FilterProvider > Routed (BrowserRouter, basename = "" | "/uk" | "/de" | "/es" | "/ru",
                           keyed by language), imports CSS in order
  App.tsx                  routes + AnimatePresence page transitions (keyed by first 2 path segments); no scroll
                           reset on mount so a language switch keeps the scroll position
  i18n/
    index.tsx              I18nProvider + useT(): { t, rich, ago, lang, meta, setLang }; persists language,
                           sets <html lang> and the number/date locale synchronously
    context.ts             the React context, kept in its own module so dictionary edits hot-reload cleanly
    types.ts               Msg type, LANGS (id, menu code + native name, Intl locale, og:locale, API `language`,
                           URL prefix), langFromPath(), pathForLang(), langFromBrowser()
                           langFromPath(), pathForLang()
    en.ts                  English strings — defines the key set (MsgKey)
    uk.ts / de.ts / es.ts / ru.ts   translations — Record<MsgKey, Msg>, TypeScript fails if a key is missing
  lib/
    api.ts                 ALL network calls live here (fetch wrapper, endpoints, StatFilters -> params)
    types.ts               API response types (only fields we use) + client fields Hero.slug / Hero.name_en
    filters.tsx            FilterProvider/useFilters: rank bracket + period, persisted in localStorage
    heroes.ts              slug, role keys, hero colours/images, abilities lookup, buildHeroRows(), assignTiers()
    roles.ts               positions: heroRoleScores(), heroPositions() (roles ≥ 7 + top role), playsPosition()
    lanes.ts               lane list from lane_info + bestLane() — only for the header chip "Best lane: …"
    items.ts               slots, property formatting, ability key stats + upgrade text, item tooltip data
    format.ts              locale-aware number/percent/time formatting (setFormatLocale), wrTone() colour scale
    builds.ts              BUILD_STEP (10 revealed per "Show more"), BUILD_PAGE (50 per API page), uniqueBuilds()
    html.ts                sanitizeHtml() for API description fragments (strips scripts/on* handlers) + trimDot(),
                           loreParagraphs() (lore is split by "
" OR "<br><br>" depending on the hero)
    seo.ts                 useDocumentMeta(title, description) — runtime twin of the prerendered tags
    steam.ts               SteamID64 ⇄ account_id, parseAccountInput() (links, SteamID3, ids)
    me.ts                  useMe()/setMe() — "It's me" account id in localStorage (stage-2 → Steam login)
    match.ts               match page maths: teamTotals(), laneResults() (who won each lane on souls at 10:00),
                           soulLead(), objectiveEvents(), killMatrix() (who killed whom, from death_details),
                           statAt()/finalStat() over the stat snapshots
    patches.ts             patchTimeline() (changelog posts + big patch days), patchWindows() (7 days before vs
                           7 days after, cut at neighbouring patches), patchImpact() — pure, also used by prerender
  hooks/
    useAssets.ts           useHeroes / useItems / useRanks / usePatches (static data, cached forever,
                           fetched in the UI language; heroes merge English slugs with localised text)
    useStats.ts            analytics hooks (hero stats, item stats, counters, synergy, ability orders,
                           build stats, builds, steam profiles). All keyed by the global filters.
    useHeroData.ts         derived data: useHeroMatchups(), useHeroItemRows(), useLaneAgg() (lanes + aggregates, header chip only)
    usePlayer.ts           player queries: steam search, match history, per-hero stats, rank, teammates
  components/
    Layout.tsx             sticky header (scroll-tinted): NAV (4 main tabs) + MoreMenu ("three lines" button with the
                           MORE sections; inline in the mobile burger), LangSwitch (globe button → dropdown of
                           native language names),
                           footer, Logo; sets the document title for non-hero routes
    SiteSearch.tsx         header/home search ("/" hotkey, arrows + Enter): heroes (+ a tab word, "haze build" →
                           /heroes/haze/builds), sections (PAGES: "tier list", "my stats", "matches"…, matched on the
                           translated name AND English keywords), shop items (loaded only once the search is used),
                           a pasted number → match / player id. "deadlock" is stripped from the query
    FilterBar.tsx          rank dropdown (with rank badge images) + period segmented control
    UI.tsx                 SectionTitle, Panel, TierBadge, Skeleton(Rows), ErrorState, Empty,
                           CountUp, Segmented (animated pill), Page (route transition wrapper), Diamond
    WinRate.tsx            WinRate (coloured %), Delta, WinRateBar (centred on 50%), MeterBar
    Tooltip.tsx            floating-ui tooltip in a portal (variant "label" | "card")
    ItemIcon.tsx           item square w/ slot colour + tier pips + rich ItemCard tooltip; `annotation` →
                           small "!" badge with the note as a native title tooltip (owner wants it kept simple)
    Position.tsx           PositionChip(s), PositionFilter (All / Carry / Playmaker / Pick / Support), RoleBars (0–10);
                           monochrome by default, `colored` only on the hero profile
    Ability.tsx            AbilityGlyph, AbilityIcon (with tooltip), AbilityCard (collapsed to icon + name +
                           one-line preview; click the head to reveal description, stats and T1–T3)
    AbilityOrderGrid.tsx   Dotabuff-style skill order grid (◆ unlock, I/II/III upgrades)
    BuildCard.tsx          collapsible build: pinned tag icons, preview items -> categories, skill order, copy build ID
    BuildTagFilter.tsx     build-tag chips (shared by the hero Builds tab and the build browser)
    HeroCard.tsx           portrait card (forwardRef, layout="position"), cursor light, "gloat" art on hover
    HeroChip.tsx           HeroAvatar + HeroChip (avatar + name link)
    ItemTable.tsx          sortable/filterable item stats table (hero page + items page)
    Html.tsx               renders sanitized API HTML
  pages/
    Home.tsx               banner + rotating hero Showcase, numbers strip, meta snapshot, hero grid,
                           trending builds, patch list
    Heroes.tsx             meta table (sortable, position + class filters, Position column).
                           Exports ROLE_FILTERS, useRoleOptions(), heroMatches()
    TierList.tsx           S/A/B/C/D rows of HeroCards, position filter
    Items.tsx              shop view (slot tabs × tier columns; items without stats are hidden) / table view
    Builds.tsx             global build browser: hero picker (no "All" — defaults to the first hero in the list,
                           owner's request), sort, name search, build-tag filter, "Show more"
                           (same server-side tag/pagination logic as the hero Builds tab)
    Players.tsx            player search (+ RankEmblem), "My profile" card
    Matches.tsx            /matches: open a match by ID + "My recent matches" of the profile marked "It's me"
    Item.tsx               item page: header stats, who buys it (bucket=hero), buy-minute chart (bucket=game_time_min),
                           shop card, built from / upgrades into
    Match.tsx              match page, four tabs: Scoreboard (team tables), Stats (team comparison bars,
                           per-player rankings, kill matrix), Lanes (lane winners), Timeline (soul lead, objectives,
                           item timings). Rows of the profile marked "It’s me" get `.is-me` everywhere
    Patches.tsx            patch impact: patch picker (?patch=YYYY-MM-DD), winners / losers, full before/after table
    Leaderboard.tsx        Valve ranked leaderboard: region switch (?region=), hero dropdown (?hero=slug)
    Player.tsx             player profile (normal-mode matches only) + MeRedirect for /me. Exports MatchList (every
                           row is a link to /matches/:id) and normalMatches()
    NotFound.tsx
    hero/
      HeroPage.tsx         header (bg art, portrait, SVG name, stats) + sticky tabs; sets --hero colour on <html>
      HeroOverview.tsx     abilities, skill order, most played builds | positions (role bars), core items, matchups, base stats
      HeroBuilds.tsx       Most played / Highest win rate / Trending + build-tag filter + "Show more" pagination
      HeroItems.tsx        ItemTable for this hero
      HeroMatchups.tsx     counters (vs) / synergies (with)
      HeroLore.tsx         lore with drop cap + playstyle (paragraphs via loreParagraphs(), rendered as sanitized HTML)
  styles/
    tokens.css             design tokens (colours, fonts, radii, easing) — single source of truth
    base.css               reset, film-grain + glow atmosphere, typography helpers, .container/.page
    components.css         component styles (BEM-ish: .block__elem, .is-state, .block--variant)
    pages.css              page layouts + responsive rules
```

### Routes

| Path | Page |
|---|---|
| `/` | Home |
| `/heroes` | Hero win-rate table |
| `/tier-list` | Tier list |
| `/heroes/:slug` | Hero overview (`slug` = `hero.slug` = `heroSlug(englishName)`, e.g. `lady-geist`, `mo-and-krill`, `the-doorman`). Always English, so links don't change with the UI language |
| `/heroes/:slug/:tab` | `builds` · `items` · `matchups` · `lore` (unknown tab → redirect to overview) |
| `/items` | Item stats |
| `/items/:slug` | Item page. `slug` = `itemSlug(englishName)` (`mystic-burst`) in every language — `useShopItemSlugs()` loads the English upgrade names outside EN. Unknown slug → `/items` |
| `/matches` | Match lookup by ID + my recent matches |
| `/matches/:matchId` | Match page (SPA only, not prerendered — rewritten to `/app` like players) |
| `/patches` | Patch impact; `?patch=YYYY-MM-DD` picks an older patch |
| `/leaderboard` | Ranked leaderboard; `?region=NAmerica` / `?hero=haze` |
| `/builds` | Build browser |
| `/players` | Player search (Steam name, profile link, SteamID64, SteamID3 or account id) |
| `/players/:accountId` | Player profile: rank, recent form, match history, heroes, teammates; "It's me" button |
| `/me` | Redirect to the profile marked "It's me" (or `/players`) |
| `*` | 404 |

**Every route also exists under `/uk`, `/de`, `/es`, `/ru`** (`/uk/heroes/haze/builds`). The language prefix is the React Router
`basename` (`main.tsx` → `Routed`), so in-app links are always written WITHOUT the prefix (`to="/heroes/haze"`).
Switching language rewrites the URL (`pathForLang`) and remounts the router. On a first visit whose browser
language (top choice) is one we support — or with a saved choice — an English URL is moved to that language's
prefix; crawlers always get the URL they requested.

### SEO prerender (`scripts/prerender.ts`, runs in `npm run build`)
Writes a static HTML file for every public route × language (≈385 routes × 5 ≈ 1925 pages: the old 226 + a page per shop item that has stats in the last 7 days (~156) +
/patches + /leaderboard + /matches): own `<title>` /
description (same `meta.*` dictionary keys as the runtime `useDocumentMeta()`), canonical + hreflang
(en, uk, de, es, ru, x-default), Open Graph / Twitter tags (hero card art as image), JSON-LD on the home page, and a
static text version of the page inside `#root` (`.seo-static`: hero role, stats, abilities with T1–T3,
top builds with IDs, counters, lore, hero links) that React replaces on mount. Data is fetched from the
API at build time (hero-stats over 7 days, counters, top 5 builds per hero, item-stats overall + by hero,
latest patch impact, Europe leaderboard). Player and match pages are not
prerendered. When adding a page or a hero tab: add its `meta.*` keys, call `useDocumentMeta()` in the
page AND add it to `pages()` in the prerender script.

---

## 5. Data flow

```
FilterProvider (rank, days)  ──►  StatFilters { minBadge?, days }
                                        │
hooks/useStats.ts  ── queryKey includes filters ──►  lib/api.ts  ──►  api.deadlock-api.com
        │
        ▼
derived helpers (lib/heroes.ts buildHeroRows, hooks/useHeroData.ts)  ──►  pages/components
```

* **Static data** (`/assets/heroes`, `/assets/items`, `/assets/ranks`) is cached with `staleTime: Infinity`,
  keyed by language (`['items', 'ukrainian']`) with `keepPreviousData`, so switching language keeps the old
  texts on screen until the new ones arrive. Heroes are always also fetched in English (slugs, search).
* **Analytics** use `staleTime: 10 min` + `placeholderData: keepPreviousData` so changing filters
  keeps old numbers on screen while the new ones load (the FilterBar shows an "updating" spinner).
* `filterParams()` rounds `min_unix_timestamp` **down to the hour** — keeps query keys stable and lets the API's CDN cache hit. Don't use `Date.now()` directly in query params.
* Never call `fetch` from components. Add an endpoint to `lib/api.ts`, a hook to `hooks/`, then use it.

---

## 6. Deadlock API reference (what we use)

Base: `https://api.deadlock-api.com/v1` · OpenAPI: `https://api.deadlock-api.com/openapi.json`
⚠️ The old host `assets.deadlock-api.com` **no longer resolves** — assets are now under `/v1/assets/*`.

### Common analytics params
`min_unix_timestamp` (default: 30 days ago), `max_unix_timestamp`, `min_average_badge` / `max_average_badge`
(badge = `tier*10 + subtier`, e.g. Ascendant 1 = `101`, Eternus = `111..116`), `game_mode` (default `normal`),
`min_matches` (filters out tiny samples, also shrinks payloads — always pass it).

### Assets
All `/assets/*` endpoints accept `language=english|ukrainian|…` — names, descriptions, lore, tags,
property labels/postfixes and rank names come back translated (official game localisation).
Exception: `images.name_image` (hero logotype SVG) spells the English name, so it is shown only when the
localised name equals the English one (always in EN, mostly in DE/ES); otherwise the name is typeset.
`description.lore` separates paragraphs with "
" for some heroes and "<br><br>" for others (34 of 44), and
may contain `<span class="italics">` / `<i>` (also in `playstyle`) → always go through `loreParagraphs()` +
`sanitizeHtml()` / `stripHtml()`, never print it as plain text.

| Endpoint | Notes |
|---|---|
| `GET /assets/heroes?only_active=true` | 44 heroes. Use `player_selectable && !disabled`. `images.*_webp` preferred. `images.name_image` = white SVG logotype of the name. `colors.ui` = `[r,g,b]` hero accent. `items.signature1..4` = ability **class_names** (4 = ultimate), `items.weapon_primary` = gun. `hero_type` is empty for Dynamo, Kelvin, Ivy, Paige, Rem and Nurse Harrow → shown as class "Flex" / "Універсал" (fallback in `roleOf()`; the owner may assign real classes later). |
| `GET /assets/items` | ~780 entries: `type` = `ability` \| `weapon` \| `upgrade`. Shop items = `type==='upgrade' && shopable && !disabled`, with `item_slot_type` (weapon/vitality/spirit), `item_tier` 1–4(5), `cost`, `shop_image_webp`. Abilities have `image_webp` (white glyph on transparent), `description.desc/quip/t1_desc/t2_desc/t3_desc` (HTML!), `properties` (label/value/postfix/prefix/icon), `upgrades[i].property_upgrades`, `tooltip_details` (**JSON string** — parse it). |
| `GET /assets/ranks` | tier 0–11 with `name` (localised) and `images.small_webp`. Tiers: 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus. The rank filter shows `name + "+"` from this endpoint — never hard-code rank names. |
| `GET /patches` | RSS-like changelog list (`title`, `pub_date`, `link`). |
| `GET /assets/build-tags` | 14 tags `{id, label, icon(svg)}` — "Weapon", "Spirit", "Melee", "For New Players"… (localised). |
| `GET /assets/generic-data` | Only `lane_info` is used: array indexed by `assigned_lane`. Real lanes: **1 York** (yellow), **4 Broadway** (blue), **6 Greenwich** (green); other slots are "Unused" / "Enemy" and are filtered out by `lanesFromInfo()`. |

Description HTML contains `<span class="highlight">`, inline `<svg width="128">` icons and
`<img class="inline-attribute">`. Always render via `<Html>` (sanitizes + strips svg width/height).
`properties[k].prefix` may be `"{s:sign}"` → show a `+` for positive values; some values already carry units (`"20m"`). Use `formatPropValue()`.

### Analytics
| Endpoint | Shape → how we use it |
|---|---|
| `GET /analytics/hero-stats` | `[{hero_id, wins, losses, matches, total_kills, total_deaths, total_assists, total_net_worth, total_player_damage, total_shots_hit/missed, …}]` → `buildHeroRows()` |
| `GET /analytics/item-stats?hero_id=&min_matches=50` | `[{item_id, wins, matches, players, avg_buy_time_s, …}]`. Without `hero_id` = all heroes. |
| `GET /analytics/item-stats?bucket=hero` / `bucket=game_time_min` | Same rows + `bucket` = hero id / buy minute, for EVERY item in one call (~1.7 / 2.4 MB raw, ~0.5 MB gzipped; `include_item_ids` filters matches, not rows). Cached once per filter set and shared by all item pages |
| `GET /analytics/hero-counter-stats?min_matches=100` | all pairs `{hero_id, enemy_hero_id, wins, matches_played, …}` (one call, cached, filtered client-side) |
| `GET /analytics/hero-synergy-stats?min_matches=100` | pairs `{hero_id1, hero_id2, wins, matches_played}` (unordered pair: check both ids) |
| `GET /analytics/ability-order-stats?hero_id=&min_matches=200` | `[{abilities: number[15-16], wins, matches}]`; first occurrence of an id = unlock. **Without `min_matches` it's ~2 MB** — keep the param. |
| `GET /analytics/hero-build-stats/{hero_id}?min_matches=30` | `[{hero_build_id, wins, matches, players}]` — **real win rate per build**. Min timestamp March 1 2026. |

### Builds & players
| Endpoint | Notes |
|---|---|
| `GET /builds?hero_id=&sort_by=weekly_favorites&only_latest=true&limit=&start=` | `sort_by`: `weekly_favorites` \| `favorites` \| `updated_at`; `start`/`limit` paginate; `search_name` text search; **`tag=<id>` filters server-side** by a pinned icon (build-tag id, or item/ability id), so a tag filter is correct across all pages. Pages can overlap on ties → dedupe by `hero_build_id`. |
| `GET /builds?build_id=X&only_latest=true` | single build (used for ids coming from hero-build-stats). One request per build, cached per id. |
| `GET /players/steam?account_ids=1,2,3` | persona names + avatars for build authors. |
| `GET /matches/{id}/metadata` | ~1 MB JSON, immutable → cached for the session. `assigned_lane` (1/4/6) gives lane duos; `objectives[]` = `{team (the OWNER of the structure), team_objective_id (0 = Patron), destroyed_time_s (0 = still standing)}`; `mid_boss[]` = Rejuvenator. `match_info.players[]`: team 0/1 (0 = Hidden King, 1 = Archmother), K/D/A, `net_worth`, `items[]` (`game_time_s`, `item_id`, `sold_time_s`) — ability unlocks/upgrades are in the same list, keep only `isShopItem`; `stats[]` snapshots (~every 3–5 min, last = end) with `player_damage`, `player_healing`, `net_worth`. 404 = not parsed yet |
| `GET /leaderboard/{region}[/{hero_id}]` | Regions `Europe | NAmerica | SAmerica | Asia | Oceania`. Entries: `rank`, `account_name`, `possible_account_ids` (Valve publishes only the NAME — a common one matches hundreds of accounts), `top_hero_ids` (empty on hero boards). Short right after a ranked season starts |
| `GET /players/rank?account_ids=` | Rank of up to 1000 accounts in one call (`badge`, `last_match.start_time`; `badge: 0` = unranked). The leaderboard uses it to resolve a shared name to the highest-ranked account — only for entries with ≤ 32 candidates and ≤ 400 ids per board, chunked 200 per request (URL length); busier names stay unlinked |
| `GET /patches/big-days` | ISO timestamps of big patch days, newest first. `/patches` titles carry the real patch date ("09-29-2026 Update") — the post's `pub_date` can be weeks later |

Build shape: `hero_build.details.mod_categories[] = {name, description, mods:[{ability_id, annotation}]}`
(`ability_id` is an **item id**). Skill order: `details.ability_order.currency_changes` — keep entries with
`currency_type === 1 && delta < 0` in order (unlock costs 1, T1 = 1, T2 = 2, T3 = 5 ability points).
`currency_type === 2` is the unlock token, ignore it. See `buildAbilityOrder()`.

`mods[].annotation` = the author's note on an item (shown in-game as a "!" on the icon) → small "!" badge whose
native `title` shows the note. A styled note block was tried and the owner asked to remove it — keep it simple.

`hero_build.tags` = up to **3 icons the author pins to the build** in-game (`0` = empty). Each id is either a
build tag (`/assets/build-tags`), an item id or an ability id — resolve in that order (`BuildTagIcons` in `BuildCard.tsx`).

**Hero → Builds tab data flow** (`HeroBuilds.tsx`), 10 builds revealed per "Show more":
- no tag + Most played / Highest win rate → build ids ranked from `hero-build-stats` (matches, or WR above a
  sample floor), details fetched per id for the revealed slice only
- tag selected, or Trending → `useBuildPages()` (infinite query, 50 per API page, `tag` passed to the API).
  For Most played / Highest win rate the loaded tagged builds are re-ranked by their match stats; builds
  without stats follow in API order. "Show more" fetches the next API page when the revealed ones run out.

### Lanes (secondary — header chip only)
`GET /analytics/lane-matchup-stats?group_by=assigned_lane,hero_ids&min_matches=30` (+ the usual time/badge
filters) → one row per (lane, duo): `{assigned_lane, hero_ids:[a,b], wins, matches_played, net_worth_diff, sample_matches}`.
`wins` count the whole match; `net_worth_diff` = the duo's soul lead over the enemy duo at 15:00.
~2.8k rows / ~50 KB. ⚠ The API marks this endpoint "subject to change"; if it fails the chip simply isn't shown.

**Owner's decision:** lane info is not important. It is shown **only** as the last chip in the hero header
("Best lane: Greenwich", after the hero's own tags). A lane filter, laning column, lane panel and lane-partner
tab were built and then removed on request — don't bring them back unless asked.

---

## 7. Derived metrics (keep consistent everywhere)

* **Win rate** = `wins / matches`.
* **Pick rate (hero)** = `hero.matches / totalMatches`, where `totalMatches = Σ hero.matches / 12` (6v6 → 12 heroes per match). Average hero ≈ 27%.
* **Pick rate (item on hero page)** = `item.matches / hero.matches` (same filters). On the items page the denominator is all player-matches.
* **KDA** = `(kills + assists) / deaths` (per-match averages).
* **Tier** (`buildHeroRows`): `score = (WR − 0.5)·100 + 0.6·log2(max(PR, 0.005) / 0.167)`; heroes sorted by score; percentiles → S top 10%, A next 20%, B next 35%, C next 23%, D rest.
* **Matchup delta** = matchup WR − hero's overall WR (so it's relative, not raw 50%).
* **Best lane** (`lib/lanes.ts`): every duo row is credited to both heroes; best lane = highest lane win rate
  among lanes with ≥ 15% of the hero's games (lanes are assigned by matchmaking, so shares are ≈ ⅓ each).
* **Positions** (`data/roles.ts` → `lib/roles.ts`) — Dota-style roles, the way the owner wants "positions":
  - four ratings 0–10 per hero: **carry** (≈ pos 1, late-game damage), **playmaker** (starts/swings fights),
    **pick** (catches lone targets), **support** (≈ pos 5, heals/shields/buffs)
  - sources (per entry): `b(…)` = 1:1 from a community "Deadlock Role Board" screenshot the owner supplied;
    `a(…)` = heroes missing from it, rated by us from kit + match stats (reasons in comments);
    **`o(…)` = corrected by the owner by hand — these always win, never "fix" them back**
  - a hero's **positions** = every role rated ≥ 7, plus its top-rated role(s) so everyone has at least one.
    Chips show the first two
  - **no "flex/universal" position**: a hero rated equally in all four (`isUndecided()`) gets no position at all —
    report such heroes to the owner and ask for numbers instead of inventing a label (there are none right now)
  - the position filter (heroes table, home grid, tier list) keeps heroes whose positions include the role
  - ratings are opinions, not match data — when a patch changes a hero, edit `data/roles.ts`
* **Win-rate colours** (`wrTone`): ≥53% great, ≥51% good, 49–51% even, >47% bad, else awful.

---

## 8. Design system — "occult noir / art-deco ledger"

Deadlock is 1920s occult New York; the UI mirrors that: warm near-black paper, cream ink, brass
accents, deco ornaments, condensed display type. **It must not look like a generic AI dashboard.**

Rules:

1. **Only use tokens** from `styles/tokens.css` (`--bg`, `--panel`, `--text`, `--brass`, `--weapon`, `--vitality`, `--spirit`, `--wr-*`, `--tier-*` …). No new hex values in components.
2. **Hero colour**: every hero-scoped element reads `--hero` (an `r g b` triple, use as `rgb(var(--hero) / .4)`). Set it inline with `heroRgb(hero)`. `HeroPage` also sets it on `<html>` so the page glow tints.
3. **Item slot colours** are fixed: weapon orange, vitality green, spirit purple (in-game colours). Use the `slot-weapon|vitality|spirit` classes.
4. **Typography**: headings/labels/numbers-as-display → `.display` / `--font-display` uppercase; body → `--font-body`; lore & quips → `.serif` (Cormorant italic). Numbers in tables → `.num` (tabular). Display headings get air from tokens `--display-tracking` / `--display-word` / `--display-leading` (the owner asked for slightly looser headings — don't tighten them back). The font stacks switch per language in `tokens.css` via `:root:is([lang='uk'], [lang='ru'])`; the "Deadbuff" wordmark always stays in Big Shoulders.
   **Size matching:** Oswald is ~22% wider than Big Shoulders at the same cap height and Fira's x-height is taller than
   Barlow's, so switching EN → UA used to look "zoomed in". Tokens `--display-adjust` (`cap-height 0.73`) and
   `--body-adjust` (`ex-height 0.51`) are `none` for Latin languages; **every `font-family: var(--font-display)` is
   followed by `font-size-adjust: var(--display-adjust)`, every body-font declaration (incl. the `font` shorthand,
   which resets it) by `var(--body-adjust)`, and the serif / wordmark by `none`** — keep that pairing when adding CSS.
   Sofia Sans (Extra) Condensed matched better on paper but renders Bulgarian letterforms for Ukrainian — don't use it. Banner lines are `white-space: nowrap` — keep each `home.title*` string short.
5. **Surfaces**: `.panel` (gradient + brass top hairline), `border-radius: var(--radius-lg)` for cards, chamfered `clip-path` for primary buttons (`.btn--brass`) and tier badges.
6. **Atmosphere**: `body::before` film grain and `body::after` radial glow are global — don't add more full-screen effects.
7. Images: always prefer `*_webp`; use `loading="lazy"` except above-the-fold hero art.
8. Responsive breakpoints used: 1100px (sidebars collapse), 900px (header nav → burger menu; the header search box
   shrinks first above it), 860px (hero header stacks, tabs bar un-sticks), 720/640px (tables hide `.hide-sm`, grids shrink). `.hide-md` hides < 1000px. Verify 375px width has **no horizontal scroll**.

### Motion conventions
* Easing: `[0.22, 1, 0.36, 1]` (ease-out-quint) for almost everything; springs (`stiffness ~400-500, damping ~36-40`) for pills/underlines using `layoutId`.
* Route transitions: `<Page>` wrapper (fade + 14px rise). Hero tabs animate inside `HeroPage` (keyed by tab).
* Lists: stagger `delay = min(i * 0.02, 0.4)` so long lists don't take forever.
* Sorting tables: `motion.tr layout="position"`.
* Filtered grids (home hero grid): **never put `layout` on the grid container** — framer-motion animates the
  container's size with a scale transform and the cards inside get stretched. Instead wrap the cards in
  `<AnimatePresence mode="popLayout">` and give each card `layout="position"` + `forwardRef` (see `HeroCard`);
  the grid is `position: relative` so leaving cards stay inside it.
* Hero cards must all be the same height: the art box (`aspect-ratio`) alone sizes the card and the caption
  (`.hero-card__foot`) is absolutely positioned over its bottom — a two-line name ("Щурячий Король",
  "Медсестра Герроу") rises upward instead of making the card taller. Don't put the caption back in normal flow.
* **Position colours only on the hero profile.** Everywhere else positions are monochrome (owner: "too many
  colours"): filters, table, cards. On the profile (header chips + the "Positions" panel, which is the FIRST block
  of the sidebar) they are coloured via the `colored` prop → `.pos--{role}` with `--pos-{role}-rgb` tokens
  (carry yellow, playmaker red, pick blue, support green). Layout: in toolbars the class filter (Marksman,
  Mystic…) comes first and the position filter sits on the right (`.toolbar__end`); in the heroes table the
  Position column comes right after Tier.
* Home showcase: the portrait (`.showcase__art`, z-index 1) sits flush against the left edge (`left: 0`) and slides under the text
  column; the text (`.showcase__info`, z-index 2 + its own radial shade) is always on top of the art, never the
  other way round. Hero backgrounds are black on their left ~40%, so the card is narrow (`max-width: 500px`,
  anchored right) with `object-position: 100%` — don't widen it back into an empty black strip.
* Skill-order grid (`.skill-grid`) has `overflow-x: auto`, which clips anything drawn outside its box — keep its
  small inner padding so the ability icon rings on the left aren't cut off.
* Hero → Builds tab has no explanatory blurb under the title (removed on request) — just the mode switch and tag chips.
* Header nav (owner's request): main tabs **Tier list, Heroes, Builds, Items**; then a "three lines" button that opens
  Patches, Players, Matches, Leaderboard (`NAV` / `MORE` in `Layout.tsx`; the button gets the nav underline when one
  of them is open). In the mobile burger all eight are listed. Mirrored in the prerender `navBlock()`.
* Items without stats for the current filters are not shown in the shop (owner: no "no data" cells), and the prerender
  only writes item pages for items with stats.
* **Item tier 5 does not exist in the game** — the asset dump lists 17 such items, all priced 9999. `isShopItem()`
  (`lib/items.ts`, `MAX_TIER`) drops them, so they never reach the shop, the search, an item page or the prerender.
* The hero page's ability cards are collapsed by default and open on click — the owner wants a preview first, with a
  chevron showing that there is more. A missing in-game quip falls back to the first sentence of the description.
  Every collapsed card is exactly the same height: the name is one line (ellipsis) and the preview is always rendered
  and clamped to two lines. An open card closes from a click anywhere inside it (unless text is selected).
* A small back arrow hangs under the logo (`.back-btn`), shown only when `history.state.idx > 0` and not on the home page.
* Match team colours: `--team0-rgb` (Hidden King, amber) / `--team1-rgb` (Archmother, sapphire); a lane card tints
  itself with the lane colour from `/assets/generic-data`. A lane card puts the lane name and the soul gap in the
  middle and the verdict (won / lost / even) above each duo, so it reads without comparing numbers.
  Both duos keep their souls next to that middle column (the right side is `row-reverse`, full width).
  The Scoreboard tab opens with a compact `LaneStrip` of the same results, which switches to the Lanes tab on click.
* Four abilities (Graves’ Borrowed Decree, Mina’s Rake, Silver’s Boot Kick, Solomon’s Develop Queen) have no
  `description.desc`: `abilityDescription()` falls back to `tooltip_details.info_sections` (Valve’s own localised
  text). With several sections the first is the hero’s innate, so the one-line preview uses `abilityOwnText()`,
  which takes the last one. Never write ability text by hand.
* Scoreboard rows are grouped by lane (owner’s request): one `<tbody class="lane-group">` per lane, bracketed in the
  lane colour with the lane name and won / lost / even above it.
* The scoreboard table is `table-layout: fixed` with per-column widths (`.c-player`, `.c-lvl`, …) so the item icons
  wrap onto a second line instead of scrolling the table sideways. Below 720px it stops being a table: every row
  becomes a card and each `<td>` prints its own header from `data-label` (so a cell that already uses `::before`,
  like `.souls`, must put that span inside the cell).
* Match page team colours are tokens `--team0-rgb` (Hidden King, amber) / `--team1-rgb` (Archmother, sapphire).
* Section explanations go in a muted `.section-sub` paragraph under `SectionTitle`, not in its `eyebrow` (long
  uppercase eyebrows are hard to read).
* Hero header: the card portrait has its own painted backdrop, so `.hero-head__portrait img` feathers all four edges
  (two intersected mask gradients) to melt into the background art. The name reveal animates `clip-path` with
  **negative insets** (`inset(-50% … -10%)`, same units at both ends) so the logotype's drop-shadow glow isn't clipped
  into a hard-edged box.
* Build cards: `.build-card__inner` uses `grid-template-columns: minmax(0, 1fr)` so the wide skill-order grid scrolls
  inside itself on phones instead of widening the card.
* Numbers: `<CountUp>`; bars: animate `width` from 0.
* `prefers-reduced-motion` is respected globally in `base.css`.
* Note: when the preview browser pane is hidden, rAF is throttled and animations freeze mid-way (half-transparent text, partial count-ups). That's an artefact of the tool, not a bug.

### Internationalisation (EN / UA / DE / ES / RU)
* **Every UI string goes through `useT()`** — never put text straight into JSX. Add the key to `i18n/en.ts`
  first, then to `uk.ts`, `de.ts`, `es.ts`, `ru.ts` (the build fails if a dictionary is missing a key).
* `t('key', { name })` → string; `rich('key', { n: <b>…</b> })` → React nodes for placeholders that need markup;
  plural keys are objects `{ one, few, many, other }` picked by `Intl.PluralRules` from `vars.n`; `ago(unix)` → "5h ago" / "5 год тому".
* Enumerations are stored as **keys** and translated at render time: roles (`roleOf()` → `t('role.' + key)`),
  slots (`t('slot.' + slot)`), tiers (`t('item.tier', { roman })`), hero tabs (`t('hero.tab.' + id)`).
* Game content (hero/ability/item names, descriptions, lore, rank names) is **not** in the dictionaries —
  it comes translated from the API (`meta.api` → `language` param). Community build names/descriptions
  are user-written and stay as authored.
* Numbers/dates follow the locale through `lib/format.ts` (`57.0%` vs `57,0%`, `1.3M` vs `1,3 млн`) —
  use its helpers instead of `toFixed()` / `toLocaleString()` in components.
* **No trailing full stops**: dictionary strings never end with "."; `<Html>` and `trimDot()` strip the final
  "." from API descriptions, quips, role lines, playstyle and the last lore paragraph. `fmtCompact` drops the
  abbreviation dot of locales like "тис.".
* Adding a language: add it to `LANGS` in `i18n/types.ts` (with the API `language` value), create its dictionary
  (and import it in `scripts/prerender.ts` + `vercel.json` rewrites),
  register it in `DICTS` (`i18n/index.tsx`), and add a font override in `tokens.css` if the Latin fonts lack its script.

---

## 9. How to…

**Add a new stat column to the heroes table** → compute it in `buildHeroRows()` (`lib/heroes.ts`, extend `HeroRow`), add a `COLS` entry + `<td>` in `pages/Heroes.tsx`, add a `sortValue` case if it isn't a numeric `HeroRow` field.

**Add an endpoint** → type in `lib/types.ts`, fetcher in `lib/api.ts` (spread `filterParams(f)` if it's analytics, always pass `min_matches`), hook in `hooks/useStats.ts` with `queryKey: ['name', filters, ...ids]`.

**Add a page** → `src/pages/X.tsx` wrapped in `<Page>`, route in `App.tsx`, nav entry in `Layout.tsx` `NAV`, styles in `pages.css`.

**Add a hero tab** → add to `HERO_TABS` in `HeroPage.tsx`, render it in the tab switch, create `pages/hero/HeroX.tsx`.

**Add a new global filter** (e.g. game mode) → extend `StatFilters` + `filterParams()` in `api.ts`, state in `filters.tsx` (persisted), UI in `FilterBar.tsx`. Query keys already include the whole `filters` object.

---

## 10. Known limitations / ideas for next steps

* Item win rates are biased toward late-game items (longer games). Shown as a note under item tables; a "win rate by buy time" view (`item-stats?bucket=game_time_min`) would fix it.
* Builds page has no win rates for builds outside a selected hero (hero-build-stats is per hero).
* Match pages show what the metadata has; damage/healing come from the last stat snapshot. Ideas: objectives timeline,
  death map (`death_details`), per-player soul graph.
* EN / UA / DE / ES / RU. The API supports more game languages (French, Polish, Chinese, Japanese…) — adding one is a dictionary + `LANGS` entry (+ fonts for non-Latin scripts).
* Player data completeness depends on the Deadlock API: full live match history only for accounts that added
  their bot on Steam; otherwise only matches it already ingested. Shown as a note on the player page.
* "It's me" is per-browser (localStorage) until stage 2 adds real Steam login.
* Hero background images are big (~2 MB webp); consider `<link rel="preload">` for the hero page or a smaller crop.
* Possible features: position win rates per role, "recommended positions for your team" draft helper, item purchase timing chart, hero win rate trend (`hero-stats?bucket=start_time_day`), leaderboard page, patch-diff view.
* Position ratings are hand-maintained (see §7) — the API has no role data. They need a review after big hero reworks.

---

## 11. Before you finish a change

1. `npm run build` passes (it runs `tsc -b` first — strict mode, no unused vars).
2. Open the affected pages in the dev server at desktop width **and** 375px; no horizontal scroll, no console errors.
3. Loading (skeletons), error (`ErrorState`) and empty (`Empty`) states still render.
4. Check the change in **every language** (globe menu in the header; at least EN, UA and DE — German words are the longest): no untranslated text, no trailing full stops, nothing overflowing.
5. Update this file if you changed routes, data flow, endpoints or design rules.
