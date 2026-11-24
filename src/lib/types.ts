/* ------------------------------------------------------------------ *
 * Types for the parts of the Deadlock API (https://api.deadlock-api.com)
 * that the site actually uses. Fields we don't read are omitted.
 * ------------------------------------------------------------------ */

export type HeroType = 'marksman' | 'mystic' | 'brawler' | 'assassin' | '' | null;

export interface HeroImages {
  icon_hero_card?: string;
  icon_hero_card_webp?: string;
  icon_image_small?: string;
  icon_image_small_webp?: string;
  minimap_image_webp?: string;
  hero_card_critical_webp?: string;
  hero_card_gloat_webp?: string;
  top_bar_vertical_image_webp?: string;
  background_image?: string;
  background_image_webp?: string;
  name_image?: string;
}

export interface StatValue {
  value: number;
  display_stat_name?: string;
}

export interface Hero {
  id: number;
  class_name: string;
  /** localised display name (API `language` param) */
  name: string;
  /** client-side: English name, kept for search */
  name_en: string;
  /** client-side: URL slug, always derived from the English name so links don't change with language */
  slug: string;
  description: { lore?: string; role?: string; playstyle?: string };
  player_selectable: boolean;
  disabled: boolean;
  in_development: boolean;
  tags?: string[];
  hero_type?: HeroType;
  complexity?: number;
  images: HeroImages;
  /** slot -> item class_name. signature1..4 are the 4 abilities, weapon_primary is the gun. */
  items: Record<string, string>;
  starting_stats: Record<string, StatValue>;
  colors?: { ui?: [number, number, number]; style?: [number, number, number]; style_hex?: string };
}

export interface ItemProperty {
  value?: string | number;
  label?: string;
  postfix?: string;
  prefix?: string;
  icon?: string;
  css_class?: string;
  tooltip_section?: string;
  tooltip_is_elevated?: boolean;
  tooltip_is_important?: boolean;
  disable_value?: string;
  conditional?: string;
}

export interface PropertyUpgrade {
  name: string;
  bonus: string | number;
}

export interface ItemDescription {
  desc?: string;
  quip?: string;
  t1_desc?: string;
  t2_desc?: string;
  t3_desc?: string;
  active?: string;
  passive?: string;
}

export interface TooltipSectionAttr {
  loc_string?: string;
  properties?: string[];
  elevated_properties?: string[];
  important_properties?: string[];
}

export interface Item {
  id: number;
  class_name: string;
  name: string;
  type: 'ability' | 'weapon' | 'upgrade' | 'tech';
  ability_type?: 'signature' | 'ultimate' | 'innate' | 'melee' | 'item' | 'held' | 'cosmetic';
  image?: string;
  image_webp?: string;
  shop_image?: string;
  shop_image_webp?: string;
  hero?: number;
  heroes?: number[];
  properties?: Record<string, ItemProperty>;
  description?: ItemDescription;
  tooltip_details?: string | AbilityTooltipDetails;
  upgrades?: { property_upgrades: PropertyUpgrade[] }[];
  weapon_info?: Record<string, unknown>;
  // upgrades (shop items)
  item_slot_type?: 'weapon' | 'vitality' | 'spirit';
  item_tier?: 1 | 2 | 3 | 4 | 5;
  cost?: number;
  shopable?: boolean;
  disabled?: boolean;
  is_active_item?: boolean;
  activation?: string;
  component_items?: string[];
  tooltip_sections?: { section_type: string; section_attributes: TooltipSectionAttr[] }[];
}

export interface AbilityTooltipDetails {
  info_sections?: {
    loc_string?: string;
    properties_block?: { loc_string?: string; properties?: { important_property?: string }[] }[];
    basic_properties?: string[];
  }[];
}

export interface Rank {
  tier: number;
  name: string;
  color: string;
  images: Record<string, string>;
}

export interface Patch {
  title: string;
  pub_date: string;
  link: string;
  category?: { text?: string };
}

/* ---------------------------- analytics ---------------------------- */

