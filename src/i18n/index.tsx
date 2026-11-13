import { Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { elapsed, setFormatLocale } from '../lib/format';
import { I18nContext as Ctx, type Vars } from './context';
import { de } from './de';
import { en, type MsgKey } from './en';
import { es } from './es';
import { ru } from './ru';
import { LANGS, langFromBrowser, langFromPath, pathForLang, type Lang, type Msg } from './types';
import { uk } from './uk';

export { LANGS };
export type { Lang, MsgKey };

const DICTS: Record<Lang, Record<MsgKey, Msg>> = { en, uk, de, es, ru };
const STORAGE_KEY = 'deadbuff.lang.v1';

/**
 * The URL is the source of truth (/uk/... = Ukrainian, /de/... = German…). A visitor landing on an
 * English URL is moved to another language's URL only if they chose that language before, or — on
 * their first visit — it is their browser's language. Crawlers (no storage, English browser) always
 * get the URL they asked for.
 */
function detect(): Lang {
  const { pathname, search, hash } = window.location;
  const fromPath = langFromPath(pathname);
  if (fromPath !== 'en') return fromPath;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  const savedLang = LANGS.find((l) => l.id === saved)?.id;
  const want = savedLang ?? langFromBrowser(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']) ?? 'en';
  if (want !== 'en') window.history.replaceState(null, '', pathForLang(pathname, want) + search + hash);
  return want;
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

  /** Switches language by moving to the same page under that language's URL prefix (the router remounts on it). */
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

  // Number/date formatters and <html lang> (drives the per-script font swap in tokens.css)
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
