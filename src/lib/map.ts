/* ------------------------------------------------------------------ *
 * Wiki → map. Pure helpers shared by the page (pages/Wiki.tsx) and the
 * SEO prerender.
 *
 * Positions, counts, health and souls come from the Deadlock API
 * (/assets/map, /assets/npc-units — extracted from the game files, so they
 * follow patches). Spawn / respawn times and the match timeline are not in
 * the API: they are written here by hand (checked against the community
 * wiki, 17.11.2026) — update them when a patch changes the map.
 *
 * Coordinates: 0–1 over the minimap image, Hidden King base at the bottom,
 * York on the left (that's how a Hidden King player sees the minimap).
 * ------------------------------------------------------------------ */
import type { MsgKey } from '../i18n/en';
import type { GameMap, GenericData, MapSpot, NpcUnit } from './types';

export type Pt = [number, number];

/** Layers of the interactive map, in the order of the toggle chips. `on` = shown by default. */
export const MAP_LAYERS = [
  { id: 'camps', on: true },
  { id: 'sinners', on: true },
  { id: 'shops', on: true },
  { id: 'urn', on: true },
  { id: 'rift', on: true },
  { id: 'bridge', on: true },
  { id: 'teleporters', on: true },
  { id: 'snacks', on: false },
  { id: 'statues', on: false },
  { id: 'pads', on: false },
  { id: 'ropes', on: false },
  { id: 'vents', on: false },
  { id: 'veils', on: false },
  { id: 'crates', on: false },
] as const;
export type LayerId = (typeof MAP_LAYERS)[number]['id'];

/** Which /assets/map entity lists feed each layer (camps come from neutral_camps). */
const LAYER_ENTITIES: Partial<Record<LayerId, string[]>> = {
  shops: ['shops'],
  urn: ['soul_urn_pads'],
  rift: ['unstable_rifts'],
  bridge: ['bridge_buffs'],
  teleporters: ['teleporters'],
  snacks: ['healing_snacks'],
  statues: ['golden_statues'],
  pads: ['bounce_pads'],
  ropes: ['climb_ropes'],
  vents: ['steam_vents'],
  veils: ['cosmic_veils'],
  crates: ['crates', 'tough_crates'],
};

/** Neutral camps by size: first spawn and respawn (after the whole camp is cleared) in seconds. */
export const CAMP_KINDS = [
  { kind: 'weak', tier: 'I', npc: 'neutral_trooper_weak', spawn: 120, respawn: 85 },
  { kind: 'medium', tier: 'II', npc: 'neutral_trooper_normal', spawn: 300, respawn: 290 },
  { kind: 'strong', tier: 'III', npc: 'neutral_trooper_strong', spawn: 480, respawn: 335 },
  { kind: 'vault', tier: '', npc: 'neutral_sinners_sacrifice', spawn: 480, respawn: 300 },
] as const;
export type CampKind = (typeof CAMP_KINDS)[number]['kind'];
export const campKind = (kind: string) => CAMP_KINDS.find((c) => c.kind === kind);

/** Structures in the order they have to fall. `count` = per team. */
export const OBJECTIVES = [
  { id: 'guardian', npc: 'npc_boss_tier1', count: 3 },
  { id: 'walker', npc: 'npc_boss_tier2', count: 3 },
  { id: 'baseGuardian', npc: 'npc_barrack_boss', count: 6 },
  { id: 'shrine', npc: '', count: 2 },
  { id: 'patron', npc: 'npc_boss_tier3', count: 1 },
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number]['id'];

/**
 * Lane cards, left → right from the Hidden King side. `spots` are building ids of /assets/generic-data
 * map_districts ("map_district_building_<id>"), which carry the game's localised names; `en` is the fallback.
 */
