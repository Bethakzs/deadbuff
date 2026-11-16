# Deadbuff

Dotabuff-style stats site for **Deadlock**: hero win rates and tier list, community builds ranked by real
match win rate, every ability explained (cooldowns, T1/T2/T3 upgrades), popular skill orders, item stats,
matchups, match details with an item-timing analysis, player lookup, a draft helper, accounts (Steam or
username) with favourites, a personal dashboard and player comparison.

Live at **https://deadbuff.net** · all game data comes from the public [Deadlock API](https://deadlock-api.com)
through our own edge-cached proxy; a small backend (Cloudflare Pages Functions + D1) handles accounts and favourites.
UI languages: English (`/…`), Ukrainian (`/uk/…`), German (`/de/…`), Spanish (`/es/…`), Russian (`/ru/…`);
hero, ability and item texts use the game's own translation.

> **This single file is the whole documentation of the project.**
> **Part I** (English) is the handbook: architecture, API reference, design system, conventions — read it
> before changing anything. **Частина II** (українською) is the project memory: current state, hosting and
> domain setup, the owner's decisions and rules, open questions and the roadmap.
>
> **Для AI-агента:** прочитай цей файл повністю, потім `git log --oneline -15`, щоб побачити, що змінилось.
> **Відповідай власнику українською.** Код, коміти і цей файл — англійською, крім Частини II.
> **Після кожної сесії онови розділи 2, 9 і 13 Частини II.**

---

## Contents

