/* ------------------------------------------------------------------ *
 * Hero positions — Dota-style role ratings, 0–10 (10 = strongest at it).
 *
 *   carry      scales into the late game, wins fights with damage      (≈ Dota pos 1)
 *   playmaker  starts fights, high-impact aggression / initiation
 *   pick       catches and isolates lone targets (pick-offs, lockdown)
 *   support    heals, shields, buffs and enables allies               (≈ Dota pos 5)
 *
 * Source:
 *   - 'board'    → community "Deadlock Role Board" the site owner provided (38 heroes,
 *                  transcribed 1:1 and double-checked against the screenshot)
 *   - 'owner'    → numbers the site owner corrected by hand (always wins; marked `o(…)` + comment)
 *   - 'analysis' → heroes missing from that board, rated by us from their kit
 *                  (ability descriptions) + match stats (kills, assists, hero damage,
 *                  souls vs the hero average). Reasons are in the comments.
 *
 * Keyed by the English slug (Hero.slug) so ids/localisation never break the mapping.
 * To tweak a rating just edit the numbers — everything else is derived (lib/roles.ts).
 * ------------------------------------------------------------------ */
export const ROLE_KEYS = ['carry', 'playmaker', 'pick', 'support'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export type RoleScores = Record<RoleKey, number>;

interface Entry extends RoleScores {
  source: 'board' | 'analysis' | 'owner';
}

const b = (support: number, pick: number, playmaker: number, carry: number): Entry => ({ support, pick, playmaker, carry, source: 'board' });
const a = (support: number, pick: number, playmaker: number, carry: number): Entry => ({ support, pick, playmaker, carry, source: 'analysis' });
/** corrected by the site owner (overrides the board / our analysis) */
const o = (support: number, pick: number, playmaker: number, carry: number): Entry => ({ support, pick, playmaker, carry, source: 'owner' });

//                        support pick playmaker carry
export const HERO_ROLES: Record<string, Entry> = {
  abrams: b(2, 4, 8, 3),
  apollo: o(1, 1, 9, 2), // owner: carry 2
  bebop: b(2, 7, 8, 8),
  billy: b(1, 4, 6, 3),
  calico: b(0, 2, 9, 3),
  celeste: b(0, 0, 7, 9),
  drifter: o(0, 1, 8, 6), // owner: carry 6, playmaker 8
  'the-doorman': b(5, 9, 3, 1),
  dynamo: o(7, 4, 6, 1), // owner: support 7
  graves: o(7, 1, 5, 4), // owner: support 7, playmaker 5, carry 4
  'grey-talon': b(1, 1, 8, 4),
  haze: b(0, 6, 3, 9),
  holliday: b(1, 9, 9, 4),
  infernus: b(1, 1, 4, 8),
  ivy: o(7, 5, 5, 4), // owner: support 7, carry 4 (was 5/5/5/5)
  kelvin: b(10, 3, 4, 1),
  'lady-geist': b(1, 0, 5, 10),
  lash: b(1, 4, 10, 4),
  mcginnis: o(6, 3, 3, 3), // owner: carry 3, support 6
  mina: b(0, 1, 6, 3),
  mirage: b(2, 2, 6, 8),
  'mo-and-krill': b(1, 10, 9, 0),
  paige: o(10, 6, 3, 4), // owner: carry 4
  paradox: b(1, 10, 7, 4),
  pocket: b(0, 0, 10, 3),
  rem: o(10, 7, 6, 4), // owner: carry 4
  seven: b(2, 1, 4, 9),
  shiv: b(0, 0, 10, 2),
  silver: b(0, 2, 4, 3),
  sinclair: b(8, 4, 6, 3),
  venator: b(2, 1, 7, 10),
  victor: o(1, 0, 4, 8), // owner: playmaker 4
  vindicta: b(3, 3, 9, 7),
  viscous: o(7, 2, 6, 4), // owner: support 7, carry 4
  vyper: b(2, 2, 10, 7),
  warden: o(3, 1, 6, 6), // owner: playmaker 6
  wraith: b(1, 8, 5, 10),
  yamato: b(1, 0, 10, 3),

  // Ultimate grabs a target and flies off with it (textbook pick); flying + missiles + fuel
  // backblast give dive playmaking. Kills ×1.30 and hero damage ×1.27 vs average → real carry damage.
  'deadman-danny': o(1, 8, 7, 5), // owner: carry 5
  // Slows, bullet-resist shred and a deflecting barrier on a brawler; ultimate banner gives the
  // team move speed, slow immunity and damage reduction → frontline playmaker with support value.
  // Objective damage ×1.44, last hits ×1.23 → pushes and farms, low kills (×0.78).
  'rat-king': a(6, 2, 7, 4),
  // Knight promotes an ally (barrier + stamina), Bishop slows, Rook immobilises → strategist
  // support with lockdown. Low kills (×0.70) and objective damage → not a carry.
  solomon: a(7, 6, 5, 2),
  // Brush trail speeds allies and slows enemies; Still Life stuns a chosen hero (pick); Abstract
  // Landscape blinds, silences and buffs allies' Spirit → teamfight playmaker. Stats are average.
  violet: a(5, 6, 8, 4),
  // Healing Needles heal allies with her gun, Wretched Vapors buff an ally; Lurking Terrors fears
  // enemies. Assists ×1.24 with kills ×0.45 and hero damage ×0.61 → dedicated support.
  'nurse-harrow': a(10, 3, 5, 0),
  // Feed The Birds hexes everyone in front into pigeons (huge fight swing); Brew silences/burns/
  // shields; Threadsap steals Spirit. Kills ×1.06, assists ×1.11 → playmaker with pick and some carry.
  baba: a(4, 6, 8, 5),
};