export const LANES = [
  { side: 'side', spots: [['stock_exchange', 'Stock Exchange'], ['docks', 'Docks'], ['factory', 'Factory']], near: ['hauntedLot', 'plaza'], text: 'wiki.lane.york' },
  { side: 'mid', spots: [['uptown', 'Uptown'], ['times_square', 'Times Square'], ['downtown', 'Downtown']], near: ['chinatown', 'hauntedLot', 'theater', 'plaza'], text: 'wiki.lane.broadway' },
  { side: 'side', spots: [['campus', 'Campus'], ['central_park', 'Central Park'], ['brownstones', 'Brownstones']], near: ['chinatown', 'theater'], text: 'wiki.lane.greenwich' },
] as const satisfies readonly { side: 'side' | 'mid'; spots: readonly (readonly [string, string])[]; near: readonly DistrictId[]; text: MsgKey }[];

/**
 * Districts between the lanes. `prefix` finds their camps in /assets/map (label position on the map),
 * `api` is the district id in generic-data map_districts (localised name), `name` the English fallback.
 */
export const DISTRICTS = [
  { id: 'chinatown', api: 'chinatown', name: 'Chinatown', prefix: 'chinatown_', team: 0, text: 'wiki.district.chinatown' },
  { id: 'hauntedLot', api: 'haunted_slums', name: 'Haunted Lot', prefix: 'slums_', team: 0, text: 'wiki.district.hauntedLot' },
  { id: 'theater', api: 'theater', name: 'Theater', prefix: 'theater_', team: 1, text: 'wiki.district.theater' },
  { id: 'plaza', api: 'fairfax', name: 'Plaza', prefix: 'plaza_', team: 1, text: 'wiki.district.plaza' },
] as const satisfies readonly { id: string; api: string; name: string; prefix: string; team: 0 | 1; text: MsgKey }[];
export type DistrictId = 'chinatown' | 'hauntedLot' | 'theater' | 'plaza';

type Places = GenericData['map_districts'];

/** Localised district name (falls back to English). */
export function districtName(id: DistrictId, places?: Places) {
  const d = DISTRICTS.find((x) => x.id === id)!;
  return places?.find((p) => p.district === `map_district_${d.api}` && !p.building)?.district_name || d.name;
}

/** Localised name of a place on a lane ("Фондова біржа"), falls back to English. */
export const placeName = (spot: readonly [string, string], places?: Places) =>
  places?.find((p) => p.building === `map_district_building_${spot[0]}`)?.building_name || spot[1];

/** What appears or changes during a match (seconds → dictionary key). `approx` = shown as "≈ 11:00". */
export const TIMELINE: { at: number; text: MsgKey; approx?: boolean }[] = [
  { at: 0, text: 'wiki.tl.0' },
  { at: 120, text: 'wiki.tl.120' },
  { at: 150, text: 'wiki.tl.150' },
  { at: 180, text: 'wiki.tl.180' },
  { at: 300, text: 'wiki.tl.300' },
  { at: 480, text: 'wiki.tl.480' },
  { at: 600, text: 'wiki.tl.600' },
  { at: 660, text: 'wiki.tl.660', approx: true },
  { at: 720, text: 'wiki.tl.720' },
  { at: 1080, text: 'wiki.tl.1080' },
  { at: 1200, text: 'wiki.tl.1200' },
  { at: 1800, text: 'wiki.tl.1800' },
  { at: 2100, text: 'wiki.tl.2100' },
];

/** "2:30", "11:00" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/* ------------------------------ geometry ----------------------------- */

const toRel = (map: GameMap, x: number, y: number): Pt => [(x + map.radius) / (2 * map.radius), (map.radius - y) / (2 * map.radius)];

/** Zipline polylines (0–1), sorted left → right: York, Broadway, Greenwich from the Hidden King side. */
export function ziplines(map: GameMap): Pt[][] {
  const paths = map.zipline_paths.map((z) => z.P0_points.map((p) => toRel(map, z.origin[0] + p[0], z.origin[1] + p[1])));
  const meanX = (p: Pt[]) => p.reduce((a, q) => a + q[0], 0) / (p.length || 1);
  return paths.sort((a, b) => meanX(a) - meanX(b));
}

