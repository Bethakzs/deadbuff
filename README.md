# Deadbuff

Dotabuff-style stats site for **Deadlock**: hero win rates & tier list, community builds ranked by real match
win rate, every ability explained (cooldowns, T1/T2/T3 upgrades), popular skill orders, item stats, matchups,
player lookup with match history.

All data comes live from the public [Deadlock API](https://deadlock-api.com) — no backend needed.
The UI is available in English (`/…`), Ukrainian (`/uk/…`), German (`/de/…`), Spanish (`/es/…`) and Russian (`/ru/…`); hero, ability and item texts use the game's official translation.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ — vite build + SEO prerender (~1925 static pages, sitemap, robots)
npm run preview    # serves dist/ like Cloudflare Pages → http://localhost:4173
```

## Deploy (Cloudflare Pages)

1. Push this repo to GitHub (private is fine).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `SITE_URL` = `https://your-domain` (no trailing slash) — used for canonical
     links, hreflang and `sitemap.xml`. Node version comes from `.node-version`.
3. **Custom domains** → add your domain (buy it in Cloudflare Registrar to skip DNS setup).
4. Daily refresh of the prerendered numbers: Pages → Settings → Builds → **Deploy hooks** → create one,
   then add its URL as the GitHub Actions secret `CF_PAGES_DEPLOY_HOOK` (`.github/workflows/daily-rebuild.yml`).
5. Google: [Search Console](https://search.google.com/search-console) → add the domain → submit `https://your-domain/sitemap.xml`.

Routing on Cloudflare Pages: `/heroes/haze` is served from `heroes/haze.html` (prerendered), player
profiles are rewritten to the SPA shell (`/app`) by the generated `_redirects`, anything else falls back
to `index.html`. `vercel.json` provides the same for Vercel.

**For AI agents / contributors:** read [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — status, infrastructure,
decision history and roadmap (Ukrainian), then [`AGENTS.md`](AGENTS.md) — architecture, API reference, design
system and conventions.

Not affiliated with Valve. Deadlock and its art are © Valve Corporation.
