import { sanitizeHtml } from '../lib/html';

/** Renders an API description fragment (highlights, inline icons) safely, without a trailing full stop. */
export function Html({ html, className = '', as: Tag = 'div' }: { html?: string | null; className?: string; as?: 'div' | 'span' | 'p' }) {
  if (!html) return null;
  return <Tag className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