export interface HeroStat {
  hero_id: number;
  wins: number;
  losses: number;
  matches: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_net_worth: number;
  total_last_hits: number;
  total_denies: number;
  total_player_damage: number;
  total_player_damage_taken: number;
  total_boss_damage: number;
  total_shots_hit: number;
  total_shots_missed: number;
}

export interface ItemStat {
  item_id: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
  avg_buy_time_s?: number;
  avg_sell_time_s?: number;
  sold?: number;
}

export interface CounterStat {
  hero_id: number;
  enemy_hero_id: number;
  wins: number;
  matches_played: number;
  kills: number;
  deaths: number;
  assists: number;
  enemy_kills: number;
  enemy_deaths: number;
}

export interface SynergyStat {
  hero_id1: number;
  hero_id2: number;
  wins: number;
  matches_played: number;
}

export interface AbilityOrderStat {
  abilities: number[];
  wins: number;
  losses: number;
  matches: number;
  players: number;
}

export interface HeroBuildStat {
  hero_id: number;
  hero_build_id: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
}

export interface BuildMod {
  ability_id: number;
  annotation?: string | null;
}

export interface BuildCategory {
  name: string;
  description?: string | null;
  mods: BuildMod[];
  optional?: boolean | null;
}

export interface HeroBuild {
  hero_build: {
    hero_id: number;
    hero_build_id: number;
    author_account_id: number;
    last_updated_timestamp: number;
    publish_timestamp?: number | null;
    name: string;
    description?: string | null;
    language: number;
    version: number;
    /** up to 3 icons the author pinned: build-tag ids, item ids or ability ids (0 = empty slot) */
    tags?: number[] | null;
    details: {
      mod_categories: BuildCategory[];
      ability_order?: {
        currency_changes: { ability_id: number; currency_type: number; delta: number; annotation?: string | null }[];
      };
    };
  };
  num_favorites?: number | null;
  num_weekly_favorites?: number | null;
  num_ignores?: number | null;
  num_reports?: number | null;
}

/** /assets/build-tags — the icons a build author can pin to a build (besides item/ability icons). */
export interface BuildTag {
  id: number;
  class_name: string;
  label: string;
  icon: string;
}

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
}

/** /assets/generic-data → lane_info[index]; the index is the `assigned_lane` value. */
export interface LaneInfo {
  lane_name: string;
  css_class?: string | null;
  is_enemy_lane: boolean;
  color?: Rgba | null;
  minimap_color?: Rgba | null;
}

/** /analytics/lane-matchup-stats row: one duo (hero_ids) in one lane, vs whoever they laned against. */
export interface LaneMatchupRow {
  assigned_lane: number;
  hero_ids: number[];
  enemy_hero_ids: number[];
  wins: number;
  matches_played: number;
  sample_time_s: number;
  /** duo's combined soul lead over the enemy duo at sample_time_s (900s = 15 min) */
  net_worth_diff: number;
  sample_matches: number;
}

/* ------------------------------ players ----------------------------- */

/** /players/steam-search row (we only read public profile fields). */
export interface SteamSearchResult {
  account_id: number;
  personaname: string;
  profileurl?: string;
  avatar?: string;
  avatarmedium?: string;
  matches_played_last_30d?: number | null;
  last_team_avg_badge?: number | null;
}

/** /players/{account_id}/match-history row. Win = `match_result === player_team`. */
export interface PlayerMatch {
  account_id: number;
  match_id: number;
  hero_id: number;
  hero_level: number;
  start_time: number;
  game_mode: number;
  match_mode: number;
  player_team: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
  denies: number;
  net_worth: number;
  last_hits: number;
  match_duration_s: number;
  match_result: number;
}

/** /players/hero-stats row (one per hero the player has played). */
export interface PlayerHeroStat {
  account_id: number;
  hero_id: number;
  matches_played: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  last_played: number;
  time_played: number;
  networth_per_min?: number;
  damage_per_min?: number;
  damage_taken_per_min?: number;
  last_hits_per_min?: number;
  obj_damage_per_min?: number;
  /** 0–1 */
  accuracy?: number;
  ending_level?: number;
}

/** /players/{account_id}/rank — badge = tier*10 + subrank. */
export interface PlayerRank {
  badge: number;
  rank: number;
  subrank: number;
}

