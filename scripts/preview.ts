/* ------------------------------------------------------------------ *
 * Local preview of the production build that behaves like Cloudflare Pages:
 *   /heroes/haze      → dist/heroes/haze.html   (pretty URLs)
 *   /players/123      → dist/app.html           (_redirects 200 rules)
 *   anything unknown  → dist/index.html         (SPA fallback)
 *
 *   npm run build && npm run preview      →  http://localhost:4173
 * ------------------------------------------------------------------ */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT ?? 4173);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

/** `_redirects` lines "from to 200" — only 200 rewrites with a trailing /* or exact paths. */
const rewrites = existsSync(join(DIST, '_redirects'))
  ? readFileSync(join(DIST, '_redirects'), 'utf8')
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length >= 3 && p[2] === '200')
  : [];

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

function resolve(urlPath: string): string {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const direct = join(DIST, clean);
  if (!direct.startsWith(DIST)) return join(DIST, 'index.html');
  if (isFile(direct)) return direct;
  if (isFile(`${direct}.html`)) return `${direct}.html`;
  if (isFile(join(direct, 'index.html'))) return join(direct, 'index.html');
  for (const [from, to] of rewrites) {
    const hit = from.endsWith('/*') ? urlPath.startsWith(from.slice(0, -1)) : urlPath === from;
    // targets are extensionless like on Pages ("/app" → app.html)
    if (hit) return isFile(join(DIST, `${to}.html`)) ? join(DIST, `${to}.html`) : join(DIST, to);
  }
  return join(DIST, 'index.html');
}

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const file = resolve(path === '/' ? '/index.html' : path.replace(/\/$/, ''));
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Deadbuff preview → http://localhost:${PORT}`));
