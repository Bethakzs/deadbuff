import { fmtFlex } from './format';
import type { AbilityTooltipDetails, Item, ItemProperty } from './types';

export type Slot = 'weapon' | 'vitality' | 'spirit';

/** Slot keys in shop order (translate with t(`slot.${slot}`)). */
export const SLOTS: Slot[] = ['weapon', 'vitality', 'spirit'];

export const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export const TIER_COST: Record<number, number> = { 1: 800, 2: 1600, 3: 3200, 4: 6400, 5: 9999 };

/** Ability point cost of each upgrade tier (T1, T2, T3). */
export const UPGRADE_POINTS = [1, 2, 5];

export const itemImage = (it?: Item) =>
  it ? it.shop_image_webp ?? it.shop_image ?? it.image_webp ?? it.image ?? '' : '';

export const isShopItem = (it: Item) => it.type === 'upgrade' && it.shopable !== false && !it.disabled;

const humanize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^Ability /, '')
    .replace(/ Percent$/, '')
    .trim();

/** Formats a property value: handles "{s:sign}" prefix, unit postfix and values that already carry units ("20m"). */
export function formatPropValue(prop: ItemProperty | undefined, raw: string | number | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  const num = parseFloat(str);
  if (!Number.isFinite(num) || num === 0) return null;
  if (prop?.disable_value !== undefined && String(prop.disable_value) === str) return null;

  const inlineUnit = str.replace(/^[-+]?[\d.]+/, '');
  // prefer the API's (localised) postfix — values like "20m" carry an English unit
  const unit = prop?.postfix?.trim() || inlineUnit;
  const sign = prop?.prefix?.includes('sign') ? (num > 0 ? '+' : '') : '';
  const shown = fmtFlex(Math.abs(num) >= 100 ? Math.round(num) : num);
  return `${sign}${shown}${unit}`;
}

export interface StatLine {
  key: string;
  label: string;
  value: string;
  icon?: string;
  css?: string;
}

function propLine(item: Item, key: string): StatLine | null {
  const prop = item.properties?.[key];
  if (!prop) return null;
  const value = formatPropValue(prop, prop.value);
  if (!value) return null;
  return { key, label: prop.label || humanize(key), value, icon: prop.icon, css: prop.css_class };
}

/* ------------------------------ abilities --------------------------- */

const ABILITY_BASICS = ['AbilityCooldown', 'AbilityCharges', 'AbilityDuration', 'AbilityCastRange'];

function parseTooltip(item: Item): AbilityTooltipDetails | null {
  const td = item.tooltip_details;
  if (!td) return null;
  if (typeof td === 'string') {
    try {
      return JSON.parse(td) as AbilityTooltipDetails;
    } catch {
      return null;
    }
  }
  return td;
}

/** Headline numbers for an ability card: cooldown, charges, damage, etc. */
export function abilityKeyStats(item: Item, max = 6): StatLine[] {
  const keys: string[] = [...ABILITY_BASICS];
  const td = parseTooltip(item);
  td?.info_sections?.forEach((s) =>
    s.properties_block?.forEach((b) =>
      b.properties?.forEach((p) => p.important_property && keys.push(p.important_property)),
    ),
  );
  const seen = new Set<string>();
  const out: StatLine[] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    const line = propLine(item, k);
    if (line && !(k === 'AbilityCharges' && line.value === '1')) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

/** Description HTML for T1/T2/T3 ability upgrades; falls back to the raw property bonuses. */
export function abilityUpgrades(item: Item): string[] {
  const d = item.description ?? {};
  const given = [d.t1_desc, d.t2_desc, d.t3_desc];
  return [0, 1, 2].map((i) => {
    if (given[i]) return given[i]!;
    const ups = item.upgrades?.[i]?.property_upgrades ?? [];
    return ups
      .map((u) => {
        const prop = item.properties?.[u.name];
        const n = parseFloat(String(u.bonus));
        const unit = prop?.postfix?.trim() ?? '';
        const label = prop?.label || humanize(u.name);
        return `<span class="highlight">${n > 0 ? '+' : ''}${fmtFlex(n)}${unit}</span> ${label}`;
      })
      .join(', ');
  });
}

/* ------------------------------- items ------------------------------ */

export interface ItemTooltipData {
  stats: StatLine[];
  sections: { type: string; html: string; stats: StatLine[] }[];
}

/** Everything the item tooltip needs: innate stat lines + active/passive blurbs. */
export function itemTooltip(item: Item): ItemTooltipData {
  const stats: StatLine[] = [];
  const sections: ItemTooltipData['sections'] = [];
  const used = new Set<string>();

  for (const sec of item.tooltip_sections ?? []) {
    for (const attr of sec.section_attributes) {
      const keys = [...(attr.elevated_properties ?? []), ...(attr.important_properties ?? [])];
      const lines = keys
        .map((k) => {
          used.add(k);
          return propLine(item, k);
        })
        .filter((x): x is StatLine => !!x);
      if (sec.section_type === 'innate' && !attr.loc_string) {
        stats.push(...lines);
      } else if (attr.loc_string || lines.length) {
        sections.push({ type: sec.section_type, html: attr.loc_string ?? '', stats: lines });
      }
    }
  }

  // Innate properties that are flagged for the tooltip but not referenced explicitly
  for (const [k, p] of Object.entries(item.properties ?? {})) {
    if (used.has(k) || p.tooltip_section !== 'innate') continue;
    const line = propLine(item, k);
    if (line) stats.push(line);
  }

  if (!sections.length && item.description?.desc) {
    sections.push({ type: item.is_active_item ? 'active' : 'passive', html: item.description.desc, stats: [] });
  }
  return { stats, sections };
}
