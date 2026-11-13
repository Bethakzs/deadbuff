import { Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { elapsed, setFormatLocale } from '../lib/format';
import { I18nContext as Ctx, type Vars } from './context';
import { en, type MsgKey } from './en';
import { LANGS, langFromPath, pathForLang, type Lang, type Msg } from './types';
import { uk } from './uk';

export { LANGS };
export type { Lang, MsgKey };

const DICTS: Record<Lang, Record<MsgKey, Msg>> = { en, uk };
const STORAGE_KEY = 'deadbuff.lang.v1';

/**
 * The URL is the source of truth (/uk/... = Ukrainian). A visitor landing on an English URL is moved
 * to the /uk version only if they chose Ukrainian before, or — on their first visit — their browser
 * is Ukrainian. Crawlers (no storage, English browser) always get the URL they asked for.
 */
function detect(): Lang {
  const { pathname, search, hash } = window.location;
  if (langFromPath(pathname) === 'uk') return 'uk';
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  if (saved === 'uk' || (!saved && nav.startsWith('uk'))) {
    window.history.replaceState(null, '', pathForLang(pathname, 'uk') + search + hash);
    return 'uk';
  }
  return 'en';
}

const pluralRules = new Map<string, Intl.PluralRules>();
function resolve(msg: Msg, locale: string, n: unknown): string {
  if (typeof msg === 'string') return msg;
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
  const cat = rules.select(typeof n === 'number' ? n : Number(n) || 0) as 'one' | 'few' | 'many' | 'other';
  return msg[cat] ?? msg.other;
}

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m)) : s;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);
  const meta = LANGS.find((l) => l.id === lang)!;

  /** Switches language by moving to the same page under the other URL prefix (the router remounts on it). */
  const setLang = useCallback((next: Lang) => {
    const { pathname, search, hash } = window.location;
    window.history.replaceState(null, '', pathForLang(pathname, next) + search + hash);
    setLangState(next);
  }, []);

  // Back/forward across a language boundary (e.g. a link from another site to /uk/...).
  useEffect(() => {
    const onPop = () => setLangState(langFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Number/date formatters and <html lang> (drives the Cyrillic font swap in tokens.css)
  // must switch before children render, so do it synchronously.
  setFormatLocale(meta.locale);
  if (document.documentElement.lang !== meta.locale) document.documentElement.lang = meta.locale;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang, meta.locale]);

  const t = useCallback(
    (key: MsgKey, vars?: Vars) => fill(resolve(DICTS[lang][key] ?? en[key], meta.locale, vars?.n), vars),
    [lang, meta.locale],
  );

  const rich = useCallback(
    (key: MsgKey, vars: Record<string, ReactNode>) => {
      const template = resolve(DICTS[lang][key] ?? en[key], meta.locale, vars.n);
      return template.split(/(\{\w+\})/g).map((part, i) => {
        const k = part.match(/^\{(\w+)\}$/)?.[1];
        return <Fragment key={i}>{k && k in vars ? vars[k] : part}</Fragment>;
      });
    },
    [lang, meta.locale],
  );

  const ago = useCallback(
    (unix: number) => {
      const e = elapsed(unix);
      return e ? t('time.ago', { n: e.n, u: t(`time.${e.unit}` as MsgKey) }) : t('time.justNow');
    },
    [t],
  );

  const value = useMemo(() => ({ lang, meta, setLang, t, rich, ago }), [lang, meta, t, rich, ago]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useT must be used inside <I18nProvider>');
  return v;
}