**Part 0 — Quick start**
- [Running it](#running-it) · [Deploy on Cloudflare Pages](#deploy-on-cloudflare-pages)

**[Part I — Handbook for AI agents](#part1)** (English)
1. [What this is](#1-what-this-is) · 2. [Stack](#2-stack) · 3. [Running it](#3-running-it) ·
4. [File map](#4-file-map) · 5. [Data flow](#5-data-flow) · 6. [Deadlock API reference](#6-deadlock-api-reference-what-we-use) ·
7. [Derived metrics](#7-derived-metrics-keep-consistent-everywhere) · 8. [Design system](#8-design-system--occult-noir--art-deco-ledger) ·
9. [How to…](#9-how-to) · 10. [Known limitations](#10-known-limitations--ideas-for-next-steps) ·
11. [Before you finish a change](#11-before-you-finish-a-change)

**[Частина II — Проєкт українською](#part2)**
1. [Що це за проєкт](#1-що-це-за-проєкт) · 2. [Поточний стан](#2-поточний-стан) · 3. [Інфраструктура і акаунти](#3-інфраструктура-і-акаунти) ·
4. [Деплой і роутинг](#4-деплой-і-роутинг--коротко) · 5. [SEO і просування](#5-seo-і-просування) · 6. [Історія і рішення власника](#6-історія-проєкту-і-рішення-власника) ·
7. [Правила роботи з власником](#7-правила-роботи-з-власником) · 8. [Позиції героїв](#8-позиції-героїв--оцінки-власника) ·
9. [Відкриті питання](#9-відкриті-питання-до-власника) · 10. [Етап 2: вхід через Steam](#10-етап-2-вхід-через-steam--план-реалізації) ·
11. [Ідеї і план розвитку](#11-ідеї-і-план-розвитку) · 12. [Відомі нюанси](#12-відомі-нюанси) · 13. [Журнал оновлень](#13-журнал-оновлень-цього-файлу)

---

# Part 0 — Quick start

## Running it

```bash
npm install
npm run dev          # http://localhost:5173 (API called directly; /api/* proxied to :8788)
npm run dev:api      # backend: Pages Functions + local D1 on :8788 (accounts, favourites, API proxy)
npm run build        # dist/ — typecheck (app + functions), vite build, SEO prerender (~2160 pages, sitemap, robots)
npm run preview      # serves dist/ like Cloudflare Pages → http://localhost:4173 (static only)
npm run preview:full # dist/ + functions + D1 exactly like Pages → http://localhost:8788
npm run typecheck
```

**On the owner's Windows machine** Node is installed through fnm and is not on PATH in non-interactive
shells — use `%APPDATA%\fnm\node-versions\<version>\installation\node.exe` or prepend that folder to PATH.
`.claude/launch.json` (git-ignored) holds the `deadbuff-dev` and `deadbuff-preview` run configs.

## Deploy on Cloudflare Pages

1. Push this repo to GitHub (private is fine).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable `SITE_URL` = `https://your-domain` (no trailing slash) — used for canonical
     links, hreflang and `sitemap.xml`. Node version comes from `.node-version`.
3. **Custom domains** → add the domain.
4. Daily refresh of the prerendered numbers: Pages → Settings → Builds → **Deploy hooks** → create one,
   then store its URL as the GitHub Actions secret `CF_PAGES_DEPLOY_HOOK` (`.github/workflows/daily-rebuild.yml`).
5. Google: [Search Console](https://search.google.com/search-console) → add the domain → submit
   `https://your-domain/sitemap.xml`.
6. **Backend** (accounts + favourites; the API proxy works without it):
   - Workers & Pages → **D1 SQL Database → Create** (any name, e.g. `deadbuff`). No schema to run — tables
     are created on first use (`server/db.ts`).
   - Pages project → Settings → **Bindings → Add → D1 database**: variable name **`DB`** → that database
     (Production and Preview).
   - Settings → **Variables and Secrets → Add**: **`SESSION_SECRET`**, type *Secret*, a long random string
     (≥ 16 chars, e.g. `openssl rand -base64 32`). Changing it logs everybody out.
   - Optional: `PBKDF2_ITERATIONS` (default 60000 — fits the Free plan CPU limit; set 100000 on Workers Paid),
     `DEADLOCK_API_KEY` (sent as `X-API-KEY` by the proxy).
   - Redeploy (bindings apply to new deployments).

Routing: `/heroes/haze` is served from `heroes/haze.html` (prerendered); player, match, `/me`, `/login`,
`/account` and `/compare` pages are rewritten to the SPA shell (`/app`) by the generated `_redirects`;
`_routes.json` sends only `/api/*` to the Functions; anything else falls back to `index.html`.
`vercel.json` mirrors the static part for Vercel (no Functions there — the SPA then calls the API directly).

Not affiliated with Valve. Deadlock and its art are © Valve Corporation.

---

<a id="part1"></a>

# Part I — Handbook for AI agents

> Read this part before changing anything. It explains what the project is, how data flows, which API
> endpoints are used (and their quirks), the design system, and the conventions every change must follow.
> Keep it up to date when you change architecture, routes or data.

## 1. What this is

**Deadbuff** is a Dotabuff-style stats site for Valve's game **Deadlock**.

Main goals (in priority order):

1. **Hero builds** — community builds ranked by real match win rate / usage.
2. **Hero win-rate statistics** — sortable meta table + tier list, filterable by rank bracket and time window.
3. **Hero pages** — what every ability does (description, cooldowns, T1/T2/T3 upgrades), popular skill order, core items, matchups, base stats, lore.
4. Item stats (shop view + table + a page per item), a global build browser, match pages, patch impact
   and the ranked leaderboard.
5. Player tools: **draft helper** (one board: enemies, you, teammates → best pick for your slot, answers to each
   enemy, what to avoid, then your matchup + items vs the lineup), **counter pages** per hero (`/counters/:slug`),
   **accounts** (Steam OpenID or username + e-mail + password, no e-mail confirmation) with **favourite
   heroes and builds**, a **personal dashboard** (your WR per hero vs the average at your rank), **compare with
   a friend** and **match analysis** (your item timings vs top players on the same hero).

The site is a static SPA (+ SEO prerender) on Cloudflare Pages with a **small backend in Pages Functions**
(`functions/`, shared code in `server/`):
- `/api/dl/*` — caching proxy for the public [Deadlock API](https://api.deadlock-api.com/docs) (edge cache,
  stale-while-revalidate) → repeat queries answer in ~10 ms instead of 1–5 s. The SPA falls back to calling the
  API directly (CORS `*`) whenever the proxy isn't there (dev, Vercel, Function quota exceeded).
- `/api/auth/*`, `/api/me`, `/api/favorites` — accounts and favourites in **Cloudflare D1** (SQLite).

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
| Backend | Cloudflare Pages Functions (TypeScript, Web APIs only — no Node deps), D1 (SQLite), Cache API. `wrangler` + `@cloudflare/workers-types` are dev-only |
| Styling | Plain CSS with design tokens (no Tailwind, no CSS-in-JS) |
| i18n | Own tiny layer in `src/i18n` (typed dictionaries, `Intl.PluralRules`, no library) |
| Fonts | Google Fonts. EN / DE / ES: Big Shoulders Display (display) + Barlow (body). UA / RU: Oswald + Fira Sans (Big Shoulders/Barlow have no Cyrillic), size-matched with `font-size-adjust` (§8). Cormorant Garamond (serif/lore) for all |

Versions are **pinned exactly** in `package.json`. Don't bump majors casually.

---

## 3. Running it

```bash
npm install
npm run dev          # http://localhost:5173 — Vite; proxies /api/* to :8788
npm run dev:api      # wrangler pages dev public :8788 — Functions + local D1 (.wrangler/, git-ignored)
npm run build        # tsc -b && tsc -p functions && vite build && tsx scripts/prerender.ts  -> dist/
npm run prerender    # re-run only the SEO prerender on an existing dist/ (idempotent)
npm run preview      # tsx scripts/preview.ts — serves dist/ like Cloudflare Pages on :4173 (no Functions)
npm run preview:full # wrangler pages dev dist :8788 — the whole production build incl. Functions
npm run typecheck    # app + functions
```

- In `npm run dev` the SPA calls the Deadlock API **directly**; set `VITE_API_PROXY=1` to go through the
  local proxy instead (needs `npm run dev:api`). Production builds always use the proxy (with the direct fallback).
- Accounts work in dev only while `npm run dev:api` runs (Vite forwards `/api` to it, keeping the Host header so
  cookies and the Steam `return_to` stay on `localhost:5173`). The local secret is in the npm script — never reuse it.
- Steam accepts `http://localhost:5173` as OpenID realm, so "Sign in with Steam" works locally too.

**Local machine note (Windows):** on the owner's machine Node is installed through **fnm** and is not on PATH
in non-interactive shells — use the fnm install path (`%APPDATA%\fnm\node-versions\<version>\installation\node.exe`)
or prepend that folder to PATH. `.claude/launch.json` (git-ignored, machine-specific) has `deadbuff-dev` (Vite),
`deadbuff-api` (wrangler, Functions + D1 on :8788) and `deadbuff-preview` (production preview) configs.

### Deploy — Cloudflare Pages (chosen host)
Why Cloudflare: free static hosting + registrar at cost + room for a backend later in the same project
(Pages Functions in `/functions`, D1 database, KV cache, cron) on the same domain → same-origin cookies, no CORS.
- Build command `npm run build`, output `dist`, env `SITE_URL=https://<domain>` (no trailing slash). Node from `.node-version`.
- Without `SITE_URL` the build still works but skips canonical/hreflang/sitemap (warning in the log).
- `.github/workflows/daily-rebuild.yml` pings a Pages deploy hook daily (secret `CF_PAGES_DEPLOY_HOOK`) so
  prerendered numbers stay fresh. GitHub pauses scheduled workflows after 60 days without repo activity.
- Routing: `/x/y` → `x/y.html` (Pages pretty URLs); `_redirects` (generated) rewrites `/players/*`, `/matches/*`,
  `/me`, `/login`, `/account`, `/compare`
  (+ the same under every language prefix `/uk`, `/de`, `/es`, `/ru`) to the SPA shell `app.html` — the rule target must be **`/app`, not `/app.html`** (Pages 308-redirects
  `*.html` to the extensionless URL, which turned the rewrite into a redirect and lost the player URL). Unknown
  paths → `index.html` (Pages SPA mode — keep NO top-level `404.html`, it would disable that). `vercel.json`
  mirrors this for Vercel (`cleanUrls` + rewrites).
- `_routes.json` (generated) = `{"include": ["/api/*"]}`: **only `/api/*` invokes a Function** (counted against the
  Free plan's 100k requests/day); pages, JS, CSS and images stay free static files.
- Live: https://deadbuff.pages.dev (Pages project `deadbuff`, production branch `main`), domain `deadbuff.net`
  (registered at Namecheap, DNS on Cloudflare).

### Backend (Pages Functions + D1)
```
functions/                       file-based routes (each file = an endpoint)
  tsconfig.json                  workers types; `tsc -p functions` runs in npm run build
  api/dl/[[path]].ts             GET  /api/dl/<api path>  — Deadlock API caching proxy
  api/auth/register.ts           POST { username, email, password }      → { user } + session
  api/auth/login.ts              POST { login: username|e-mail, password } → { user } + session
  api/auth/logout.ts             POST                                     → clears the cookies
  api/auth/steam/login.ts        GET  ?mode=login|link&next=/uk/me        → 302 Steam OpenID
  api/auth/steam/callback.ts     GET  (from Steam) → verify → sign in / sign up / link → 302 next
  api/me/index.ts                GET  → { user | null } · DELETE → delete account + favourites
  api/me/steam.ts                DELETE → unlink Steam (only when the user has a password)
  api/favorites.ts               GET list · POST {kind,id} | {items:[…]} · DELETE {kind,id} → { items }
  api/[[rest]].ts                any other /api/* → JSON 404
server/                          shared code (outside functions/ so it doesn't become routes)
  env.ts        Env bindings (DB, SESSION_SECRET, PBKDF2_ITERATIONS, DEADLOCK_API_KEY), accountEnv()
  http.ts       json()/fail(), readJson(), sameOrigin() (CSRF), cookies, safeNext(), base64url
  session.ts    signed cookie db_session=<userId>.<expires>.<HMAC-SHA256> (HttpOnly, 30 days) + hint cookie db_auth=1
  password.ts   PBKDF2-SHA256 "pbkdf2_sha256$<rounds>$<salt>$<hash>", constant-time verify, rehash on login when rounds grow
  db.ts         SCHEMA (created on first "no such table"), users / favorites / auth_throttle queries
  steam-openid.ts  redirect URL + check_authentication verification
  auth.ts       currentUser(), validation rules, username from a Steam persona name
```
- **Proxy** (`/api/dl`): GET only, sections `assets|analytics|builds|players|matches|leaderboard|patches`. Cache key =
  path + sorted query in `caches.default`. Per-section policy (`policy()`): fresh time (assets 6 h, analytics/patches
  1 h, builds/leaderboard 15 min, steam profiles 1 h, player data 2 min, parsed match metadata 30 days) and a
  stale window during which the old copy is served instantly while a background refresh runs (player data and
  matches: none). Upstream 404 is cached 1 min; on upstream 5xx the stale copy wins. Every answer that came from
  the API carries `x-proxy-upstream: 1` (+ `x-cache: hit|stale|miss`); `lib/api.ts` treats a response WITHOUT
  that header (quota page, HTML fallback, network error) as "proxy unavailable" and switches to the direct API
  for the rest of the session. Cache API works on the custom domain (not on `*.pages.dev`).
- **Sessions** are stateless (no sessions table). Logout clears cookies; to log everyone out rotate `SESSION_SECRET`.
  `db_auth=1` (readable by JS, no secret) lets the SPA skip `/api/me` for guests.
- **Security**: every POST/DELETE checks the `Origin` header (+ SameSite=Lax cookie); the user id comes only
  from the session; login is throttled (15 attempts / 15 min / IP), sign-up 6 / hour / IP (`auth_throttle`);
  unknown logins still spend a full PBKDF2 round (no timing leak); usernames are unique case-insensitively in any
  script (`username_key` = lower-cased — SQLite NOCASE only folds ASCII). Steam login: nonce in an HttpOnly cookie
  scoped to `/api/auth/steam` must equal the `n` inside the Steam-signed `return_to`; `check_authentication` must
  answer `is_valid:true`; `claimed_id` must be `https://steamcommunity.com/openid/id/<17 digits>`.
- **PBKDF2 rounds**: 60 000 by default because the Free plan allows ~10 ms CPU per request (100 000 rounds ≈ 13 ms).
  The count lives in each hash: raise `PBKDF2_ITERATIONS` (max 100 000) on Workers Paid and hashes upgrade on next login.
- SteamID64 → `account_id` = `steam64 − 76561197960265728` (`src/lib/steam.ts`, shared with the server).
- Frontend: `lib/auth.ts` (`useAuth`, `useAuthActions`, `steamUrl`), `lib/favorites.ts` (`useFavorites`,
  `<FavoritesSync/>` merges guest favourites into the account after login), `lib/me.ts` (`useMe()` = linked
  Steam account, else the local "It's me").

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
    api.ts                 ALL Deadlock API calls live here (fetch wrapper: proxy /api/dl → direct fallback,
                           endpoints, StatFilters -> params, dayStart())
    auth.ts                own backend: useAuth() (only with the db_auth hint cookie), useAuthActions()
                           (login/register/logout/unlinkSteam/deleteAccount), steamUrl(), own() fetch helper
    favorites.ts           useFavorites() (server when logged in, localStorage for guests), <FavoritesSync/>
    draft.ts               draft maths: pairIndex(), scoreHero()/rankPicks() (counter + synergy effects beyond the
                           heroes' own strength), answersTo() (best answers to one enemy), countersOf() (counter page:
                           counters + victims of one hero, MIN_PAIR_GAMES = 300), teamRoles() (missing position),
                           itemsVsLineup()
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
    steam.ts               SteamID64 ⇄ account_id, parseAccountInput() (links, SteamID3, ids) — also used by server/
    me.ts                  useMe() = linked Steam account of the logged-in user, else "It's me" (localStorage,
                           setMe()/useLocalMe())
    match.ts               match page maths: purchases(), teamTotals(), laneResults() (who won each lane on souls at 10:00),
                           soulLead(), objectiveEvents(), killMatrix() (who killed whom, from death_details),
                           statAt()/finalStat() over the stat snapshots
    patches.ts             patchTimeline() (changelog posts + big patch days), patchWindows() (7 days before vs
                           7 days after, cut at neighbouring patches), patchImpact() — pure, also used by prerender
  hooks/
    useAssets.ts           useHeroes / useItems / useRanks / usePatches (static data, cached forever,
                           fetched in the UI language; heroes merge English slugs with localised text)
    useStats.ts            analytics hooks (hero stats, item stats, counters, synergy, ability orders,
                           build stats, builds, steam profiles). All keyed by the global filters. Plus
                           useHeroStatsAtRank() (dashboard / analysis), useTopItemStats() (Ascendant+ item timings),
                           useItemStatsVsEnemies() (draft), useItemStatsVsEnemy() (counter page, all heroes)
    useHeroData.ts         derived data: useHeroMatchups(), useHeroItemRows(), useLaneAgg() (lanes + aggregates, header chip only)
    useMediaQuery.ts       useMediaQuery('(max-width: 720px)') + HIGH_PRIORITY ({ fetchpriority: 'high' } for the LCP image)
    usePlayer.ts           player queries: steam search, match history, per-hero stats (one or several accounts,
                           optional period), rank, teammates
  components/
    Layout.tsx             sticky header (scroll-tinted): NAV (4 main tabs) + MoreMenu ("three lines" button with the
                           MORE sections; inline in the mobile burger), AccountMenu ("Log in" button, or the avatar
                           with Dashboard / My profile / Compare / Account / Log out), LangSwitch (globe button →
                           dropdown of native language names), footer, Logo; mounts <FavoritesSync/>
    FavButton.tsx          star toggle for a favourite hero (with label, hero header) or build (icon, build card)
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
    Home.tsx               banner + rotating hero Showcase (swipe on phones), numbers strip, meta snapshot (a
                           swipeable row on phones), DraftPromo (most picked heroes as an enemy lineup → /draft),
                           hero grid, trending builds, patch list
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
    Player.tsx             player profile (normal-mode matches only), "It's me" (hidden when Steam is linked),
                           "Compare with me". Exports MatchList (every row links to /matches/:id, or its
                           Analysis tab with `analysis`) and normalMatches()
    MatchAnalysis.tsx      Match → Analysis tab: pick a player, purchases with their minute vs the Ascendant+
                           average buy minute on that hero (last 30 days), summary, core items skipped
    Login.tsx              /login: Sign in with Steam + log in / sign up form (?mode=register, ?next=/path).
                           Exports SteamButton, SteamGlyph
    Account.tsx            /account: details, Steam link/unlink, log out, delete account
    Dashboard.tsx          /me: your WR per hero vs the average at your rank, strongest / weakest heroes, tiles,
                           favourites, recent matches. Exports PeriodSwitch (30 d / 90 d / all), heroVsRank(),
                           totals(), useRankName()
    Compare.tsx            /compare?a=&b=: two players side by side (CompareRow bars), games together,
                           heroes both play; friend picker = Steam search + the people you play with
    Draft.tsx              /draft: board (enemy 6 · "You" · 5 teammates) + hero pool (target switch, search + Enter),
                           YourPick + BuildAdvice (items vs lineup, core items), Picks (top-3 Podium + list, sort win
                           chance / counter effect, position filter), side panels TeamNeeds / Answers / Avoid /
                           HowItWorks; state in the URL (?e=&a=&me=), old ?mode= links still open
    About.tsx              /about: who makes the site (owner = Deadlock streamer BethakZS → TWITCH_URL), live numbers,
                           three feature cards, data / Deadlock API partner card, ingest tool link
    Counters.tsx           /counters (CountersIndexPage) and /counters/:slug (CountersPage): best counters, heroes it
                           beats, items against it; exports CounterGuideGrid (also on /draft)
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
    features.css           accounts, favourites, dashboard, compare, match analysis
    draft.css              draft helper + counter pages
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
| `/matches/:matchId` | Match page (SPA only, not prerendered — rewritten to `/app` like players). `?tab=stats|lanes|timeline|analysis` opens a tab |
| `/draft` | Draft helper. `e=` enemy slugs (≤6), `a=` teammate slugs (≤5), `me=` your hero. Old `?mode=team|build` links still parse (build without `me` = first ally) and are rewritten on the first edit. Prerendered (how it works + every hero's best counters as text) |
| `/counters` | Counter guides index (every hero → its counter page). Prerendered |
| `/about` | About the site and the owner (streamer BethakZS, Twitch link), data source / partner. Linked from the footer ("Browse" column) and the site search ("about", "twitch", "bethakzs"). Prerendered with an `AboutPage` JSON-LD (author = BethakZS, `sameAs` Twitch) |
| `/counters/:slug` | Who counters a hero: best counters (draft maths), heroes it beats, items against it, link into `/draft?e=slug`. Prerendered. Unknown slug → `/counters` |
| `/compare` | Compare two players: `?a=` (default: me) `&b=` (SPA only) |
| `/login` | Sign in with Steam / log in / sign up (`?mode=register`, `?next=/path`, `?steam=error`) (SPA only) |
| `/account` | Account details, Steam link (`?steam=linked|taken|error` after the round trip), log out, delete (SPA only) |
| `/patches` | Patch impact; `?patch=YYYY-MM-DD` picks an older patch |
| `/leaderboard` | Ranked leaderboard; `?region=NAmerica` / `?hero=haze` |
| `/builds` | Build browser |
| `/players` | Player search (Steam name, profile link, SteamID64, SteamID3 or account id) |
| `/players/:accountId` | Player profile: rank, recent form, match history, heroes, teammates; "It's me" button |
| `/me` | Personal dashboard of "me" (linked Steam account, else "It's me"); guests get a sign-in prompt (SPA only) |
| `*` | 404 |

**Every route also exists under `/uk`, `/de`, `/es`, `/ru`** (`/uk/heroes/haze/builds`). The language prefix is the React Router
`basename` (`main.tsx` → `Routed`), so in-app links are always written WITHOUT the prefix (`to="/heroes/haze"`).
Switching language rewrites the URL (`pathForLang`) and remounts the router. On a first visit whose browser
language (top choice) is one we support — or with a saved choice — an English URL is moved to that language's
prefix; crawlers always get the URL they requested.

### SEO prerender (`scripts/prerender.ts`, runs in `npm run build`)
Writes a static HTML file for every public route × language (≈432 routes × 5 ≈ 2160 pages: the old 226 + a page per shop item that has stats in the last 7 days (~156) +
/patches + /leaderboard + /matches + /draft + /counters + a counter page per hero (~44) + /about): own `<title>` /
description (same `meta.*` dictionary keys as the runtime `useDocumentMeta()`), canonical + hreflang
(en, uk, de, es, ru, x-default), Open Graph / Twitter tags (hero card art as image), JSON-LD on the home page (and any
page with `jsonLd` in its `PageDef` — /about), and a
static text version of the page inside `#root` (`.seo-static`: hero role, stats, abilities with T1–T3,
top builds with IDs, counters, lore, hero links) that React replaces on mount. Data is fetched from the
API at build time (hero-stats over 7 days, counters, top 5 builds per hero, item-stats overall + by hero + of every
hero against each enemy (`enemy_hero_ids`, one call per hero, for the counter pages),
latest patch impact, Europe leaderboard). Player and match pages are not
prerendered. When adding a page or a hero tab: add its `meta.*` keys, call `useDocumentMeta()` in the
page AND add it to `pages()` in the prerender script.

**robots.txt must keep `Allow: /api/dl/`.** Googlebot renders pages with JS and obeys robots.txt for every
request the page makes; React replaces the static text on mount, so with the data calls blocked Google indexes
a skeleton / error state ("Crawled – currently not indexed"). The direct fallback `api.deadlock-api.com`
disallows all bots in its own robots.txt, so our proxy is the only way Google gets the data. Proxy answers carry
`X-Robots-Tag: noindex` (used for rendering, never listed). `/api/auth`, `/api/me`, `/api/favorites` stay disallowed.

---

## 5. Data flow

```
FilterProvider (rank, days)  ──►  StatFilters { minBadge?, days }
                                        │
hooks/useStats.ts  ── queryKey includes filters ──►  lib/api.ts  ──►  /api/dl (edge cache)  ──►  api.deadlock-api.com
        │                                                   └── fallback: api.deadlock-api.com directly
        │
lib/auth.ts · lib/favorites.ts  ──►  /api/auth/*, /api/me, /api/favorites  ──►  D1
        ▼
derived helpers (lib/heroes.ts buildHeroRows, hooks/useHeroData.ts)  ──►  pages/components
```

* **Static data** (`/assets/heroes`, `/assets/items`, `/assets/ranks`) is cached with `staleTime: Infinity`,
  keyed by language (`['items', 'ukrainian']`) with `keepPreviousData`, so switching language keeps the old
  texts on screen until the new ones arrive. Heroes are always also fetched in English (slugs, search).
* **Analytics** use `staleTime: 10 min` + `placeholderData: keepPreviousData` so changing filters
  keeps old numbers on screen while the new ones load (the FilterBar shows an "updating" spinner).
* `filterParams()` rounds `min_unix_timestamp` **down to the UTC day** (`dayStart()`) — a query stays identical for
  a whole day, so our proxy's edge cache (and the API's CDN) keep hitting; "7 days" = 7–8 days of matches. Don't use
  `Date.now()` directly in query params. (The prerender still rounds to the hour — it runs once a day anyway.)
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
| `GET /analytics/hero-stats?min_average_badge=81&max_average_badge=86` | Hero stats of matches at one rank tier (dashboard "average at your rank"; analysis uses `min_average_badge=101` = Ascendant+ for the hero's game count) |
| `GET /analytics/item-stats?hero_id=&min_average_badge=101&min_matches=20` | Item stats of one hero in top matches — `avg_buy_time_s` = "when top players buy it" (match analysis) |
| `GET /analytics/item-stats?hero_id=&enemy_hero_ids=E&min_matches=30` | Item stats of one hero in matches where E was an enemy ("what beats E"). Several ids = ANY of them (useless for a lineup), so the draft calls it once per enemy. Without `hero_id` = every hero's items vs E (~40 KB, 5–7 s cold) — the counter pages. ⚠ `bucket=enemy_hero` would do it in one call but is ~1.7 MB / 4.5 s — don't |

### Builds & players
| Endpoint | Notes |
|---|---|
| `GET /builds?hero_id=&sort_by=weekly_favorites&only_latest=true&limit=&start=` | `sort_by`: `weekly_favorites` \| `favorites` \| `updated_at`; `start`/`limit` paginate; `search_name` text search; **`tag=<id>` filters server-side** by a pinned icon (build-tag id, or item/ability id), so a tag filter is correct across all pages. Pages can overlap on ties → dedupe by `hero_build_id`. |
| `GET /builds?build_id=X&only_latest=true` | single build (used for ids coming from hero-build-stats). One request per build, cached per id. |
| `GET /players/steam?account_ids=1,2,3` | persona names + avatars for build authors. |
| `GET /players/hero-stats?account_ids=a,b&min_unix_timestamp=` | Per-hero career stats of several accounts in one call (rows carry `account_id`): matches_played, wins, K/D/A, `networth_per_min`, `damage_per_min`, `last_hits_per_min`, `accuracy`, `time_played`… (dashboard, compare) |
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
* **Draft** (`lib/draft.ts`): expected WR of candidate H = WR(H) + Σ counter effects vs each enemy + Σ synergy
  effects with each ally, clamped to 30–70%. Effect = what the PAIR does beyond both heroes' own strength:
  vs enemy E, `WR(H vs E) − (WR(H) − (WR(E) − 50%))`; with ally A, `WR(H with A) − (WR(H) + (WR(A) − 50%))`
  (without this a strong enemy makes every candidate look "countered"). Each effect × n/(n+200). "Team roles" =
  the best rating any ally has per position; the weakest one below 7 is "missing" and the pick list starts filtered
  to it. **Items vs a lineup**: per enemy, (item WR vs E − item WR overall) minus the match-weighted average of that
  shift over all items (the hero's own matchup), × n/(n+150), averaged over the enemies; items bought in < 3% of the
  hero's games are ignored. Same normalisation in the prerendered "counters" list on `/draft`.
  **Draft page rules:** picks rank candidates for YOUR slot (enemies + teammates on the board, your own hero stays a
  candidate so its rank shows: "#11 of 37"). The list jumps to the missing role only once ≥ 3 teammates are known.
  "Avoid" = advantage < −0.4% AND expected < 50% (a strong hero with one bad matchup is not "avoid"). "Answers" =
  top 3 candidates by effect vs each enemy (pairs with ≥ 300 games).
* **Counter page** (`countersOf()`): every hero's effect vs this one enemy (same formula, ≥ 300 games); counters =
  effect > 0 best first, victims = effect < 0. Rows show the raw pair WR, the **expected** WR (hero's WR − (enemy WR −
  50%)) and the effect, so "43% vs Haze is still a counter" reads right. Items against a hero = `itemsVsLineup()`
  with every hero's overall item stats as the base and `item-stats?enemy_hero_ids=E` as the one "enemy".
* **Dashboard**: your WR per hero (selected period, `players/hero-stats`) minus the WR of everyone on that hero in
  matches of your rank tier (badge tier ×10 + 1…6, last 30 days). Strong / weak = top / bottom 3 by that difference
  among heroes with ≥ 5 games. Career numbers sum the per-hero rows; per-minute stats are weighted by time played.
* **Match analysis**: diff = your buy second − Ascendant+ average buy second (`avg_buy_time_s`, last 30 days) for the
  same item on the same hero; within ±60 s = on time, > 3 min late = very late. "Core items skipped" = bought by
  ≥ 35% of top players on that hero (share of the hero's Ascendant+ games) on average before this match ended.

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
  The middle column has ONE fixed width (150px) in every card and the souls diamond always faces the middle
  (`.lane-card__souls`, mirrored on the left), so the souls of all lanes line up in two straight columns (owner's request).
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
* Header account corner: guests see a small "Log in" pill (icon only < 640px); with an account or an "It's me"
  profile it becomes the round avatar (`.me-link`) that opens `.account-menu__list`. "Draft helper" is the first
  entry of the "three lines" menu (main tabs stay the owner's four).
* Favourites: `FavButton` — labelled pill first in the hero header tags row, icon-only before the chevron of a build card.
* "Sign in with Steam" is a plain `<a>` (full navigation to Steam), styled `.steam-btn` (cool steel, not brass —
  it's Steam's button, not ours).
* Draft (rebuilt 16.11): board on the left (enemy row, "vs", your row whose first slot is **You** in brass), hero pool
  on the right with a "Add to: Enemies / You / Teammates" switch; a full side hands the next click to the next one
  (enemy → you → teammates). Search + Enter adds the first match. Pool heroes already on the board keep a dot in
  their side's colour. Results: YourPick (portrait), top-3 podium cards with portrait art, then rows; side panels.
  On phones: slots shrink to avatars (no names), the pool can be collapsed, the podium stacks.
  **Draft URL updates read `window.location.search`, not the render's `params`** — the router commits location in a
  transition (`v7_startTransition`), so fast clicks / typing would otherwise build on a stale URL and drop a hero.
  Enemy team tinted with `--blood`, your team with the Archmother sapphire; the active box (where a click in the
  hero pool goes) glows. Pick list cards have no exit
  animation on purpose (filter switches must be instant). Match analysis: you = cream dot, top players = brass
  hollow diamond, the gap between them coloured by the timing tone.
* Hero header: the card portrait has its own painted backdrop, so `.hero-head__portrait img` feathers all four edges
  (two intersected mask gradients) to melt into the background art. The name reveal animates `clip-path` with
  **negative insets** (`inset(-50% … -10%)`, same units at both ends) so the logotype's drop-shadow glow isn't clipped
  into a hard-edged box.
* Build cards: `.build-card__inner` uses `grid-template-columns: minmax(0, 1fr)` so the wide skill-order grid scrolls
  inside itself on phones instead of widening the card.
* Home showcase: swipe left / right on phones (`onPanEnd`, `touch-action: pan-y` keeps vertical scrolling); any
  manual change restarts the 6 s auto-advance; the dots are 34×24 tap targets with a 4px bar inside.
  **Speed (17.11):** hero background art is 0.8–1.7 MB per hero — a phone on the home page used to download ~4 MB in
  the first seconds and the home page had the only "Poor" LCP in Web Analytics. Now **below 720px no background art
  is loaded** (`.showcase--compact`: gradient in the hero colour + deco sunburst, the card art's right edge feathered);
  on desktop the first background paints without the fade (`AnimatePresence initial={false}`) and carries
  `fetchpriority="high"` (also the hero page header background). Don't bring the background back on phones.
* Home meta snapshot: three panels in a row on desktop; **below 720px a horizontal scroll-snap row** (86% wide
  cards, peek of the next) instead of a ~1000px column (owner: "the top-5 cards don't swipe on mobile").
* Home "Draft helper" teaser (`.draft-promo`) sits between the meta snapshot and the hero grid; the banner chips have
  a "Draft helper" chip second. The header keeps the owner's 4 main tabs.
* Footer: "Official partner of Deadlock API" brass plaque (`.partner-badge`) under the blurb, links to deadlock-api.com.
  The "Browse" column ends with "About".
* /about: banner-style two-line title (`about.title1/2`, same `.banner__line` reveal as home), the home `.numbers` strip,
  three feature cards (brass 01–03), the stream card in **Twitch purple** (tokens `--twitch-rgb` / `--twitch-hi-rgb` —
  Twitch's colour, used only there, like the Steam button's steel) and the data card with the partner plaque.
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
* Player data completeness depends on the Deadlock API: a match shows up only once someone sent it (match id + salt).
  Their **ingest tool** (deadlock-api.com/ingest-cache) sends every match a player plays — the note on the player
  page links there (the old "add the bot on Steam" advice is gone).
* "It's me" (localStorage) still works for guests; a linked Steam account overrides it.
* Accounts have no password reset (no e-mail sending yet — owner's choice: no confirmation). A user who forgets the
  password can still sign in with Steam if it is linked. Cloudflare Email Routing / a mail API would be needed for resets.
* The proxy's Cache API is per data centre and doesn't work on `*.pages.dev` — only on `deadbuff.net`.
* Hero background images are big (0.8–1.7 MB webp, no smaller size in the API). The home showcase skips them on
  phones; the hero page header still loads one (with `fetchpriority="high"`) — a smaller crop would need our own
  image hosting / resizing (Cloudflare Images is paid).
* Possible features: hero win rate trend (`hero-stats?bucket=start_time_day`), item purchase timing chart,
  patch-diff view, password reset, "log out everywhere" (needs a sessions table or a per-user session version).
* Position ratings are hand-maintained (see §7) — the API has no role data. They need a review after big hero reworks.

---

## 11. Before you finish a change

1. `npm run build` passes (it runs `tsc -b` and `tsc -p functions` first — strict mode, no unused vars).
   Backend changes: try them with `npm run dev:api` (or `npm run preview:full`) — curl the endpoints, log in in the browser.
2. Open the affected pages in the dev server at desktop width **and** 375px; no horizontal scroll, no console errors.
3. Loading (skeletons), error (`ErrorState`) and empty (`Empty`) states still render.
4. Check the change in **every language** (globe menu in the header; at least EN, UA and DE — German words are the longest): no untranslated text, no trailing full stops, nothing overflowing.
5. Update this file if you changed routes, data flow, endpoints or design rules.

---

<a id="part2"></a>

# Частина II — Проєкт українською

> Тут те, чого не видно з коду: стан, інфраструктура, історія рішень власника, правила роботи з ним,
> відкриті питання і план розвитку. Технічні деталі — у [Частині I](#part1), їх тут не дублюємо.
> **Після кожної сесії онови розділи 2, 9 і 13.**

## 1. Що це за проєкт

**Deadbuff** (https://deadbuff.net) — сайт статистики для гри **Deadlock** (Valve) у стилі Dotabuff.
Власник — україномовний, GitHub `Bethakzs`, репозиторій https://github.com/Bethakzs/deadbuff.

Головні цілі (від власника, у порядку важливості):
1. **Білди на героїв** — збірки спільноти, відсортовані за реальним вінрейтом у матчах
2. **Статистика вінрейту героїв** — таблиця мети + тір-лист
3. **Сторінки героїв** — що роблять скіли (опис, КД, апгрейди T1/T2/T3), порядок прокачки, предмети, матчапи, лор
4. Гарний «людський» UI в одній темі (не як згенерований нейронкою дашборд), справжні арти героїв, анімації

Що вже є на сайті:
- Головна: банер з ротацією героїв (showcase), цифри, мета-зріз, сітка героїв, трендові білди, патчі
- `/heroes` — таблиця героїв (тір, позиція, WR, пікрейт, KDA…), фільтри за класом і позицією
- `/tier-list` — тір-лист S/A/B/C/D
- `/heroes/:slug` — профіль героя з вкладками: огляд, білди, предмети, матчапи, лор
- `/items` — магазин предметів + таблиця статистики; `/items/:slug` — сторінка предмета (хто купує, на якій хвилині,
  з яким вінрейтом, з чого збирається / у що покращується)
- `/matches` — пошук матчу за ID + «Мої останні матчі» (для профілю з позначкою «Це я»)
- `/matches/:id` — сторінка матчу з 4 вкладками: Таблиця (склади, KDA, душі, добивання, шкода, лікування, предмети),
  Статистика (порівняння команд, рейтинг гравців за шкодою / лікуванням / отриманою шкодою / душами,
  матриця «хто кого вбивав»),
  Лінії (хто виграв лінію за душами на 10-й хвилині, або нічия), Хронологія (перевага в душах, втрачені споруди,
  таймінги покупок). Кожен рядок історії матчів у профілі гравця веде сюди
- Пошук у шапці знаходить героїв, предмети, а за вставленим числом — матч (або профіль гравця з таким ID)
- Меню: Тір-ліст, Герої, Білди, Предмети + кнопка «три риски» (Патчі, Гравці, Матчі, Лідери). Під логотипом —
  маленька стрілка «назад»
- У профілі героя картки здібностей згорнуті: видно іконку, назву й короткий опис, решта розкривається кліком
- `/patches` — вплив патчу: вінрейт/пікрейт героїв за тиждень до і після кожного оновлення, хто виграв / програв
- `/leaderboard` — рейтингова таблиця Valve по регіонах, загальна або по герою
- `/builds` — браузер білдів (герой, сортування, пошук, фільтр за тегами, пагінація)
- `/players`, `/players/:id` — пошук гравця і профіль (ранг, форма, матчі, герої, тімейти), кнопка «Це я»,
  «Порівняти зі мною»
- `/draft` — **драфт-помічник** (перероблено 16.11): одна дошка — 6 ворогів, слот «Ти» і 5 союзників; список героїв
  поруч (пошук + Enter). Результати: топ-3 «подіум» з портретами, список, сортування «шанс перемоги / сила контрпіку»,
  «відповідь на кожного ворога», «краще не брати», роль, якої бракує; коли поставиш свого героя — твій матчап (місце
  серед усіх варіантів), предмети проти складу, основні предмети. Посилання з драфтом можна скопіювати
- `/counters`, `/counters/:slug` — **сторінки контрпіків** для кожного героя («Хто контрить Haze»): найкращі контрпіки
  (вінрейт проти, очікуваний, ефект), кого обігрує герой, предмети проти нього, кнопка «додати решту ворожої команди»
- **Акаунти**: `/login` — вхід через Steam або логін/e-mail + пароль, реєстрація без підтвердження пошти;
  `/account` — підключити / відключити Steam, вийти, видалити акаунт. В шапці — кнопка «Увійти» або аватар з меню
- **Обране**: зірочка на сторінці героя і на кожному білді; у гостя зберігається в браузері, після входу
  переноситься в акаунт
- `/me` — **особистий дашборд**: вінрейт на кожному герої проти середнього на твоєму ранзі, найсильніші й
  найслабші герої, обране, останні матчі (відкриваються на вкладці «Розбір»)
- `/compare` — **порівняння з другом**: усі показники поруч, спільні матчі, герої, на яких грають обидва
- `/matches/:id` → вкладка **«Розбір»**: таймінги твоїх предметів проти середнього часу покупки в гравців
  Ascendant+ на тому ж герої, і ключові предмети, які ти пропустив
- Глобальні фільтри: ранг і період. П'ять мов: EN (`/…`), UA (`/uk/…`), DE (`/de/…`), ES (`/es/…`), RU (`/ru/…`) —
  перемикач-глобус у шапці
- Футер: «Офіційний партнер Deadlock API» (Deadbuff є серед сайтів-трекерів на deadlock-api.com), посилання «Про сайт»
- `/about` — **про сайт**: «Від гравця — для гравців», живі цифри, що є на сайті, блок власника — **стрімер BethakZS** з
  кнопкою Twitch (twitch.tv/bethakzs), звідки дані й партнерство з Deadlock API
- SEO: ~2155 статичних сторінок (~431 маршрут × 5 мов: + сторінки предметів зі статистикою, патчі, лідерборд, матчі, контрпіки,
  драфт), sitemap, canonical/hreflang, OG

**Бекенд** — Cloudflare Pages Functions у тому ж репо (папки `functions/` і `server/`), база — Cloudflare D1:
- `/api/dl/*` — кешувальний проксі до [Deadlock API](https://api.deadlock-api.com/docs): відповіді лежать у кеші
  Cloudflare і віддаються за ~10 мс замість 1–5 с, оновлюються у фоні. Якщо проксі недоступний — сайт сам іде в API напряму
- акаунти, вхід через Steam, обране — у D1

---

## 2. Поточний стан

> Оновлено 16.11.2026 (фікс індексації, драфт, контрпіки).

| Що | Стан |
|---|---|
| Сайт | ✅ Працює: https://deadbuff.net (також https://deadbuff.pages.dev) |
| Репозиторій | `main`: `e253350` (перший запуск), `09f8bef` (5 мов, предмети/матчі/патчі/лідерборд, пошук, фавікон), `806f231` (документація в одному README), `c7fab11` (третя сесія: бекенд, акаунти, обране, дашборд, порівняння, розбір матчу, драфт, фікс ліній) |
| Деплой третьої сесії | ✅ Запушено 13.11.2026, живий сайт оновився за ~1 хв. Перевірено: `/draft` і sitemap (1930 сторінок), проксі (контрпіки 4,9 с без кешу → 0,17 с з кешу), `/api/me`, вхід відповідає `bad_credentials` (тобто D1 і `SESSION_SECRET` підключені) |
| Бекенд у Cloudflare | ✅ D1 (`DB`) і `SESSION_SECRET` налаштовані. ⏳ Вхід через Steam на живому сайті має перевірити власник своїм акаунтом |
| Google Search Console | ✅ Domain property `deadbuff.net` підтверджено (TXT у DNS). Sitemap: «Успішно», знайдено 452 сторінки |
| Bing Webmaster Tools | ⏳ Власник робив імпорт з GSC; sitemap підтягнувся як 0 → треба вручну додати `https://deadbuff.net/sitemap.xml` |
| Щоденне оновлення | ✅ GitHub Action `Daily rebuild` перевірено ручним запуском — успішно |
| Індексація в Google | ⏳ 16.11: «Проскановано – наразі не проіндексовано» 47, «Сторінка з переспрямуванням» 1. Причина: robots.txt блокував `/api/`, тож Google рендерив сторінки без даних. Фікс `Allow: /api/dl/` задеплоєно 16.11 (`1777df3`) — розділ 6, п. 22. Власнику: «Перевірити виправлення» в GSC |
| Партнерство | ✅ Deadbuff — офіційний партнер Deadlock API (іконка серед трекерів на deadlock-api.com, поки без посилання) |
| Швидкість головної | ✅ 17.11: на телефонах вітрина без важкого фону (−4 МБ), запушено (розділ 6, п. 25) |
| Аналітика | Cloudflare Web Analytics: **Workers & Pages → deadbuff → Metrics** (зняти фільтр «Site is in deadbuff.pages.dev», інакше видно лише pages.dev). За 13–16.11: 41 відвідування, 208 переглядів, топ — `/builds`, `/`, `/heroes` |
| Деплой 16.11 | ✅ Запушено 16.11: новий драфт-помічник, сторінки `/counters`, блок драфту на головній, свайп вітрини й «Зрізу мети» на телефоні, партнер у футері, текст про ingest tool, сторінка `/about` зі стрімом власника. Збірка проходить (2160 сторінок), перевірено в браузері (EN/UA/DE, 375px) |

Перевірено локально: реєстрація / вхід / вихід / обране через `wrangler pages dev` (D1 локально), захист від
підробленої cookie, унікальність логіна без урахування регістру (і для кирилиці), проксі (повторний запит 0,8 с → 0,008 с),
редірект на Steam. **Повний вхід через Steam не перевірено** — для цього потрібен справжній акаунт Steam (перевірити
після деплою: «Увійти через Steam» на deadbuff.net).

---

## 3. Інфраструктура і акаунти

> ⚠️ Секрети (URL deploy hook, майбутні ключі) — **ніколи не в репозиторій**. Особиста пошта власника — теж.

### Домен
- `deadbuff.net`, куплений у **Namecheap** 13.11.2026 (`.com` власник не хотів — дорогий)
- Nameservers у Namecheap змінено на Cloudflare: `becky.ns.cloudflare.com`, `cody.ns.cloudflare.com`
- Через 60 днів після покупки (≈ з 12.01.2027) можна перенести домен у **Cloudflare Registrar** — продовження за собівартістю

### Cloudflare (Free plan)
- Зона `deadbuff.net`. **Не видаляти TXT-запис підтвердження Google** (`google-site-verification=…`)
- **Pages-проєкт `deadbuff`**, підключений до GitHub-репо:
  - production branch `main` — кожен пуш у `main` автоматично білдить і деплоїть (~1–2 хв)
  - Build command `npm run build`, output `dist`, Node з `.node-version` (22)
  - Змінна середовища `SITE_URL=https://deadbuff.net` (без слеша в кінці) — для canonical, hreflang, sitemap
  - Custom domains: `deadbuff.net` і `www.deadbuff.net` — Active, SSL увімкнено
- **Redirect Rule** (Rules → Redirect Rules, Single Redirect з шаблону): `https://www.*` → `https://${1}`, 301,
  шлях і query зберігаються. Перевірено: www → root 301, http → https 301
- **Deploy hook** (Pages → Settings → Builds → Deploy hooks) створено. Його URL лежить **тільки** в
  GitHub secret `CF_PAGES_DEPLOY_HOOK`. Якщо URL десь засвітився — видалити hook і створити новий
- Ще не налаштовано (можна, по 5 хв): **Crawler Hints** (Caching → Configuration, IndexNow для Bing/Yandex),
  **Web Analytics** (без cookie-банера), **DNSSEC** (увімкнути в Cloudflare → DS-запис у Namecheap),
  **Email Routing** (`contact@deadbuff.net` → пошта власника)

### Бекенд (Pages Functions + D1) — що зробити власнику один раз
1. Cloudflare → **Workers & Pages → D1 SQL Database → Create** → назва `deadbuff` → Create.
   Таблиці створювати не треба — сайт створить їх сам при першому вході
2. **Workers & Pages → deadbuff → Settings → Bindings → Add → D1 database**: Variable name **`DB`**,
   база `deadbuff` → Save (для Production; за бажанням і для Preview)
3. Там же **Settings → Variables and Secrets → Add**: Type **Secret**, name **`SESSION_SECRET`**, value — довгий
   випадковий рядок (32+ символів, наприклад згенерований менеджером паролів). **Нікуди більше його не записувати.**
   Якщо він засвітився — замінити (усіх розлогінить, і це нормально)
4. **Deployments → … → Retry deployment** (або будь-який пуш) — прив'язки діють з нового деплою
5. Перевірити: deadbuff.net → «Увійти» → зареєструватися → зірочка на герої → дашборд

Опційно: `PBKDF2_ITERATIONS=100000` — лише якщо перейти на Workers Paid ($5/міс); `DEADLOCK_API_KEY` — якщо API почне обмежувати запити.

### GitHub
- `.github/workflows/daily-rebuild.yml`: щодня о 04:17 UTC + ручний запуск → `POST` на deploy hook →
  Cloudflare перебілджує сайт → у статичних сторінках свіжі цифри (вінрейти, топ-білди, контрпіки)
- GitHub ставить cron на паузу після 60 днів без активності в репо — тоді просто зробити будь-який коміт
- Коміти — з noreply-адреси GitHub, не з особистої пошти

### Вартість
- Cloudflare Pages / DNS / SSL / redirects — **$0** (ліміт Free: 500 білдів на місяць; щоденний ребілд ≈ 30)
- Домен — щорічне продовження в Namecheap (єдина регулярна витрата)
- Бекенд (Pages Functions + D1) — **$0** на Free: 100 тис. викликів функцій на день, D1 5 ГБ / 5 млн читань на день.
  Функції викликаються **лише** для `/api/*` (сторінки, картинки, JS — безкоштовна статика без лімітів).
  Одна сторінка = ~3–10 запитів до проксі → вистачає приблизно на 10–30 тис. переглядів на день
- Якщо ліміт вичерпано — сайт **не ламається**: SPA сам переходить на прямі запити до Deadlock API (лише повільніше),
  а вхід / обране до півночі UTC не працюють. Тоді варто взяти **Workers Paid за $5/міс** (10 млн запитів, 30 с CPU)
  і поставити `PBKDF2_ITERATIONS=100000`

---

## 4. Деплой і роутинг — коротко

Деталі — Частина I, §3–4. Суть:
- `npm run build` = `tsc -b` → `vite build` → `tsx scripts/prerender.ts`
- Prerender тягне дані з API під час білду і пише в `dist/`: HTML на кожен маршрут × мову, `sitemap.xml`,
  `robots.txt`, `app.html` (чиста оболонка SPA), `_redirects`
- Cloudflare Pages: `/heroes/haze` → `heroes/haze.html` (pretty URLs), `*.html` → 308 на URL без розширення
- `_redirects`: `/players/*`, `/matches/*`, `/me`, `/login`, `/account`, `/compare` (+ `/uk/…` тощо) → `/app` 200
  (rewrite). **Ціль саме `/app`, не `/app.html`**
- `_routes.json`: функції запускаються лише для `/api/*`
- Локально з бекендом: `npm run dev` + `npm run dev:api` (або `npm run preview:full` для готової збірки)
- Невідомі шляхи → `index.html` (SPA-режим Pages). **Не додавати верхньорівневий `404.html`** — він вимкне SPA-режим
- `vercel.json` дублює ту ж логіку на випадок переїзду на Vercel
- Локальна перевірка продакшн-збірки: `npm run preview` (`scripts/preview.ts` імітує Pages на :4173)

---

## 5. SEO і просування

**Зроблено:**
- Унікальні `<title>`/description на кожну сторінку з «Deadlock» у назві (напр. «Haze Build, Win Rate &
  Abilities — Deadlock | Deadbuff»), українські — у форматі `Імʼя (English) — білд, вінрейт і здібності · Deadlock | Deadbuff`
- canonical + hreflang (en / uk / x-default), Open Graph / Twitter (арт героя), JSON-LD на головній
- Статичний текст сторінки всередині `#root` (`.seo-static`) — React замінює його після завантаження
- sitemap (1930 URL) і robots, сторінки віддають 200 навіть для Googlebot (перевірено 16.11: усі 1930 — 200)
- robots.txt дозволяє `/api/dl/` — без цього Google рендерить сторінки без даних (розділ 6, п. 22). **Не прибирати**
- Сторінки контрпіків `/counters/:slug` (44 герої × 5 мов) під запити «who counters haze», «haze counter deadlock»,
  «контрпік Імла». Посилання на них — з драфту, з вкладки «Матчапи» героя, з головної

**Цільові запити:** `haze deadlock build`, `deadlock tier list`, `deadlock builds`, `deadlock <hero> build`,
`deadlock counters`, українські аналоги.

**Що робити далі:**
- Search Console → Перевірка URL → «Надіслати запит на індексування» для `/`, `/heroes`, `/tier-list`,
  `/builds` і популярних героїв (ліміт ≈ 10 на день)
- Bing: додати sitemap вручну (Bing також живить DuckDuckGo і частково ChatGPT search)
- Просування (рішення власника): Reddit r/DeadlockTheGame, Discord-спільноти Deadlock, українська спільнота,
  стрімери/ютубери. Зворотні посилання сильно впливають на позиції
- Нові сторінки (предмети, матчі, патчі) = нові входи з Google — див. розділ 11

---

## 6. Історія проєкту і рішення власника

Усе відбувалося 12–13.11.2026 в одній довгій сесії.

1. **Старт.** Запит: «сайт типу Dotabuff для Deadlock, білди і вінрейт, скіли героїв, гарний UI не як нейронка,
   з фотками героїв, анімації, документація в md для іншої нейронки». Зроблено весь SPA + Частина I
2. **Тексти й мови.** Прибрати крапки в кінці всіх речень в UI. Українізація з перемикачем EN/UA.
   Трохи більше повітря в заголовках
3. **Білди / картки / позиції:**
   - коментар автора до предмета: пробували гарний стилізований блок — **власник попросив прибрати**, лишився простий «!» з нативним title
   - іконки тегів білда (до 3 штук, як у грі) — додано
   - картки героїв однакової висоти, дворядкові імена піднімаються вгору — зроблено
   - лайни: лишити **тільки** чіп «Кращий лайн: X» останнім у шапці героя, решту лайнового UI прибрати
   - **позиції як у Доті** (carry / playmaker / pick / support, 0–10): спершу зі скріну «Deadlock Role Board» +
     власний аналіз для героїв, яких там нема
4. **Фільтри й головна.** Фільтр білдів за характеристиками (тегами) з урахуванням пагінації. На головній текст
   showcase поверх арту героя. Класи (Стрілець, Містик…) першими, фільтр позицій — справа. Позиції без кольорів
5. **Правки оцінок від власника** (розділ 8). «Не роби героя універсалом — якщо такі є, напиши, я скажу».
   Колонка позиції в таблиці — одразу після тіру. У профілі героя позиції кольорові, панель позицій — найвище в сайдбарі
6. **Дрібні фікси.** Прибрано пояснювальний текст у вкладці білдів. Виправлено обрізані іконки в порядку прокачки.
   Showcase на головній вужчий, справа
7. Showcase — арт впритик до лівого краю. Сторінка `/builds` отримала ту саму логіку фільтра тегів
8. **Деплой.** Обговорили домен (не `.com` через ціну) і хостинг з прицілом на майбутній бекенд (Steam-логін,
   аналіз матчів) → вибрано **Cloudflare Pages**. Етап 1 затверджено: SEO-пререндер, `/uk` URL, sitemap,
   пошук і профіль гравця з «Це я», деплой
9. **Запуск.** Назва й домен `deadbuff.net` (Namecheap) → DNS у Cloudflare → пуш у GitHub → Pages
   (власник спершу потрапив у Workers-флоу, перейшли на Pages) → custom domains → редірект www →
   deploy hook + щоденний workflow → Search Console (sitemap «Успішно», 452) → Bing (в процесі)
10. **Знайдено баг** з профілями гравців на Pages (308 через `.html`) → виправлено локально, чекає пушу
11. Власник побачив `DNS_PROBE_FINISHED_NXDOMAIN` — це роутер власника (192.168.110.1) закешував «домену нема»;
    публічні DNS (1.1.1.1, 8.8.8.8) домен бачать. Проблема не сайту
12. Обговорено етап 2 (вхід через Steam) і ідеї розвитку — розділи 10–11
13. **Друга сесія 13.11 (локально, не запушено):**
    - у шапці таби «Тір-ліст» і «Герої» поміняні місцями (тір-ліст перший)
    - `/builds`: прибрано «All» — за замовчуванням білди першого героя в списку
    - мови: замість EN/UA-перемикача — кнопка-глобус з меню; додано **німецьку, іспанську, російську**
      (свої URL `/de`, `/es`, `/ru`, пререндер, sitemap, hreflang). Словники перекладені з урахуванням офіційних ігрових термінів
    - шрифти: при EN → UA інтерфейс «збільшувався» (Oswald на ~22% ширший за Big Shoulders, у Fira більша x-висота).
      Шрифти лишились ті самі, але вирівняні через `font-size-adjust` — розміри тепер майже однакові. RU — як UA, DE/ES — як EN
    - профіль героя: краї портрета плавно зникають у фон; прибрано темний прямокутник за SVG-іменем
      (його давала анімація появи, що обрізала світіння)
    - лор: у 34 героїв API розділяє абзаци `<br><br>` — тепер це абзаци, курсив з API теж працює
14. **Там само, продовження (локально, не запушено):**
    - ім'я героя: світіння SVG-імені більше не обрізається різким краєм (clip-path знімається після анімації)
    - нові сторінки: `/items/:slug`, `/matches/:id`, `/patches`, `/leaderboard` (опис — розділ 1). У меню тепер
      7 пунктів: Тір-ліст, Герої, Предмети, Білди, Патчі, Лідери, Гравці. Нижче 1100px меню ховається в бургер
    - назви команд у матчі — офіційні з гри: «Таємний Король» / «Архімати»
    - лідерборд на старті рангового сезону короткий (Valve віддає мало гравців); посилання на профіль є лише тоді,
      коли нік однозначно відповідає одному акаунту
15. **Правки власника після цього:**
    - у магазині предметів не показувати предмети без даних (і не пререндерити їхні сторінки)
    - меню: лишити 4 головні таби, решту (Патчі, Гравці, Матчі, Лідери) сховати під кнопку «три риски» в кінці
    - нова сторінка «Матчі» з пошуком за ID; кожен матч у профілі гравця клікабельний → сторінка матчу
    - пошук у шапці: герої + предмети + ID матчу
16. **Наступні правки власника:**
    - предмети 5-го тиру (17 штук, ціна 9999) у грі не існують — прибрані скрізь: магазин, пошук, сторінки, пререндер
    - у лідерборді показувати лише одного найкращого героя
    - сторінка матчу: вкладки Таблиця / Статистика / Лінії / Хронологія з максимумом даних
    - у меню «Білди» перед «Предметами»
    - картки здібностей героя згортаються, зі стрілкою-підказкою
    - маленька стрілка «назад» під логотипом
17. **Фінальні правки:**
    - картки здібностей однакової висоти (назва в один рядок, опис завжди на два), закриваються кліком будь-де
    - лідерборд: колонка топ-героїв як була; якщо нік мають кілька акаунтів, беремо той, у кого найвищий ранг
      (`/players/rank?account_ids=` одним запитом), «×12» більше не показуємо
    - стрілка «назад» вирівняна точно під логотипом
    - у шапці команди підписи: «19 Вбивства · 146,5 тис Душі»
    - таблиця матчу більше не їде вбік: фіксовані колонки, предмети переносяться; на телефоні кожен гравець — картка
      з підписами
    - нова панель «Хто кого вбивав» (з `death_details` матчу)
18. **Ще правки:**
    - на сторінці матчу підсвічується мій профіль (позначка «Це я») — у таблиці, рейтингах, матриці вбивств і на лініях
    - картка лінії: назва лінії та різниця в душах посередині, «виграли / програли лінію» над кожною парою,
      «Нічия» над обома
    - у 4 здібностей API не має опису (ульта Ґрейвз, Mina Rake, Silver Boot Kick, Solomon Develop Queen) —
      тепер беремо офіційний текст з тултипа гри, свій не вигадуємо
    - курсор над розгорнутою здібністю звичайний (був «заборонено»)
19. **І ще:** у картці лінії душі обох пар стоять впритул до центру
20. **Фавікон і пошук:**
    - у Google не було іконки сайту, бо був лише SVG, а `/favicon.ico` віддавав HTML (SPA-фолбек).
      Згенеровано `favicon.ico` (16/32/48) + PNG 48/96/192 + apple-touch-icon зі старого SVG, усе в `public/`
    - у таблиці матчу рядки згруповані по лініях (кольорова дужка зліва, назва лінії та виграли/програли)
    - пошук у шапці тепер знаходить і розділи: «deadlock statistics», «my account», «мої матчі», «тір-ліст»,
      а також «haze build» / «haze counters» → одразу потрібна вкладка героя; слово «deadlock» ігнорується
21. **Третя сесія 13.11 (локально, не закомічено).** Запит: «реалізувати план, можливо з бекендом, оптимізувати
    запити, безкоштовно (або до $5/міс), просто і швидко» + список:
    - **лінії в матчі**: душі зліва і справа стоять рівно одна під одною — середня колонка однакової ширини в усіх
      картках, ромбик душ завжди біля середини (дзеркально)
    - **бекенд** на Cloudflare Pages Functions + D1 (рішення: лишаємось на Cloudflare, $0; $5 — лише якщо впремось у ліміти)
    - **швидкість**: кешувальний проксі `/api/dl` з оновленням у фоні + вікно статистики округлене до дня (запити
      однакові цілу добу → постійні попадання в кеш)
    - **акаунти**: вхід через Steam або логін + e-mail + пароль (без підтвердження пошти, як просив власник), Steam можна
      підключити пізніше або зайти одразу через нього; видалення акаунта
    - **обране** (герої й білди), **особистий дашборд**, **порівняння з другом**, **розбір матчу** (таймінги проти
      Ascendant+), **драфт-помічник** з трьома режимами (контрпік — головний)
    - драфт-помічник у меню «три риски» першим пунктом (4 головні таби не чіпали)
    - модель драфту: поправки рахують лише взаємодію пари героїв, без загальної сили ворога — інакше проти сильних
      героїв «червоними» виходили всі
22. **16.11 — Search Console: «Проскановано – наразі не проіндексовано» (47) + «Сторінка з переспрямуванням» (1).**
    Причина: Google рендерить сторінку з JS і поважає robots.txt для кожного запиту сторінки. Наш robots.txt мав
    `Disallow: /api/`, тобто й проксі `/api/dl/`, а запасний шлях `api.deadlock-api.com` у своєму robots.txt
    забороняє всіх ботів. React стирає статичний текст, дані не вантажаться → Google бачив скелетон або «помилку
    завантаження» на всіх сторінках. Фікс: `Allow: /api/dl/` (довше правило перемагає `Disallow: /api/`), відповіді
    проксі з `X-Robots-Tag: noindex`. Переспрямування (1) — це `http://` або `www.` → норма, нічого робити не треба.
    Запушено 16.11 (`1777df3`)
23. **16.11 — партнерство й драфт.** Deadlock API додали Deadbuff до своїх сайтів-трекерів → у футері плашка
    «Офіційний партнер Deadlock API». Запит власника: «знизу — що ми офіційний партнер; перероби драфт-пікер як вважаєш
    кращим; додай сторінку й індексуй; на головній покажи, що є драфт-пікер; на мобілці не гортаються картки топ-5 героїв»:
    - драфт перероблено повністю: замість трьох режимів — одна дошка (вороги · «Ти» · союзники) і результати, що
      підлаштовуються самі. Подіум топ-3, «відповідь на кожного ворога», «краще не брати», сортування за шансом
      перемоги або силою контрпіку, пошук + Enter, «скопіювати посилання». Старі посилання `?mode=` відкриваються
    - нові сторінки `/counters` і `/counters/:slug` для пошуку («Who counters Haze»), у пререндері й sitemap
    - головна: блок «Кого пікнути проти цього складу» (6 найпопулярніших героїв як ворожий склад → драфт), чип у банері
    - мобілка: вітрину «#N у меті» можна гортати свайпом; три панелі «Зрізу мети» — горизонтальна стрічка зі свайпом
    - текст на профілі гравця: замість «додай бота в Steam» — ingest tool (deadlock-api.com/ingest-cache)
25. **17.11 — швидкість головної.** Cloudflare Web Analytics: 41 відвідування / 208 переглядів за 7 днів, 95% Core Web
    Vitals зелені, червоні лише на головній (`/`, `/uk`). Причина — фон вітрини «#N у меті» (0,8–1,7 МБ на героя):
    телефон за перші секунди тягнув ~4 МБ. Тепер на телефонах фон не вантажиться (градієнт у кольорі героя), на
    десктопі перший фон — без анімації й з пріоритетом. Власник погодив («так, прискор»)
24. **16.11 — сторінка `/about`.** Запит: «коротко, але чітко й круто; я стрімер BethakZS, Twitch можна лишити».
    Власник — **стрімер Deadlock BethakZS** (twitch.tv/bethakzs). На сторінці: заголовок «Від гравця — для гравців»,
    цифри, три картки (чесні цифри · контрпіки й драфт · твої ігри), блок стрімера з кнопкою Twitch у фіолетовому
    кольорі Twitch, блок «Звідки цифри» з плашкою партнера. Посилання — у футері й у пошуку («twitch», «about»)

---

## 7. Правила роботи з власником

- Спілкування — **українською**. Коротко, по ділу, з конкретними кроками («куди натиснути»)
- **Комітити й пушити тільки коли власник прямо скаже** («пуш», «закомить»). Готові зміни — назвати і спитати
- Секрети (deploy hook, ключі API, `SESSION_SECRET`) — тільки в GitHub Secrets / Cloudflare env
- Бекенд має лишатись **безкоштовним** (або до $5/міс) і простим: Cloudflare Pages Functions + D1, без окремих серверів
- **UI-тексти без крапки в кінці.** Усі рядки через `useT()`, обидві мови
- Дизайн: тема «occult noir / art-deco», тільки токени з `tokens.css`, ніякого «generic AI dashboard»
- **Оцінки позицій з `o(…)` — від власника, ніколи не «виправляти» назад.** Нової «універсальної» позиції не вигадувати:
  якщо герой рівний в усьому — назвати його власнику і попросити цифри
- **Не повертати те, що власник прибрав:**
  - лайновий UI: фільтр, колонку, панель, вкладку лайн-партнерів
  - стилізований блок коментаря автора
  - кольорові позиції поза профілем героя
  - позицію «Flex / Універсал»
  - пояснювальний текст у вкладці білдів
  - колонку «остання гра» в таблиці героїв гравця
  - кнопку «All / Усі» в пікері героїв на `/builds`
- Після змін архітектури / маршрутів / даних — оновити Частина I; після сесії — цей файл
- Перед завершенням: `npm run build`, перевірка на 375px без горизонтального скролу, усі мови — мінімум EN, UA і DE
  (у німецькій найдовші слова) — Частина I, §11

---

## 8. Позиції героїв — оцінки власника

Джерело правди — `src/data/roles.ts`. Аргументи: **`(support, pick, playmaker, carry)`**.
`b()` — зі скріну Role Board, `a()` — наш аналіз, `o()` — **правка власника (головніша за все)**.

| Герой (slug) | Support | Pick | Playmaker | Carry |
|---|---|---|---|---|
| apollo | 1 | 1 | 9 | 2 |
| drifter (Блукач) | 0 | 1 | 8 | 6 |
| dynamo | 7 | 4 | 6 | 1 |
| graves | 7 | 1 | 5 | 4 |
| ivy (Плющ) | 7 | 5 | 5 | 4 |
| mcginnis | 6 | 3 | 3 | 3 |
| paige | 10 | 6 | 3 | 4 |
| rem (Сон) | 10 | 7 | 6 | 4 |
| victor | 1 | 0 | 4 | 8 |
| viscous (Вʼязкий) | 7 | 2 | 6 | 4 |
| warden (Постовий) | 3 | 1 | 6 | 6 |
| deadman-danny (Дохлий Дені) | 1 | 8 | 7 | 5 |

Наш аналіз `a()` (можна попросити власника перевірити): rat-king 6/2/7/4, solomon 7/6/5/2, violet 5/6/8/4,
nurse-harrow 10/3/5/0, baba 4/6/8/5.

Логіка: позиції героя = усі ролі з оцінкою ≥ 7 + найвища роль (щоб у кожного була хоч одна). Зараз героїв
без визначеної позиції немає.

---

## 9. Відкриті питання до власника

0. ✅ Третя сесія задеплоєна. **Власнику:** перевірити на deadbuff.net «Увійти через Steam» → дашборд, зірочку на
   герої → «Обране»
0a. **Відновлення пароля** немає (немає відправки пошти — власник не хотів підтвердження e-mail). Якщо потрібне —
   знадобиться поштовий сервіс (наприклад, Resend, безкоштовно до 3 тис. листів/міс) або Cloudflare Email Workers
0. ✅ Зміни 16.11 (драфт, контрпіки, головна, футер, `/about`) запушено. **Власнику:** глянути /draft, /counters/haze, /about на телефоні
0a1. Перевірити, що посилання на Twitch правильне: **twitch.tv/bethakzs** (на `/about`, у `About.tsx` → `TWITCH_URL` і в
   `scripts/prerender.ts`)
0a2. Попросити Deadlock API зробити іконку Deadbuff на їхній головній **посиланням** на deadbuff.net (зараз це лише
   картинка — для Google не рахується). Посилання з тематичного сайту — найцінніше для SEO нового домену
0b. Переклади нових текстів DE / ES / RU — підібрані вручну, варто глянути носіям (16.11 додано ~60 рядків драфту
   й контрпіків: DE «Wer kontert …», ES «Counters contra …», RU «Контрпики: …»): DE «Draft-Helfer», «Jäger»;
   ES «Asistente de draft», «Panel»; RU «Драфт-помощник»
1. ✅ Запушено. **Що зробити власнику в Search Console:** «Перевірка URL» → `https://deadbuff.net/` → «Запит на
   індексування» (щоб швидше підхопилась іконка сайту й нові сторінки). Іконка в Google зʼявляється за кілька днів.
   Bing — додати sitemap вручну
1a. **Переклади DE / ES / RU** — терміни, яких нема в API, підібрані вручну; варто показати носіям мови:
   ES «Definitiva» (ульта), «{n} PH» (очки здібностей), «hace 3 mes»; DE «Ultimative Fähigkeit», «{n} FP»,
   «Schütze» (Marksman), «Jäger» (pick); RU «Живучесть» (vitality), «Спиритизм» (spirit), «Матчапы», «{n} ОУ»
2. **«плеймейкер 6» без імені героя** у списку правок: зараз playmaker 6 стоїть і в Warden, і у Viscous —
   підтвердити, до кого стосувався другий «плеймейкер 6»
3. **Класи для 6 героїв без `hero_type` в API** (Dynamo, Kelvin, Ivy, Paige, Rem, Nurse Harrow) — зараз показані
   як «Універсал». Власник може дати їм справжні класи (Стрілець, Містик…)
4. З чого починати розробку далі (розділ 11): рекомендація — сторінки предметів, потім матчів, потім Steam-логін

---

## 10. Етап 2: вхід через Steam — план реалізації

✅ **Реалізовано в третій сесії** (Частина I, §3 «Backend»). Відмінності від плану нижче: є ще вхід за логіном і
паролем (власник попросив), база прив'язана до користувача (`users.id`), а не до Steam-акаунта, тож Steam можна
підключити пізніше; D1-схема створюється автоматично; додано кешувальний проксі `/api/dl`. План лишається для історії.

### Де
**Cloudflare Pages Functions** — папка `functions/` у цьому ж репо, деплоїться разом із сайтом на той самий
домен → cookie first-party, без CORS. Окремого сервера не треба. Спільний серверний код — у `server/`
(поза `functions/`, щоб файли не ставали маршрутами). Статичні сторінки функції не чіпають.

### Протокол
Steam не має OAuth — лише **OpenID 2.0**. Пароль через наш сайт не проходить, ключі не потрібні.

1. Кнопка «Увійти через Steam» → `GET /api/auth/steam/login` → 302 на `https://steamcommunity.com/openid/login` з:
   `openid.ns=http://specs.openid.net/auth/2.0`, `openid.mode=checkid_setup`,
   `openid.return_to=https://deadbuff.net/api/auth/steam/callback`, `openid.realm=https://deadbuff.net`,
   `openid.identity` = `openid.claimed_id` = `http://specs.openid.net/auth/2.0/identifier_select`
   (куди повернути користувача після входу — у короткоживучому cookie або параметрі `return_to`)
2. Користувач логіниться на сторінці Steam
3. Steam повертає на `/api/auth/steam/callback?openid.*=…`
4. **Обовʼязкова перевірка:** відправити всі `openid.*` назад POST-ом на той самий endpoint Steam з
   `openid.mode=check_authentication` → у відповіді має бути `is_valid:true`. Додатково: `openid.return_to`
   починається з нашого callback, `openid.op_endpoint` — Steam, `claimed_id` відповідає
   `^https://steamcommunity\.com/openid/id/(\d{17})$`. Без цього кроку можна підробити вхід під чужим акаунтом
5. SteamID64 → `account_id = steam64 − 76561197960265728` (`lib/steam.ts`)
6. Сесія: cookie `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30 днів`, значення =
   `accountId.expires` + HMAC-SHA256 (Web Crypto) з секретом `SESSION_SECRET` у Cloudflare env (encrypted)
7. `GET /api/me` → `{ accountId, name, avatar }` або 401. Нік і аватар — з Deadlock API `/players/steam?account_ids=`
   (як зараз; Steam Web API key не потрібен). `POST /api/auth/logout` — стерти cookie

### Файли
```
functions/api/auth/steam/login.ts
functions/api/auth/steam/callback.ts
functions/api/auth/logout.ts
functions/api/me.ts
server/session.ts          sign / verify cookie (HMAC)
server/steam-openid.ts     build redirect URL, verify callback
```

### Фронтенд
- `lib/api.ts`: `fetchMe()` → відносний `/api/me`
- `lib/me.ts`: `useMe()` бере дані з `/api/me` (react-query `['me']`); гості й далі можуть користуватись «Це я»
- `Layout.tsx`: кнопка «Увійти через Steam» / аватар з меню «Мій профіль · Вийти»
- `/me` → профіль залогіненого. Нові ключі в `i18n/en.ts` + `uk.ts`
- SEO не змінюється: статичні сторінки лишаються статичними, стан входу підвантажується в браузері

### База (коли знадобиться зберігати дані) — Cloudflare D1 (SQLite)
```sql
users     (account_id INTEGER PRIMARY KEY, created_at INTEGER, last_login_at INTEGER, settings TEXT)
favorites (account_id INTEGER, kind TEXT /* 'hero' | 'build' */, ref_id INTEGER, created_at INTEGER,
           PRIMARY KEY (account_id, kind, ref_id))
```
Таблиця `sessions` — тільки якщо знадобиться відкликати сесії (вихід на всіх пристроях).

### Безпека
- `account_id` береться тільки із сесії, ніколи з тіла запиту / URL
- Усі зміни даних — лише `POST` / `DELETE` + перевірка заголовка `Origin`
- Секрети тільки в Cloudflare env; ключ Deadlock API (`X-API-KEY`, якщо впремось у ліміти) — теж тільки там

### Локальна розробка
`wrangler pages dev dist` (функції на :8788) + проксі `/api` у `vite.config.ts` → `http://localhost:8788`.
Steam приймає `realm`/`return_to` з `http://localhost:8788` для тестів.

### Що дасть вхід
- Свій профіль на будь-якому пристрої, аватар у шапці
- **Особистий дашборд:** WR на кожному герої проти середнього на твоєму ранзі (`/players/hero-stats` +
  `/analytics/hero-stats?min_average_badge=…`), сильні / слабкі герої
- Улюблені герої та білди, порівняння з другом
- Розбір матчу: твої таймінги предметів проти топ-гравців на цьому герої

Оцінка: сам вхід — ~6 файлів і вечір роботи; дашборд — окремий етап.

---

## 11. Ідеї і план розвитку

Рекомендований порядок: **P1 → P2 → P3**. Нові сторінки варто додавати раніше — Google індексує їх тижнями.

### P1 — швидко і дає трафік
- **Запушити фікс профілів гравців** і правки другої сесії
- ~~Сторінки предметів `/items/:slug`~~ — зроблено (локально)
- **Стиснути фони героїв** (~2 МБ webp) — швидкість сторінки впливає на позиції в Google
- Налаштування Cloudflare з розділу 3 (Crawler Hints, Web Analytics, DNSSEC, Email Routing)

### P2 — ядро Dotabuff
- ~~Сторінки матчів `/matches/:id`~~ — зроблено (локально). Далі можна: таймлайн об'єктів, карта смертей
- ~~Патчі: хто виріс / впав~~ — зроблено (локально)
- **Графік вінрейту героя** по днях / патчах (`hero-stats?bucket=start_time_day`)

### P3 — для утримання
- ~~Вхід через Steam + особистий дашборд~~ — зроблено (третя сесія)
- ~~Улюблені герої / білди~~ — зроблено
- ~~Порівняння двох гравців~~ — зроблено
- Далі: відновлення пароля, «вийти на всіх пристроях», сповіщення про нові матчі

### Далі
- ~~Лідерборд по регіонах~~ — зроблено (локально)
- ~~Драфт-помічник~~ — перероблено 16.11 (одна дошка + сторінки `/counters`). Далі можна: бани, лайни в драфті,
  «чий пік наступний», OG-картинка драфту для Discord
- ~~Сторінка `/about`~~ — зроблено 16.11. Далі можна: статус «зараз у ефірі» (потрібен ключ Twitch API, лише на бекенді)
- Щотижневий мета-звіт з постійною адресою (`/meta/2026-w47`): хто виріс / впав, нові контрпіки — готовий пост для Reddit
- Discord-бот (`/deadbuff haze` → білд і контрпіки) на Cloudflare Worker — безкоштовно, той самий проксі
- Рефакторинг: `Draft.tsx` (~800 рядків) розбити на `pages/draft/*`; словники (~650 ключів) — по файлах на розділ;
  `@types/node` у devDependencies, щоб `scripts/` теж проходили typecheck
- Сторінки «Haze vs Infernus» — тільки популярні пари (щоб не плодити порожніх сторінок)
- Win rate предметів за часом покупки (прибирає перекіс на користь пізніх предметів)
- Ще мови інтерфейсу (французька, польська, португальська…) — API віддає ігрову локалізацію, додати = словник +
  запис у `LANGS` (див. Частину I, §8)
- OG-картинки під кожен білд для гарних превʼю в Discord / Reddit

---

## 12. Відомі нюанси

- Повнота даних гравця залежить від Deadlock API: повна історія — лише для акаунтів, що додали їхнього бота в Steam
- Профіль гравця рахує тільки звичайний режим (`game_mode = 1`); перемога = `match_result === player_team`
- `/analytics/lane-matchup-stats` позначений в API як «subject to change» — якщо впаде, чіп лайну просто зникне
- Старий хост `assets.deadlock-api.com` більше не резолвиться — ассети тільки з `/v1/assets/*`
- Матч з'являється в API (і на всіх трекерах), лише коли хтось його надіслав. Гравцям радимо ingest tool від Deadlock API
  (deadlock-api.com/ingest-cache) — посилання в примітці на профілі гравця
- «Найкращий контрпік» може мати вінрейт < 50% проти героя: контрпік = ефект понад власну силу обох героїв. Тому в рядку
  є «очікувано» (вінрейт героя з поправкою на силу ворога) — різниця між ним і фактичним і є ефектом
- Пререндерні цифри — знімок на момент білду (раз на добу); React одразу підтягує живі дані
- Google індексує **відрендерену** сторінку (після JS), а не статичний текст. Якщо дані не вантажаться (robots.txt,
  ліміт функцій) — Google бачить скелетон. Перевірка: Search Console → Перевірка URL → «Перевірити URL у реальному часі»
  → «Переглянути перевірену сторінку» → знімок екрана і «Ресурси сторінки» (нічого не має бути «Заблоковано robots.txt»
  з `/api/dl/`)
- Якщо в когось сайт «не відкривається» (`NXDOMAIN`), а 1.1.1.1 / 8.8.8.8 домен бачать — це кеш DNS роутера
  або провайдера: перезапуск роутера або «Безпечний DNS» у Chrome

---

## 13. Журнал оновлень цього файлу

- **13.11.2026** — створено після запуску сайту: стан, інфраструктура, історія, правила, план етапу 2
- **13.11.2026 (друга сесія)** — 5 мов + глобус, вирівнювання шрифтів, `/builds` без «All», портрет і лор героя
  (розділ 6, п. 13); оновлено розділи 1, 2, 7, 9, 11
- **13.11.2026 (друга сесія, продовження)** — сторінки предметів, матчів, патчів, лідерборду; фікс світіння імені героя;
  меню на 7 пунктів (розділ 6, п. 14); оновлено розділи 1, 2, 9, 11
- **13.11.2026 (друга сесія, ще правки)** — меню «4 таби + три риски», сторінка `/matches`, клікабельні матчі в профілі,
  пошук героїв / предметів / матчів, магазин без предметів без даних (розділ 6, п. 15)
- **13.11.2026 (друга сесія, фінал)** — прибрано tier 5, вкладки на сторінці матчу (статистика, лінії, хронологія),
  згортання здібностей, стрілка «назад» (розділ 6, п. 16); далі — рівні картки здібностей, вибір акаунта за рангом
  у лідерборді, таблиця матчу без горизонтального скролу, матриця вбивств (п. 17); підсвітка себе в матчі,
  нові картки ліній, опис ульти Ґрейвз з API (п. 18); фавікон для Google, групування по лініях у таблиці матчу,
  пошук по розділах (пп. 19–20)
- **13.11.2026 (третя сесія)** — бекенд (Pages Functions + D1), кешувальний проксі, акаунти (Steam + логін), обране,
  дашборд, порівняння, розбір матчу, драфт-помічник, рівні душі в лініях (розділ 6, п. 21); оновлено розділи 1–4, 7, 9–11
  і Частину I (§1–11)
- **16.11.2026** — розбір звіту Search Console про неіндексовані сторінки, фікс robots.txt для `/api/dl/` (розділ 6, п. 22);
  оновлено розділи 2, 5, 12 і Частину I (SEO prerender)
- **16.11.2026 (друга частина)** — партнерство з Deadlock API, новий драфт-помічник, сторінки контрпіків, блок драфту на
  головній, свайпи на мобілці, ingest tool (розділ 6, п. 23); оновлено розділи 1, 2, 5, 9, 12 і Частину I (§1, §4, §6–8, §10)
- **16.11.2026 (третя частина)** — сторінка `/about` зі стрімером BethakZS (розділ 6, п. 24); оновлено розділи 1, 2, 9, 11 і
  Частину I (§3, §4, §8)
- **17.11.2026** — розбір Web Analytics і GSC, швидкість головної на телефонах (розділ 6, п. 25); оновлено розділ 2 і
  Частину I (§4, §8, §10)
