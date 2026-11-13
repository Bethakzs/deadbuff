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