/** Label position of each district: the middle of its camps. */
export function districtSpots(map: GameMap): { id: DistrictId; at: Pt }[] {
  return DISTRICTS.flatMap((d) => {
    const camps = map.neutral_camps.filter((c) => c.name.startsWith(d.prefix));
    if (!camps.length) return [];
    const x = camps.reduce((a, c) => a + c.left_relative, 0) / camps.length;
    const y = camps.reduce((a, c) => a + c.top_relative, 0) / camps.length;
    return [{ id: d.id, at: [x, y] as Pt }];
  });
}

export interface Marker {
  layer: LayerId;
  at: Pt;
  /** camp size, shop kind ("lane" | "base" | "secret"), crate kind… */
  kind?: string;
  team?: number | null;
  /** teleporter exit / jump pad landing */
  to?: Pt;
}

const spot = (s: MapSpot): Pt => [s.left_relative, s.top_relative];

/** Every marker of the map, tagged with its layer. */
export function mapMarkers(map: GameMap): Marker[] {
  const out: Marker[] = [];
  for (const c of map.neutral_camps) {
    if (!campKind(c.kind)) continue;
    out.push({ layer: c.kind === 'vault' ? 'sinners' : 'camps', at: spot(c), kind: c.kind });
  }
  for (const [layer, lists] of Object.entries(LAYER_ENTITIES) as [LayerId, string[]][]) {
    for (const list of lists) {
      for (const s of map.entities[list] ?? []) {
        out.push({ layer, at: spot(s), kind: s.kind, team: s.team, to: s.target ? toRel(map, s.target[0], s.target[1]) : undefined });
      }
    }
  }
  return out;
}

/** How many markers each layer has (chip counters, "36 on the map"). */
export function layerCounts(markers: Marker[]): Record<LayerId, number> {
  const n = Object.fromEntries(MAP_LAYERS.map((l) => [l.id, 0])) as Record<LayerId, number>;
  for (const m of markers) n[m.layer]++;
  return n;
}

export const campCount = (map: GameMap, kind: CampKind) => map.neutral_camps.filter((c) => c.kind === kind).length;

/* ------------------------------- numbers ----------------------------- */

/**
 * The first Mid-Boss's Rejuvenator (generic-data rejuv_params): buff minutes, extra trooper health and the cut in
 * respawn time, as ratios (0.7 = +70%, 0.5 = 50% shorter). Later kills are stronger (text says so).
 */
export function midbossVars(rejuv?: GenericData['rejuv_params']) {
  const hp = rejuv?.trooper_health_mult?.[0];
  const resp = rejuv?.player_respawn_mult?.[0];
  const dur = rejuv?.rejuvinator_buff_duration;
  if (hp === undefined || resp === undefined || !dur) return undefined;
  return { min: Math.round(dur / 60), hp: hp - 1, resp: 1 - resp };
}

const r0 = (n: number | undefined) => (n === undefined ? undefined : Math.round(n));

/** Numbers the wiki texts need, read from /assets/npc-units (undefined = not in the data). */
export function wikiNumbers(npcs: Map<string, NpcUnit>) {
  const walker = npcs.get('npc_boss_tier2');
  const patron = npcs.get('npc_boss_tier3');
  return {
    hp: (cls: string) => r0(npcs.get(cls)?.max_health),
    souls: (cls: string) => r0(npcs.get(cls)?.gold_reward),
    /** % of the base soul reward added every minute */
    soulGrowth: npcs.get('neutral_trooper_weak')?.gold_reward_bonus_percent_per_minute,
    walker: walker?.stomp_damage !== undefined ? { dmg: r0(walker.stomp_damage)!, pct: r0(walker.stomp_damage_max_health_percent) ?? 0, stun: walker.stun_duration ?? 0 } : undefined,
    patron: patron
      ? {
          hp2: r0(patron.phase2_health ?? patron.max_health),
          regen: r0(patron.objective_regen?.subclass?.out_of_combat_health_regen),
          delay: r0(patron.objective_regen?.subclass?.out_of_combat_regen_delay),
          growth: r0(patron.objective_health_growth_phase1?.subclass?.growth_per_minute),
          from: r0(patron.objective_health_growth_phase1?.subclass?.growth_start_time_in_minutes),
        }
      : undefined,
  };
}
