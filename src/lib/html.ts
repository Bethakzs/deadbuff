/**
 * Ability/item descriptions from the API are HTML fragments that contain
 * <span class="highlight">, inline <svg> icons and <img class="inline-attribute">.
 * We render them with dangerouslySetInnerHTML after stripping anything executable.
 */
const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT']);

const cache = new Map<string, string>();

/** Site style: no full stop at the end of a text block ("..." is kept). Works on plain text and HTML. */
export const trimDot = (s: string) => s.replace(/(?<!\.)\.(?=(?:\s|<\/[a-zA-Z0-9]+>)*$)/, '');

export function sanitizeHtml(html: string | undefined | null, trim = true): string {
  if (!html) return '';
  const key = `${trim ? 1 : 0}${html}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (BLOCKED_TAGS.has(child.tagName.toUpperCase())) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) child.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:'))
          child.removeAttribute(attr.name);
      }
      // inline svg icons ship with width/height="128": let CSS size them
      if (child.tagName.toLowerCase() === 'svg') {
        child.removeAttribute('width');
        child.removeAttribute('height');
        child.setAttribute('class', `${child.getAttribute('class') ?? ''} inline-icon`.trim());
      }
      walk(child);
    }
  };
  walk(root);
  let out = root.innerHTML.replace(/\n/g, ' ').trim();
  if (trim) out = trimDot(out);
  cache.set(key, out);
  return out;
}

/**
 * Hero lore paragraphs. The API separates them with "\n" for some heroes and with "<br><br>" for
 * others (Graves, Danny…), and may wrap quotes in <span class="italics"> / <i> — so the paragraphs
 * are HTML fragments: render them through sanitizeHtml(), or stripHtml() for plain text.
 * Pure string code — also used by the Node prerender.
 */
export function loreParagraphs(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .split(/(?:\s*<br\s*\/?>\s*)+|\n+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Plain-text version (for meta tags / search). */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
