import { useEffect } from 'react';

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Keeps <title> and <meta name="description"> in sync while navigating client-side.
 * The first paint already has the right tags: scripts/prerender.ts writes them into every
 * static page with the same dictionary keys (meta.*).
 */
export function useDocumentMeta(title: string | undefined, description?: string) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) setMeta('description', description);
  }, [title, description]);
}
