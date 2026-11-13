import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeroes } from '../hooks/useAssets';
import { useT, type MsgKey } from '../i18n';
import { heroIcon, heroRgb, roleOf } from '../lib/heroes';

/** Hero quick-search (matches localised and English names). Press "/" anywhere to focus, arrows + Enter to jump. */
export function HeroSearch({ big = false, autoFocus = false }: { big?: boolean; autoFocus?: boolean }) {
  const { list } = useHeroes();
  const { t, meta } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const s = q.trim().toLocaleLowerCase(meta.locale);
    if (!s) return [];
    const starts = (n: string) => n.toLocaleLowerCase(meta.locale).startsWith(s);
    return list
      .filter(
        (h) =>
          h.name.toLocaleLowerCase(meta.locale).includes(s) ||
          h.name_en.toLowerCase().includes(s) ||
          (h.tags ?? []).some((tag) => tag.toLocaleLowerCase(meta.locale).includes(s)),
      )
      .sort((a, b) => Number(!(starts(a.name) || starts(a.name_en))) - Number(!(starts(b.name) || starts(b.name_en))))
      .slice(0, 7);
  }, [q, list, meta.locale]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (big) return; // only the header search owns the global hotkey
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(el.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);

  const go = (i: number) => {
    const h = results[i];
    if (!h) return;
    navigate(`/heroes/${h.slug}`);
    setQ('');
    input.current?.blur();
  };

  return (
    <div className={`search ${big ? 'search--big' : ''} ${focused ? 'is-focused' : ''}`}>
      <svg className="search__icon" viewBox="0 0 20 20" aria-hidden>
        <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') go(active);
          else if (e.key === 'Escape') input.current?.blur();
        }}
        placeholder={t(big ? 'search.placeholderBig' : 'search.placeholder')}
        aria-label={t('search.placeholder')}
        spellCheck={false}
      />
      {!big && <kbd className="search__kbd">/</kbd>}
      <AnimatePresence>
        {focused && results.length > 0 && (
          <motion.ul
            className="search__results"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18 }}
          >
            {results.map((h, i) => (
              <li key={h.id}>
                <button
                  className={i === active ? 'is-active' : ''}
                  style={{ ['--hero' as string]: heroRgb(h) }}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(i)}
                >
                  <img src={heroIcon(h)} alt="" />
                  <span>{h.name}</span>
                  <small>{t(`role.${roleOf(h)}` as MsgKey)}</small>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