/** /players/rank?account_ids= — the same rank for several accounts at once. */
export interface PlayerRankRow extends PlayerRank {
  account_id: number;
  /** null when no recent ranked match of theirs reports a rank */
  last_match: { start_time: number } | null;
}

/** /players/{account_id}/mate-stats row. */
export interface MateStat {
  mate_id: number;
  wins: number;
  matches_played: number;
}

export interface SteamProfile {
  account_id: number;
  personaname: string;
  avatar?: string;
  avatarmedium?: string;
  avatarfull?: string;
  profileurl?: string;
}

/* ------------------------- item stats buckets ------------------------ */

/** item-stats with `bucket=hero` (bucket = hero id) or `bucket=game_time_min` (bucket = buy minute). */
export interface ItemBucketStat extends ItemStat {
  bucket: number;
}

/* ------------------------------ matches ------------------------------ */
/* /matches/{id}/metadata — only the fields we render (the payload is ~1 MB). */

export interface MatchItemEvent {
  game_time_s: number;
  item_id: number;
  /** 0 for a purchase; non-zero rows are ability unlocks/upgrades or swaps */
  upgrade_id: number;
  sold_time_s: number;
  flags: number;
}

export interface MatchStatSnapshot {
  time_stamp_s: number;
  net_worth: number;
  level?: number;
  player_damage?: number;
  player_damage_taken?: number;
  player_healing?: number;
  self_healing?: number;
  boss_damage?: number;
  creep_damage?: number;
  neutral_damage?: number;
  creep_kills?: number;
  neutral_kills?: number;
  denies?: number;
  shots_hit?: number;
  shots_missed?: number;
  max_health?: number;
}

export interface MatchPlayer {
  account_id: number;
  player_slot: number;
  team: number;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  last_hits: number;
  denies: number;
  level: number;
  assigned_lane?: number;
  abandon_match_time_s?: number;
  items: MatchItemEvent[];
  stats: MatchStatSnapshot[];
  /** one entry per death of THIS player, naming the killer's slot */
  death_details?: { game_time_s: number; killer_player_slot?: number }[];
}

export interface MatchInfo {
  match_id: number;
  start_time: number;
  duration_s: number;
  winning_team: number;
  game_mode: number;
  match_mode: number;
  average_badge_team0?: number;
  average_badge_team1?: number;
  players: MatchPlayer[];
  objectives?: { team: number; team_objective_id: number; destroyed_time_s: number }[];
  mid_boss?: { team_killed: number; team_claimed: number; destroyed_time_s: number }[];
}

export interface MatchMetadata {
  match_info: MatchInfo;
  hero_build_ids?: Record<string, number>;
}

/* ---------------------------- leaderboard ---------------------------- */

export type Region = 'Europe' | 'NAmerica' | 'SAmerica' | 'Asia' | 'Oceania';

export interface LeaderboardEntry {
  account_name: string;
  /** Valve only publishes the name: when several accounts share it, every candidate is listed */
  possible_account_ids: number[];
  rank: number;
  top_hero_ids: number[];
  badge_level?: number;
}

/* ------------------------------ pro players ----------------------------- */

/**
 * A "pro": a top-of-the-leaderboard player whose account could be told apart (see lib/pros.ts). The game has
 * no official pro / esports list, so the top of Valve's ranked leaderboard in each region stands in for it.
 */
export interface ProPlayer {
  /** account_id (SteamID3) */
  id: number;
  /** leaderboard name */
  name: string;
  region: Region;
  /** place on the region's leaderboard */
  rank: number;
  heroes: number[];
}

/** One player of a /matches/metadata row (only the pros of the match: `only_filtered_players`). */
export interface ProMatchPlayer {
  account_id: number;
  hero_id: number;
  team: 'Team0' | 'Team1';
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  /** every purchase in order (abilities too), `items_sold_time_s` alongside (0 = kept) */
  items_item_id?: number[];
  items_sold_time_s?: number[];
}

/** A row of GET /matches/metadata with match info + the pros' player columns. */
export interface ProMatch {
  match_id: number;
  /** "2026-11-24 22:14:48" UTC */
  start_time: string;
  winning_team: 'Team0' | 'Team1';
  duration_s: number;
  /** "Ranked" | "Unranked" | "PrivateLobby" | … */
  match_mode: string;
  average_badge: number | null;
  players: ProMatchPlayer[];
}

