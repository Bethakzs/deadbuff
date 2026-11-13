/** A UI string, or plural forms keyed by Intl.PluralRules category (`{n}` = the count). */
export type Msg = string | { one: string; few?: string; many?: string; other: string };

export type Lang = 'en' | 'uk';

export interface LangMeta {
  id: Lang;
  /** label on the switcher */
  label: string;
  /** Intl locale for numbers / dates / plural rules */
  locale: string;
  /** `language` query param for /v1/assets/* (hero names, abilities, items, ranks) */
  api: string;
  /**
   * URL prefix (router basename). English lives at /heroes/haze, Ukrainian at /uk/heroes/haze —
   * separate URLs so Google indexes both languages (hreflang).
   */
  prefix: '' | `/${string}`;
}

export const LANGS: LangMeta[] = [
  { id: 'en', label: 'EN', locale: 'en', api: 'english', prefix: '' },
  { id: 'uk', label: 'UA', locale: 'uk', api: 'ukrainian', prefix: '/uk' },
];

/** Language encoded in a pathname ("/uk/..." → uk, anything else → en). */
export function langFromPath(pathname: string): Lang {
  return pathname === '/uk' || pathname.startsWith('/uk/') ? 'uk' : 'en';
}

/** Same page in another language: "/uk/heroes/haze" ⇄ "/heroes/haze". */
export function pathForLang(pathname: string, lang: Lang): string {
  const bare = pathname === '/uk' ? '/' : pathname.startsWith('/uk/') ? pathname.slice(3) : pathname;
  return lang === 'uk' ? (bare === '/' ? '/uk' : `/uk${bare}`) : bare;
}
