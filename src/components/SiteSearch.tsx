import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeroes, useShopItemSlugs } from '../hooks/useAssets';
import { useT, type MsgKey } from '../i18n';
import { heroIcon, heroRgb, roleOf } from '../lib/heroes';
import { TIER_ROMAN, itemImage, type Slot } from '../lib/items';
import type { Hero, Item } from '../lib/types';

type Result =
  | { kind: 'hero'; key: string; to: string; hero: Hero; tab?: MsgKey }
  | { kind: 'item'; key: string; to: string; item: Item }
  | { kind: 'page'; key: string; to: string; label: string }
  | { kind: 'match' | 'player'; key: string; to: string; id: string };

const HEROES_MAX = 5;
const ITEMS_MAX = 5;
const PAGES_MAX = 4;

/**
 * Sections people search for by name ("deadlock tier list", "my stats"). `extra` holds English
 * words that are typed even in another language, since everyone googles Deadlock in English.
 */
const PAGES: { to: string; key: MsgKey; extra: string[] }[] = [
  { to: '/tier-list', key: 'nav.tierList', extra: ['tier list', 'tierlist', 'meta'] },
  { to: '/heroes', key: 'nav.heroes', extra: ['heroes', 'hero', 'stats', 'statistics', 'win rate', 'winrate'] },
  { to: '/builds', key: 'nav.builds', extra: ['builds', 'build'] },
  { to: '/items', key: 'nav.items', extra: ['items', 'item', 'shop'] },
  { to: '/patches', key: 'nav.patches', extra: ['patch', 'patches', 'update', 'buff', 'nerf'] },
  { to: '/matches', key: 'nav.matches', extra: ['match', 'matches', 'match id', 'game'] },
  { to: '/leaderboard', key: 'nav.leaderboard', extra: ['leaderboard', 'ranked', 'ladder', 'top'] },
  { to: '/players', key: 'nav.players', extra: ['players', 'player', 'profile', 'search player'] },
  { to: '/draft', key: 'nav.draft', extra: ['draft', 'drafter', 'counter pick', 'counterpick', 'pick', 'team builder'] },
  { to: '/me', key: 'nav.dashboard', extra: ['dashboard', 'my profile', 'my account', 'my stats', 'my statistics', 'me'] },
  { to: '/compare', key: 'nav.compare', extra: ['compare', 'vs friend', 'versus'] },
  { to: '/login', key: 'auth.login', extra: ['login', 'log in', 'sign in', 'register', 'sign up', 'steam'] },
  { to: '/about', key: 'nav.about', extra: ['about', 'twitch', 'stream', 'streamer', 'bethakzs', 'contact', 'deadbuff'] },
];

/** Hero sub-pages, so "haze build" or "haze counters" jumps straight to the right tab. */
const HERO_TABS: { tab: string; key: MsgKey; extra: string[] }[] = [
  { tab: 'builds', key: 'hero.tab.builds', extra: ['build', 'builds'] },
  { tab: 'items', key: 'hero.tab.items', extra: ['item', 'items'] },
  { tab: 'matchups', key: 'hero.tab.matchups', extra: ['counter', 'counters', 'matchup', 'matchups'] },
  { tab: 'lore', key: 'hero.tab.lore', extra: ['lore', 'story'] },
];

/**
 * Site search: heroes and shop items (localised + English names), and a pasted number opens a match
 * (or a player profile with that account id). Items load only once the search is used.
 * Press "/" anywhere to focus the header search, arrows + Enter to jump.
 */
