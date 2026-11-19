/* ------------------------------------------------------------------ *
 * Locale-aware formatting. The active locale is switched by
 * I18nProvider (setFormatLocale) — e.g. "57.0%" in English, "57,0%" in Ukrainian.
 * ------------------------------------------------------------------ */
let locale = 'en';
const cache = new Map<string, Intl.NumberFormat>();

export function setFormatLocale(l: string) {
  locale = l;
}

function nf(key: string, opts: Intl.NumberFormatOptions) {
  const k = `${locale}|${key}`;
  let f = cache.get(k);
  if (!f) cache.set(k, (f = new Intl.NumberFormat(locale, opts)));
  return f;
}
const fixed = (n: number, digits: number) =>
  nf(`f${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** "1.3M" / "1,3 млн" — the abbreviation dot some locales add ("тис.") is dropped (site style: no trailing dots) */
export const fmtCompact = (n: number) =>
  nf('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(n).replace(/\.$/, '');
export const fmtInt = (n: number) => nf('int', { maximumFractionDigits: 0 }).format(Math.round(n));
/** Up to 2 decimals, no trailing zeros, locale separators: 0.6 / 0,6 · 1.75 / 1,75 · 25 */
export const fmtFlex = (n: number) => nf('flex', { maximumFractionDigits: 2, useGrouping: false }).format(n);
export const fmtPct =(ratio: number, digits = 1) => `${fixed(ratio * 100, digits)}%`;
export const fmtNum = (n: number, digits = 1) => fixed(n, digits);

/** "+1.4%" / "−0.8%" for deltas expressed as ratios */
export const fmtDelta = (ratio: number, digits = 1) => `${ratio >= 0 ? '+' : '−'}${fixed(Math.abs(ratio * 100), digits)}%`;

export const fmtSouls = (n: number) => (n >= 1000 ? `${fixed(n / 1000, n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);

export const fmtTime = (seconds: number) => {
  // round the total first: rounding only the remainder turned 1259.7 s into "20:60"
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const fmtDate = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

export const fmtLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });

/** Elapsed time split into a count + unit key ("y" | "mo" | "w" | "d" | "h" | "m"); null = just now. */
export function elapsed(unix: number): { n: number; unit: 'y' | 'mo' | 'w' | 'd' | 'h' | 'm' } | null {
  const diff = Date.now() / 1000 - unix;
  const units: [number, 'y' | 'mo' | 'w' | 'd' | 'h' | 'm'][] = [
    [31536000, 'y'],
    [2592000, 'mo'],
    [604800, 'w'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [sec, unit] of units) if (diff >= sec) return { n: Math.floor(diff / sec), unit };
  return null;
}

/**
 * Win-rate -> color class. The scale is centred on 50% because a hero/item
 * at 50% is perfectly balanced; ±3% is already a strong signal in Deadlock.
 */
export function wrTone(wr: number): 'great' | 'good' | 'even' | 'bad' | 'awful' {
  if (wr >= 0.53) return 'great';
  if (wr >= 0.51) return 'good';
  if (wr > 0.49) return 'even';
  if (wr > 0.47) return 'bad';
  return 'awful';
}
