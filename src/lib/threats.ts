/* ------------------------------------------------------------------ *
 * Draft threats → counter items (pure — used by pages/draft/Plan.tsx).
 *
 * "I play X against these enemies: what do I buy, against whom, and why?"
 *   1. Every enemy brings THREATS, read from two sources:
 *      - its kit: ability properties from the assets API (StunDuration, ImmobilizeDuration, SilenceDuration,
 *        SleepDuration, heal properties, the ultimate's channel time) — so a patch that changes a kit changes the tags;
 *      - its usual items: how often players on that hero buy Knockdown, Silence Wave, lifesteal… (item-stats per
 *        hero, `bucket=hero`) and whether its build leans on spirit or on the gun.
 *   2. Each threat has ANSWER items (curated by class name — the property check below drops one that stops fitting).
 *   3. An answer's score = Σ strength of the threats it answers (× how well it fits your hero's build: Toxic Bullets
 *      for a gun hero, Decay for a spirit hero) + what match data says about that item on your hero against these
 *      exact enemies (`itemsVsLineup`).
 * Teammates: an ally whose kit shields / heals allies can cover you against the enemy ultimates; an ally who
 * usually buys the answer already (Healbane…) lowers that threat for you.
 * Lane mode: kit threats only (nobody has big items yet), answers and data limited to tiers 1–2.
 * ------------------------------------------------------------------ */
import type { ItemVsLineup } from './draft';
import type { Hero, Item, ItemProperty } from './types';

export type ThreatId = 'cc' | 'heal' | 'spirit' | 'bullet' | 'channel';
export const THREAT_IDS: ThreatId[] = ['cc', 'heal', 'spirit', 'bullet', 'channel'];

/** enemy items that bring the threat (class names) */
const THREAT_ITEMS: Partial<Record<ThreatId, string[]>> = {
  cc: [
    'upgrade_target_stun', // Knockdown — "the anvil"
    'upgrade_targeted_silence', // Silence Wave
    'upgrade_proc_silence', // Silencer
    'upgrade_glitch', // Cursed Relic
    'upgrade_aoe_root', // Vortex Web
    'upgrade_greater_withering_whip', // Disarming Hex
    'upgrade_crushing_fists',
    'upgrade_mystical_piano',
    'upgrade_ultimate_burst', // Lightning Scroll
  ],
  heal: [
    'upgrade_vampire', // Bullet Lifesteal
    'upgrade_health_stealing_magic', // Spirit Lifesteal
    'upgrade_damage_recycler', // Leech
    'upgrade_surging_power', // Vampiric Burst
    'upgrade_boxing_glove', // Lifestrike
    'upgrade_lifestrike_gauntlets', // Melee Lifesteal
    'upgrade_siphon_bullets',
    'upgrade_healing_booster',
    'upgrade_healbuff', // Healing Tempo
    'upgrade_health_nova',
    'upgrade_restorative_locket',
    'upgrade_resonant_healing', // Radiant Regeneration
    'upgrade_infuser',
    'upgrade_fury_trance',
    'upgrade_health_stimpak', // Healing Rite
    'upgrade_rescue_beam',
    'upgrade_celestial_guidance',
    'upgrade_patrons_blessing', // Mystic Conduit
  ],
};

/** answers, roughly cheapest first */
const ANSWERS: Record<ThreatId, string[]> = {
  cc: ['upgrade_debuff_reducer', 'upgrade_reduce_debuff_duration', 'upgrade_counterspell', 'upgrade_unstoppable', 'upgrade_auto_cleanse'],
  heal: ['upgrade_healbane', 'upgrade_toxic_bullets', 'upgrade_rupture', 'upgrade_inhibitor', 'upgrade_banshee_slugs', 'upgrade_spirit_burn'],
  spirit: ['upgrade_spirit_bubble', 'upgrade_magic_shield', 'upgrade_tech_purge', 'upgrade_absorbing_armor', 'upgrade_spellbreaker'],
  bullet: ['upgrade_regenerating_bullet_shield', 'upgrade_weapon_shielding', 'upgrade_return_fire', 'upgrade_improved_bullet_armor', 'upgrade_metal_skin', 'upgrade_juggernaut'],
  channel: ['upgrade_target_stun', 'upgrade_targeted_silence', 'upgrade_glitch'],
};