export function SiteSearch({ big = false, autoFocus = false }: { big?: boolean; autoFocus?: boolean }) {
  const { list } = useHeroes();
  const { t, meta } = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [used, setUsed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const items = useShopItemSlugs(used);

  const results = useMemo<Result[]>(() => {
    const raw = q.trim();
    if (!raw) return [];
    // a pasted id: "136350680", "#136350680"
    const digits = raw.replace(/[\s#]/g, '');
    if (/^\d{5,}$/.test(digits)) {
      return [
        { kind: 'match', key: `m${digits}`, to: `/matches/${digits}`, id: digits },
        { kind: 'player', key: `p${digits}`, to: `/players/${digits}`, id: digits },
      ];
    }
    // "deadlock haze build" is one of the most typed queries — the game's name is noise here
    const s = raw
      .toLocaleLowerCase(meta.locale)
      .replace(/\bdeadlock\b|\bдедлок\b|\bдедлоку\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return [];
    const lc = (n: string) => n.toLocaleLowerCase(meta.locale);
    const rank = (names: string[]) => (names.some((n) => lc(n).startsWith(s)) ? 0 : 1);
    const hit = (words: string[]) => words.some((w) => w.includes(s) || s.includes(w));

    const matchedHeroes = list.filter(
      (h) => lc(h.name).includes(s) || h.name_en.toLowerCase().includes(s) || (h.tags ?? []).some((tag) => lc(tag).includes(s)),
    );
    // "<hero> <tab>": the hero name is only part of the query, so look for a tab word in the rest
    const heroTab = (hero: Hero) => {
      const rest = s.replace(lc(hero.name), ' ').replace(hero.name_en.toLowerCase(), ' ').trim();
      if (!rest) return undefined;
      return HERO_TABS.find((x) => [...x.extra, lc(t(x.key))].some((w) => w.startsWith(rest) || rest.startsWith(w)));
    };
    const named = list.filter((h) => s.includes(lc(h.name)) || s.includes(h.name_en.toLowerCase()));

    const heroes = [...new Set([...matchedHeroes, ...named])]
      .sort((a, b) => rank([a.name, a.name_en]) - rank([b.name, b.name_en]))
      .slice(0, HEROES_MAX)
      .map<Result>((hero) => {
        const tab = heroTab(hero);
        return {
          kind: 'hero',
          key: `h${hero.id}${tab?.tab ?? ''}`,
          to: `/heroes/${hero.slug}${tab ? `/${tab.tab}` : ''}`,
          hero,
          tab: tab?.key,
        };
      });

    const pages = PAGES.filter((p) => hit([lc(t(p.key)), ...p.extra]))
      .slice(0, PAGES_MAX)
      .map<Result>((p) => ({ kind: 'page', key: `s${p.to}`, to: p.to, label: t(p.key) }));

    const shop = [...items.bySlug.entries()]
      .filter(([, it]) => lc(it.name).includes(s) || (items.enName.get(it.id) ?? '').toLowerCase().includes(s))
      .sort(([, a], [, b]) => rank([a.name, items.enName.get(a.id) ?? '']) - rank([b.name, items.enName.get(b.id) ?? '']))
      .slice(0, ITEMS_MAX)
      .map<Result>(([slug, item]) => ({ kind: 'item', key: `i${item.id}`, to: `/items/${slug}`, item }));

    return [...heroes, ...pages, ...shop];
  }, [q, list, items.bySlug, items.enName, meta.locale, t]);

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
    const r = results[i];
    if (!r) return;
    navigate(r.to);
    setQ('');
    input.current?.blur();
  };

  const row = (r: Result) => {
    switch (r.kind) {
      case 'hero':
        return (
          <>
            <img src={heroIcon(r.hero)} alt="" />
            <span>
              {r.hero.name}
              {r.tab && <b className="search__tab"> · {t(r.tab)}</b>}
            </span>
            <small>{t(`role.${roleOf(r.hero)}` as MsgKey)}</small>
          </>
        );
      case 'page':
        return (
          <>
            <i className="search__glyph search__glyph--page" aria-hidden>
              ◈
            </i>
            <span>{r.label}</span>
            <small>{t('search.section')}</small>
          </>
        );
      case 'item': {
        const slot = (r.item.item_slot_type ?? 'weapon') as Slot;
        return (
          <>
            <img src={itemImage(r.item)} alt="" className={`search__item slot-${slot}`} />
            <span>{r.item.name}</span>
            <small className={`slot-text-${slot}`}>
              {t(`slot.${slot}`)}
              {r.item.item_tier ? ` · ${TIER_ROMAN[r.item.item_tier]}` : ''}
            </small>
          </>
        );
      }
      default:
        return (
          <>
            <i className="search__glyph" aria-hidden>
              #
            </i>
            <span>{t(r.kind === 'match' ? 'search.match' : 'search.player', { id: r.id })}</span>
            <small>{t(r.kind === 'match' ? 'nav.matches' : 'nav.players')}</small>
          </>
        );
    }
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
        onChange={(e) => {
          setQ(e.target.value);
          setUsed(true);
        }}
        onFocus={() => {
          setFocused(true);
          setUsed(true);
        }}
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
            {results.map((r, i) => (
              <li key={r.key}>
                <button
                  className={i === active ? 'is-active' : ''}
                  style={r.kind === 'hero' ? { ['--hero' as string]: heroRgb(r.hero) } : undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(i)}
                >
                  {row(r)}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
