/** A UI string, or plural forms keyed by Intl.PluralRules category (`{n}` = the count). */
export type Msg = string | { one: string; few?: string; many?: string; other: string };

export type Lang = 'en' | 'uk' | 'de' | 'es' | 'ru';

export interface LangMeta {
  id: Lang;
  /** short code on the switcher button */
  label: string;
  /** native name in the language menu (never translated) */
  name: string;
  /** Intl locale for numbers / dates / plural rules; also <html lang> and hreflang */
  locale: string;
  /** Open Graph locale */
  og: string;
  /** `language` query param for /v1/assets/* (hero names, abilities, items, ranks) */
  api: string;
  /**
   * URL prefix (router basename). English lives at /heroes/haze, Ukrainian at /uk/heroes/haze —
   * separate URLs so Google indexes every language (hreflang).
   */
  prefix: '' | `/${string}`;
}

/** Order = order in the language menu. English must stay first (default, no prefix). */
export const LANGS: LangMeta[] = [
  { id: 'en', label: 'EN', name: 'English', locale: 'en', og: 'en_US', api: 'english', prefix: '' },
  { id: 'uk', label: 'UA', name: 'Українська', locale: 'uk', og: 'uk_UA', api: 'ukrainian', prefix: '/uk' },
  { id: 'de', label: 'DE', name: 'Deutsch', locale: 'de', og: 'de_DE', api: 'german', prefix: '/de' },
  { id: 'es', label: 'ES', name: 'Español', locale: 'es', og: 'es_ES', api: 'spanish', prefix: '/es' },
  { id: 'ru', label: 'RU', name: 'Русский', locale: 'ru', og: 'ru_RU', api: 'russian', prefix: '/ru' },
];

const PREFIXED = LANGS.filter((l) => l.prefix);

const hasPrefix = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Language encoded in a pathname ("/uk/..." → uk, "/de" → de, anything else → en). */
export function langFromPath(pathname: string): Lang {
  return PREFIXED.find((l) => hasPrefix(pathname, l.prefix))?.id ?? 'en';
}

/** Same page in another language: "/uk/heroes/haze" ⇄ "/heroes/haze" ⇄ "/de/heroes/haze". */
export function pathForLang(pathname: string, lang: Lang): string {
  const from = PREFIXED.find((l) => hasPrefix(pathname, l.prefix));
  const bare = from ? pathname.slice(from.prefix.length) || '/' : pathname;
  const prefix = LANGS.find((l) => l.id === lang)?.prefix ?? '';
  return prefix ? (bare === '/' ? prefix : `${prefix}${bare}`) : bare;
}

/** First browser language we support (only the user's top choice counts), e.g. "de-AT" → de. */
export function langFromBrowser(languages: readonly string[]): Lang | undefined {
  const top = (languages[0] ?? '').toLowerCase().split('-')[0];
  return LANGS.find((l) => l.locale === top)?.id;
}