/** what an answer must still have after a patch (else it is dropped) — the classes that are not checked stay as listed */
const ANSWER_CHECK: Partial<Record<ThreatId, (it: Item) => boolean>> = {
  heal: (it) => prop(it, 'HealAmpReceivePenaltyPercent') < 0,
  spirit: (it) => prop(it, 'TechResist') > 0,
  bullet: (it) => prop(it, 'BulletResist') > 0 || prop(it, 'FireRateSlow') > 0,
};

/** ally items that save teammates */
const SAVE_ITEMS = ['upgrade_divine_barrier', 'upgrade_rescue_beam', 'upgrade_guardian_ward', 'upgrade_health_nova', 'upgrade_celestial_guidance'];

/* ------------------------------- helpers ------------------------------- */

export function prop(it: Item | undefined, key: string): number {
  const p: ItemProperty | undefined = it?.properties?.[key];
  const n = parseFloat(String(p?.value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/*
 * "For allies" and "airborne" can't be read from numbers, and descriptions come in the page's language — so these
 * two are lists of ability class names, taken on 24.11.2026 from the English descriptions ("ally/allies" + a barrier
 * or heal property; "fly / flight / airborne" for heroes that really spend time in the air). New hero → add here.
 */
const ALLY_BARRIER = new Set([
  'ability_bookworm_knightbarrier', // Paige — Plot Armor
  'ability_chessmaster_knightbuff', // Solomon — Kingside Knight
  'ability_ice_dome', // Kelvin — Frozen Shelter
]);
const ALLY_HEAL = new Set([
  'citadel_ability_mobile_resupply', // McGinnis — Medicinal Specter
  'citadel_ability_nikuman', // Dynamo — Rejuvenating Aurora
  'ability_ice_grenade', // Kelvin — Frost Grenade
  'citadel_ability_tangotether', // Ivy — Kudzu Connection
  'ability_bookworm_knightcharge', // Paige — Rallying Charge
  'ability_familiar_attach', // Rem — Tag Along
  'ability_familiar_helpinghands', // Rem — Lil Helpers
  'ability_nurse_healing_needles', // Nurse Harrow — Healing Needles
]);
const AIRBORNE = new Set([
  'citadel_ability_hornet_leap', // Vindicta — Flight
  'ability_power_jump', // Grey Talon — Rain of Arrows
  'citadel_ability_tengu_airlift', // Ivy — Air Drop
  'synth_barrage', // Pocket — Barrage
  'ability_deadpack_rocketeer', // Deadman Danny — Chimera Mk1
]);

const HEAL_PROPS = [
  'HealingFactor',
  'LifeDrainHealthMult',
  'HealAmount',
  'HealingPerSecond',
  'HeartHeal',
  'ExternalBonusHealthRegen',
  'HealFixedHealth',
  'HealPctVsHeroes',
  'DamageHealMult',
  'BulletLifestealPercent',
  'AbilityLifestealPercentHero',
  'TetherSharedHealPct',
  'HealthStealPctHero',
  'TotalHealthRegen',
  'InfestHeal',
  'HealPercentOfLeechDamage',
  'HealRegen',
  'MissingHealthPercentHeal',
  'RegenIncomingDamagePercent',
];

export type KitTag = 'stun' | 'root' | 'silence' | 'sleep' | 'lift' | 'heal' | 'allyBarrier' | 'allyHeal' | 'channelUlt' | 'air';

export interface KitAbility {
  ability: Item;
  ult: boolean;
  tags: KitTag[];
}

/** Tags of one ability, from its properties ("for allies" and "airborne" from the lists above). */
export function abilityTags(a: Item, ult: boolean): KitTag[] {
  const tags: KitTag[] = [];
  if (prop(a, 'StunDuration') > 0) tags.push('stun');
  if (prop(a, 'ImmobilizeDuration') > 0) tags.push('root');
  if (prop(a, 'SilenceDuration') > 0) tags.push('silence');
  if (prop(a, 'SleepDuration') > 0) tags.push('sleep');
  if (prop(a, 'LiftDuration') >= 1) tags.push('lift');
  const heals = HEAL_PROPS.some((k) => prop(a, k) > 0) || prop(a, 'BonusHealthRegen') >= 20 || prop(a, 'MaxHealthRegen') >= 10;
  if (heals) tags.push('heal');
  if (ALLY_HEAL.has(a.class_name)) tags.push('allyHeal');
  if (ALLY_BARRIER.has(a.class_name)) tags.push('allyBarrier');
  const channel = prop(a, 'AbilityChannelTime');
  if (ult && channel > 1.5 && channel < 60) tags.push('channelUlt');
  if (AIRBORNE.has(a.class_name)) tags.push('air');
  return tags;
}

export function heroKit(hero: Hero, byClass: Map<string, Item>): KitAbility[] {
  const out: KitAbility[] = [];
  for (const slot of ['signature1', 'signature2', 'signature3', 'signature4']) {
    const a = byClass.get(hero.items?.[slot] ?? '');
    if (!a) continue;
    const ult = slot === 'signature4' || a.ability_type === 'ultimate';
    out.push({ ability: a, ult, tags: abilityTags(a, ult) });
  }
  return out;
}

const CC_TAGS: KitTag[] = ['stun', 'root', 'silence', 'sleep', 'lift'];

/* ------------------------------- threats ------------------------------- */

export interface ThreatSource {
  hero: Hero;
  /** an ability of the hero, or an item players on it usually buy, or its damage profile */
  kind: 'ability' | 'item' | 'damage';
  ability?: Item;
  ult?: boolean;
  item?: Item;
  /** share of that hero's games with the item, or the share of spirit / weapon items in its builds */
  rate?: number;
  /** damage profile: which way the build leans */
  dmg?: 'spirit' | 'bullet';
  weight: number;
}

export interface Answer {
  item: Item;
  /** match data: this item on your hero vs these enemies (WR delta), when there are enough games */
  data?: ItemVsLineup;
}

export interface Threat {
  id: ThreatId;
  strength: number;
  sources: ThreatSource[];
  answers: Answer[];
  /** an ally usually buys an answer already */
  coveredBy?: { ally: Hero; item: Item; rate: number };
}

export interface PlanItem {
  item: Item;
  score: number;
  reasons: { threat: ThreatId; sources: ThreatSource[] }[];
  data?: ItemVsLineup;
  /** enemies it helps against (threat sources + data) */
  vs: Hero[];
}

export type TeamNote =
  | { kind: 'protect'; ally: Hero; ability: Item; tag: 'allyBarrier' | 'allyHeal'; against: { hero: Hero; ability: Item }[] }
  | { kind: 'saves'; ally: Hero; item: Item; rate: number }
  | { kind: 'covers'; ally: Hero; item: Item; rate: number; threat: ThreatId };

export interface PlanInput {
  me: Hero;
  enemies: Hero[];
  allies: Hero[];
  byClass: Map<string, Item>;
  byId: Map<number, Item>;
  /** heroId → itemId → share of that hero's games with the item */
  rates: Map<number, Map<number, number>>;
  /** itemsVsLineup() for your hero against these enemies */
  data: ItemVsLineup[];
  /** lane: kit threats only, items of tiers 1–2 */
  lane: boolean;
}

export interface Plan {
  threats: Threat[];
  items: PlanItem[];
  team: TeamNote[];
  /** your hero is airborne a lot — Knockdown stuns airborne targets longer */
  air: boolean;
}

/** share of spirit items among spirit + weapon purchases of a hero (0.5 when unknown) */
function spiritShare(rates: Map<number, number> | undefined, byId: Map<number, Item>): number {
  if (!rates) return 0.5;
  let s = 0;
  let w = 0;
  for (const [id, r] of rates) {
    const slot = byId.get(id)?.item_slot_type;
    if (slot === 'spirit') s += r;
    else if (slot === 'weapon') w += r;
  }
  return s + w > 0 ? s / (s + w) : 0.5;
}

const usable = (it: Item | undefined, lane: boolean): it is Item => !!it && !!it.shopable && !it.disabled && (!lane || (it.item_tier ?? 9) <= 2);

export function buildPlan(p: PlanInput): Plan {
  const { me, enemies, allies, byClass, byId, rates, lane } = p;
  const dataById = new Map(p.data.map((d) => [d.itemId, d]));
  const myKit = heroKit(me, byClass);
  const air = myKit.some((k) => k.tags.includes('air'));
  const mySpirit = spiritShare(rates.get(me.id), byId);

  const sources: Record<ThreatId, ThreatSource[]> = { cc: [], heal: [], spirit: [], bullet: [], channel: [] };
  for (const e of enemies) {
    for (const k of heroKit(e, byClass)) {
      if (k.tags.some((t) => CC_TAGS.includes(t))) sources.cc.push({ hero: e, kind: 'ability', ability: k.ability, ult: k.ult, weight: k.ult ? 0.8 : 0.5 });
      if (k.tags.includes('heal')) sources.heal.push({ hero: e, kind: 'ability', ability: k.ability, ult: k.ult, weight: k.ult ? 0.7 : 0.5 });
      if (k.tags.includes('channelUlt')) sources.channel.push({ hero: e, kind: 'ability', ability: k.ability, ult: true, weight: 0.6 });
    }
    const r = rates.get(e.id);
    if (!lane && r) {
      for (const id of ['cc', 'heal'] as const) {
        for (const cls of THREAT_ITEMS[id] ?? []) {
          const it = byClass.get(cls);
          const rate = it ? (r.get(it.id) ?? 0) : 0;
          if (!it || rate < 0.12) continue;
          // Knockdown stuns airborne heroes longer — it is the item to fear when you fly
          const w = rate * (air && cls === 'upgrade_target_stun' ? 2.5 : 1);
          sources[id].push({ hero: e, kind: 'item', item: it, rate, weight: w });
        }
      }
    }
    const share = spiritShare(r, byId);
    if (r && share >= 0.55) sources.spirit.push({ hero: e, kind: 'damage', dmg: 'spirit', rate: share, weight: (share - 0.4) * 1.6 });
    if (r && share <= 0.45) sources.bullet.push({ hero: e, kind: 'damage', dmg: 'bullet', rate: 1 - share, weight: (0.6 - share) * 1.6 });
  }

  // allies who usually buy the answer already
  const covered = new Map<ThreatId, { ally: Hero; item: Item; rate: number }>();
  const team: TeamNote[] = [];
  const enemyUlts = enemies.flatMap((e) => heroKit(e, byClass).filter((k) => k.ult).map((k) => ({ hero: e, ability: k.ability })));
  for (const a of allies) {
    for (const k of heroKit(a, byClass)) {
      const tag = k.tags.includes('allyBarrier') ? 'allyBarrier' : k.tags.includes('allyHeal') ? 'allyHeal' : null;
      if (tag) team.push({ kind: 'protect', ally: a, ability: k.ability, tag, against: enemyUlts });
    }
    const r = rates.get(a.id);
    if (!r) continue;
    for (const cls of SAVE_ITEMS) {
      const it = byClass.get(cls);
      const rate = it ? (r.get(it.id) ?? 0) : 0;
      if (it && rate >= 0.2) team.push({ kind: 'saves', ally: a, item: it, rate });
    }
    for (const id of ['heal', 'channel'] as const) {
      for (const cls of ANSWERS[id]) {
        const it = byClass.get(cls);
        const rate = it ? (r.get(it.id) ?? 0) : 0;
        if (it && rate >= 0.3 && rate > (covered.get(id)?.rate ?? 0)) covered.set(id, { ally: a, item: it, rate });
      }
    }
  }
  for (const [threat, c] of covered) team.push({ kind: 'covers', ally: c.ally, item: c.item, rate: c.rate, threat });

  const threats: Threat[] = [];
  for (const id of THREAT_IDS) {
    const src = sources[id].sort((a, b) => b.weight - a.weight);
    if (!src.length) continue;
    // per enemy at most 1.5 — one hero with three stuns is still one hero
    const perHero = new Map<number, number>();
    for (const s of src) perHero.set(s.hero.id, Math.min(1.5, (perHero.get(s.hero.id) ?? 0) + s.weight));
    let strength = [...perHero.values()].reduce((a, b) => a + b, 0);
    const cover = covered.get(id);
    if (cover) strength *= 0.6;
    const check = ANSWER_CHECK[id];
    const answers = ANSWERS[id]
      .map((cls) => byClass.get(cls))
      .filter((it): it is Item => usable(it, lane) && (!check || check(it)))
      .map((item) => ({ item, data: dataById.get(item.id) }));
    if (!answers.length) continue;
    threats.push({ id, strength, sources: src, answers, coveredBy: cover });
  }
  threats.sort((a, b) => b.strength - a.strength);

  // your build decides between the gun and the spirit version of an answer (Toxic Bullets vs Decay)
  const fit = (it: Item) => (it.item_slot_type === 'weapon' ? 0.4 + (1 - mySpirit) : it.item_slot_type === 'spirit' ? 0.4 + mySpirit : 1);
  const dataBonus = (d?: ItemVsLineup) => (d ? Math.max(-0.6, Math.min(0.9, d.score * 40)) : 0);
  const plan = new Map<number, PlanItem>();
  for (const th of threats) {
    // one threat must not fill the whole list with five versions of the same answer: its best answer FOR YOU
    // (build fit + match data; the first ones of a list are the cheap / universal ones) takes the full weight,
    // the next ones less — they stay visible in the threat card. √ keeps six lifesteal buyers from drowning the rest.
    const ranked = th.answers
      .map((a, i) => ({ a, v: fit(a.item) * (1 - i * 0.04) + dataBonus(a.data) * 0.5 }))
      .sort((x, y) => y.v - x.v);
    ranked.forEach(({ a }, rank) => {
      const entry = plan.get(a.item.id) ?? { item: a.item, score: 0, reasons: [], data: a.data, vs: [] };
      entry.score += Math.sqrt(th.strength) * fit(a.item) * ([1, 0.4, 0.2][rank] ?? 0.1);
      entry.reasons.push({ threat: th.id, sources: th.sources });
      plan.set(a.item.id, entry);
    });
  }
  // items the match data likes against this lineup, even without a listed threat
  for (const d of p.data) {
    const it = byId.get(d.itemId);
    if (!usable(it, lane) || d.score <= 0.004 || plan.has(d.itemId)) continue;
    plan.set(d.itemId, { item: it, score: 0, reasons: [], data: d, vs: [] });
  }
  const enemyById = new Map(enemies.map((e) => [e.id, e]));
  const items = [...plan.values()]
    .map((x) => {
      const vs = new Map<number, Hero>();
      for (const r of x.reasons) for (const s of r.sources) vs.set(s.hero.id, s.hero);
      for (const b of x.data?.bestVs ?? []) {
        const e = enemyById.get(b.enemyId);
        if (e) vs.set(e.id, e);
      }
      return { ...x, score: x.score + dataBonus(x.data), vs: [...vs.values()] };
    })
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score);

  return { threats, items, team, air };
}

/** The strongest sources, at most `perHero` per enemy (six lifesteal items of one hero say less than six heroes). */
export function topSources(sources: ThreatSource[], limit: number, perHero = 1): ThreatSource[] {
  const seen = new Map<number, number>();
  const out: ThreatSource[] = [];
  for (const s of [...sources].sort((a, b) => b.weight - a.weight)) {
    const n = seen.get(s.hero.id) ?? 0;
    if (n >= perHero) continue;
    seen.set(s.hero.id, n + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** heroId → itemId → share of the hero's games with the item, from item-stats `bucket=hero`. */
export function itemRates(rows: { bucket: number; item_id: number; matches: number }[], heroGames: Map<number, number>) {
  const out = new Map<number, Map<number, number>>();
  for (const r of rows) {
    const games = heroGames.get(r.bucket);
    if (!games) continue;
    let m = out.get(r.bucket);
    if (!m) out.set(r.bucket, (m = new Map()));
    m.set(r.item_id, Math.min(1, r.matches / games));
  }
  return out;
}