/** GET /matches/active row: a match being played now (the in-game Watch tab, top 200). */
export interface ActiveMatch {
  match_id: number;
  /** unix seconds */
  start_time: number;
  /** game time so far, seconds */
  duration_s?: number | null;
  players: { account_id: number; team: number; hero_id: number; abandoned?: boolean | null }[];
  net_worth_team_0?: number | null;
  net_worth_team_1?: number | null;
  spectators?: number | null;
  /** "Ranked", "Unranked", "PrivateLobby"… */
  match_mode_parsed?: string | null;
  /** "Europe", "NAmerica"… */
  region_mode_parsed?: string | null;
}

/* -------------------------------- map -------------------------------- */

/**
 * One spot on the minimap. `left_relative` / `top_relative` are 0–1 over the minimap image
 * (Hidden King base at the bottom); `position` is the world position (x, y, z).
 */
export interface MapSpot {
  left_relative: number;
  top_relative: number;
  position?: number[];
  kind?: string;
  /** shops: 0 = Hidden King, 1 = Archmother, null = both */
  team?: number | null;
  /** teleporters / jump pads: where they send you (world x, y, z) */
  target?: number[];
}

export interface MapCamp extends MapSpot {
  /** "chinatown_bell_1", "slums_garage_down_camp"… — the prefix names the district */
  name: string;
  /** weak · medium · strong (neutral tiers I–III) · vault (Sinner's Sacrifice) */
  kind: string;
}

/** A lane zipline: P0_points are offsets from `origin` in world units */
export interface MapZipline {
  origin: number[];
  color: string;
  P0_points: number[][];
}

/** /assets/map — minimap images, ziplines, neutral camps and everything else placed on the map */
export interface GameMap {
  /** world half-size: x, y run from −radius to +radius */
  radius: number;
  images: { minimap: string; mid_tunnels?: string };
  neutral_camps: MapCamp[];
  zipline_paths: MapZipline[];
  entities: Partial<Record<string, MapSpot[]>>;
}

/** /assets/npc-units — only the fields the wiki reads (names come localised with `language`) */
export interface NpcUnit {
  class_name: string;
  name?: string;
  max_health?: number;
  phase2_health?: number;
  /** souls for the kill (neutrals, Sinner's Sacrifice) */
  gold_reward?: number;
  gold_reward_bonus_percent_per_minute?: number;
  stomp_damage?: number;
  stomp_damage_max_health_percent?: number;
  stun_duration?: number;
  objective_regen?: { subclass?: { out_of_combat_health_regen?: number; out_of_combat_regen_delay?: number } };
  objective_health_growth_phase1?: { subclass?: { growth_per_minute?: number; growth_start_time_in_minutes?: number } };
}

/** /assets/generic-data — the parts the app reads (lanes everywhere; the rest on the wiki) */
export interface GenericData {
  lane_info: LaneInfo[];
  /** localised place names: district (+ building) ids → names, e.g. York / Stock Exchange */
  map_districts?: { district: string; district_name?: string; building?: string | null; building_name?: string | null }[];
  /** item price by tier, index = tier (0 unused) */
  item_price_per_tier?: number[];
  /** share of a trooper's souls EACH hero gets, index = heroes nearby − 1 */
  trooper_kill_gold_share_frac?: number[];
  /** average share of a hero kill's souls per hero, index = heroes involved − 1 */
  hero_kill_gold_share_frac?: number[];
  objective_params?: {
    near_player_split_pct?: number;
    tier1_gold_kill?: number;
    tier2_gold_kill?: number;
    base_guardians_gold_kill?: number;
    shrines_gold_kill?: number;
  };
  rejuv_params?: { rejuvinator_buff_duration?: number; trooper_health_mult?: number[]; player_respawn_mult?: number[] };
}

/** /analytics/badge-distribution row: players by the rank of their latest ranked match in the range */
export interface BadgeRow {
  badge_level: number;
  total_matches: number;
  unique_players: number;
}
