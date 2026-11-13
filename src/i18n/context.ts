import { createContext, type ReactNode } from 'react';
import type { MsgKey } from './en';
import type { Lang, LangMeta } from './types';

export type Vars = Record<string, string | number>;

export interface I18n {
  lang: Lang;
  meta: LangMeta;
  setLang: (l: Lang) => void;
  /** Plain string. Plural entries pick their form from `vars.n`. */
  t: (key: MsgKey, vars?: Vars) => string;
  /** Like t(), but placeholders may be React nodes (e.g. a bold number). */
  rich: (key: MsgKey, vars: Record<string, ReactNode>) => ReactNode;
  /** "5h ago" / "5 год тому" */
  ago: (unix: number) => string;
}

/*
 * Lives in its own module on purpose: editing a dictionary hot-reloads i18n/index.tsx,
 * and if the context were created there, mounted components would keep the old
 * context object and throw "useT must be used inside <I18nProvider>" (dev only).
 */
export const I18nContext = createContext<I18n | null>(null);
