/* ------------------------------------------------------------------ *
 * Wiki articles (/wiki, /wiki/:slug) — declared once, rendered twice:
 * by React (pages/wiki) and as static HTML by scripts/prerender.ts.
 *
 * Every text is a dictionary key (src/i18n/wiki/*.ts) or a function of
 * the context, so numbers can come from the Deadlock API (generic-data,
 * npc-units, items) and follow patches. Numbers the API doesn't have are
 * written here by hand — checked against deadlock.wiki on 17.11.2026
 * (Souls / Trooper / Death pages updated Sep–Oct 2026). Update them when
 * a patch changes the mechanic.
 *
 * The map article ("map", /wiki) is a hand-built React page
 * (pages/wiki/MapArticle.tsx); only its section list lives here.
 * ------------------------------------------------------------------ */
import type { MsgKey } from '../i18n/en';
import type { GameMap, GenericData, Item, NpcUnit } from './types';

export interface WikiData {
  generic?: GenericData;
  npcs: Map<string, NpcUnit>;
  map?: GameMap;
  /** shop items (tier ≤ 4) in the UI language */
  shop: Item[];
}

export interface WikiFmt {
  int: (n: number) => string;
  /** 0.54 → "54%" */
  pct: (ratio: number) => string;
  /** 1.08 → "1.08", 2 → "2" */
  flex: (n: number) => string;
}

export interface WikiCtx {
  t: (key: MsgKey, vars?: Record<string, string | number>) => string;
  d: WikiData;
  f: WikiFmt;
}

export type Text = MsgKey | ((c: WikiCtx) => string);
export type Tone = 'weapon' | 'vitality' | 'spirit' | 'brass' | 'blood' | 'steel';

export type Block =
  | { k: 'p'; text: Text }
  | { k: 'cards'; items: { title: Text; tag?: Text; text: Text; tone?: Tone }[] }
  | { k: 'table'; head: MsgKey[]; rows: (c: WikiCtx) => string[][]; num?: number[]; marks?: boolean }
  | { k: 'terms'; items: { term: MsgKey; text: MsgKey }[] }
  | { k: 'levels' }
  | { k: 'tiers' }
  | { k: 'ranks' }
  | { k: 'link'; to: string; text: MsgKey };

export interface WikiSection {
  id: string;
  title: MsgKey;
  sub?: Text;
  blocks: Block[];
}

export type ArticleId = 'map' | 'souls' | 'shop' | 'combat' | 'ranks' | 'glossary';

export interface WikiArticle {
  id: ArticleId;
  /** "" = /wiki itself */
  slug: string;
  tab: MsgKey;
  title: MsgKey;
  lead: MsgKey;
  meta: MsgKey;
  metaDesc: MsgKey;
  sections: WikiSection[];
}

export const resolveText = (c: WikiCtx, x: Text) => (typeof x === 'function' ? x(c) : c.t(x));

/* ------------------------------- data ------------------------------- */

/** Total souls needed for each level 0–35 (Boon page, 17.11.2026). Levels 0, 2, 4, 7 unlock an ability, the rest give 1 AP. */
export const LEVEL_SOULS = [
  600, 800, 1100, 1500, 2000, 2600, 3200, 3800, 4500, 5200, 5900, 6600, 7400, 8200, 9000, 9800, 10700, 11600, 12500, 13400,
  14400, 15500, 16700, 18000, 19500, 21200, 23100, 25200, 27500, 30000, 32700, 35600, 38700, 42000, 45500, 49200,
];
export const UNLOCK_LEVELS = new Set([0, 2, 4, 7]);

/** Respawn time by game time (Death page, Sep 2026): linear between the points, capped at 90 s. */
export const RESPAWN = [
  [5, 8],
  [20, 38],
  [30, 70],
  [40, 85],
] as const;
export const RESPAWN_MAX = 90;

const g = (c: WikiCtx) => c.d.generic;
const souls = (c: WikiCtx, cls: string) => {
  const n = c.d.npcs.get(cls)?.gold_reward;
  return n !== undefined ? c.f.int(n) : '—';
};
const perMin = (c: WikiCtx, base: number, per: number) => c.t('wiki.souls.perMin', { base: c.f.int(base), per: c.f.int(per) });

/* ----------------------------- articles ----------------------------- */

const SOULS: WikiArticle = {
  id: 'souls',
  slug: 'souls',
  tab: 'wiki.tab.souls',
  title: 'wiki.souls.title',
  lead: 'wiki.souls.lead',
  meta: 'meta.wiki.souls',
  metaDesc: 'meta.desc.wiki.souls',
  sections: [
    {
      id: 'souls-sources',
      title: 'wiki.souls.sources',
      sub: 'wiki.souls.sourcesSub',
      blocks: [
        {
          k: 'table',
          head: ['wiki.souls.colSource', 'wiki.souls.colSouls', 'wiki.souls.colHow'],
          num: [1],
          rows: (c) => {
            const o = g(c)?.objective_params;
            const obj = [o?.tier1_gold_kill, o?.tier2_gold_kill, o?.base_guardians_gold_kill, o?.shrines_gold_kill];
            return [
              [c.t('wiki.souls.src.start'), c.f.int(LEVEL_SOULS[0]), c.t('wiki.souls.src.start.d')],
              [c.t('wiki.souls.src.trooper'), perMin(c, 100, 2), c.t('wiki.souls.src.trooper.d')],
              [c.t('wiki.souls.src.hero'), c.t('wiki.souls.upTo', { v: perMin(c, 200, 50), max: c.f.int(2200) }), c.t('wiki.souls.src.hero.d', { fb: 125 })],
              [c.t('wiki.layer.camps'), ['neutral_trooper_weak', 'neutral_trooper_normal', 'neutral_trooper_strong'].map((x) => souls(c, x)).join(' · '), c.t('wiki.souls.src.camps.d')],
              [c.t('wiki.layer.crates'), `${c.f.int(23)} · ${c.f.int(46)}`, c.t('wiki.souls.src.crates.d')],
              [c.t('wiki.ev.midboss'), perMin(c, 1500, 25), c.t('wiki.souls.src.team')],
              [
                (['wiki.obj.guardian', 'wiki.obj.walker', 'wiki.obj.baseGuardian', 'wiki.obj.shrine'] as const).map((k) => c.t(k)).join(' · '),
                obj.every((x) => x !== undefined) ? obj.map((x) => c.f.int(x!)).join(' · ') : '—',
                c.t('wiki.souls.src.objectives.d', { pct: o?.near_player_split_pct ?? 25 }),
              ],
              [c.t('wiki.layer.rift'), `≈ ${c.f.int(1500)}`, c.t('wiki.souls.src.rift.d')],
              [c.t('wiki.layer.urn'), perMin(c, 250, 70), c.t('wiki.souls.src.urn.d')],
              [c.t('wiki.souls.src.well'), c.f.int(10), c.t('wiki.souls.src.well.d')],
            ];
          },
        },
      ],
    },
    {
      id: 'souls-sharing',
      title: 'wiki.souls.sharing',
      sub: 'wiki.souls.sharingSub',
      blocks: [
        {
          k: 'table',
          head: ['wiki.souls.colHeroes', 'wiki.souls.colTrooper', 'wiki.souls.colKill'],
          num: [0, 1, 2],
          rows: (c) => {
            const tr = g(c)?.trooper_kill_gold_share_frac ?? [];
            const hk = g(c)?.hero_kill_gold_share_frac ?? [];
            return Array.from({ length: Math.max(tr.length, hk.length) }, (_, i) => [
              String(i + 1),
              tr[i] !== undefined ? c.f.pct(tr[i]) : '—',
              hk[i] !== undefined ? c.f.pct(hk[i] * (i + 1)) : '—',
            ]);
          },
        },
        { k: 'p', text: 'wiki.souls.assist' },
      ],
    },
    {
      id: 'souls-orbs',
      title: 'wiki.souls.orbs',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'wiki.souls.orb.lastHit', text: 'wiki.souls.orb.lastHit.d', tone: 'brass' },
            { title: 'wiki.souls.orb.secure', text: 'wiki.souls.orb.secure.d', tone: 'vitality' },
            { title: 'wiki.souls.orb.deny', text: 'wiki.souls.orb.deny.d', tone: 'blood' },
            { title: 'wiki.souls.orb.melee', text: 'wiki.souls.orb.melee.d', tone: 'weapon' },
          ],
        },
      ],
    },
    {
      id: 'souls-unsecured',
      title: 'wiki.souls.unsecured',
      blocks: [
        { k: 'p', text: 'wiki.souls.unsecured.p1' },
        { k: 'p', text: 'wiki.souls.unsecured.p2' },
      ],
    },
    {
      id: 'souls-comeback',
      title: 'wiki.souls.comeback',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'wiki.souls.cb.bounty', text: 'wiki.souls.cb.bounty.d', tone: 'brass' },
            { title: 'wiki.souls.cb.behind', text: 'wiki.souls.cb.behind.d', tone: 'steel' },
            { title: 'wiki.souls.cb.catchup', text: 'wiki.souls.cb.catchup.d', tone: 'vitality' },
            { title: 'wiki.souls.cb.respawn', text: 'wiki.souls.cb.respawn.d', tone: 'blood' },
          ],
        },
      ],
    },
    {
      id: 'souls-levels',
      title: 'wiki.souls.levels',
      blocks: [{ k: 'p', text: 'wiki.souls.levels.p1' }, { k: 'p', text: 'wiki.souls.levels.p2' }, { k: 'levels' }],
    },
    {
      id: 'souls-respawn',
      title: 'wiki.souls.respawn',
      blocks: [
        {
          k: 'table',
          head: ['wiki.souls.colTime', 'wiki.souls.colRespawn'],
          num: [0, 1],
          rows: (c) => [
            ...RESPAWN.map(([min, s]) => [`${min}:00`, c.t('wiki.sec', { n: s })]),
            [c.t('wiki.souls.later'), c.t('wiki.souls.max', { n: RESPAWN_MAX })],
          ],
        },
        {
          k: 'p',
          text: (c) => {
            const m = g(c)?.rejuv_params?.player_respawn_mult;
            return m?.length === 3
              ? c.t('wiki.souls.respawn.p', { a: c.f.pct(m[0]), b: c.f.pct(m[1]), c: c.f.pct(m[2]) })
              : c.t('wiki.souls.respawn.short');
          },
        },
      ],
    },
  ],
};

const SHOP: WikiArticle = {
  id: 'shop',
  slug: 'shop',
  tab: 'wiki.tab.shop',
  title: 'wiki.shop.title',
  lead: 'wiki.shop.lead',
  meta: 'meta.wiki.shop',
  metaDesc: 'meta.desc.wiki.shop',
  sections: [
    {
      id: 'shop-tiers',
      title: 'wiki.shop.tiers',
      blocks: [{ k: 'tiers' }, { k: 'p', text: 'wiki.shop.upgrade' }, { k: 'link', to: '/items', text: 'wiki.shop.toItems' }],
    },
    {
      id: 'shop-slots',
      title: 'wiki.shop.slots',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'wiki.shop.slot.base', tag: (c) => c.f.int(9), text: 'wiki.shop.slot.base.d', tone: 'brass' },
            { title: 'wiki.shop.slot.flex', tag: (c) => `+${c.f.int(3)}`, text: 'wiki.shop.slot.flex.d', tone: 'vitality' },
            { title: 'wiki.shop.slot.active', tag: (c) => c.f.int(4), text: 'wiki.shop.slot.active.d', tone: 'spirit' },
          ],
        },
      ],
    },
    {
      id: 'shop-where',
      title: 'wiki.shop.where',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'wiki.shop.where.base', text: 'wiki.shop.where.base.d', tone: 'brass' },
            {
              title: 'wiki.shop.where.lane',
              tag: (c) => (c.d.map ? c.f.int((c.d.map.entities.shops ?? []).filter((s) => s.kind === 'lane').length) : ''),
              text: 'wiki.shop.where.lane.d',
              tone: 'steel',
            },
            {
              title: 'wiki.move.secret',
              tag: (c) => (c.d.map ? c.f.int((c.d.map.entities.shops ?? []).filter((s) => s.kind === 'secret').length) : ''),
              text: 'wiki.shop.where.secret.d',
              tone: 'spirit',
            },
          ],
        },
        { k: 'link', to: '/wiki', text: 'wiki.shop.toMap' },
      ],
    },
    {
      id: 'shop-selling',
      title: 'wiki.shop.selling',
      blocks: [{ k: 'p', text: 'wiki.shop.sell' }, { k: 'p', text: 'wiki.shop.imbue' }],
    },
    {
      id: 'shop-bonus',
      title: 'wiki.shop.bonus',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'slot.weapon', text: 'wiki.shop.bonus.weapon', tone: 'weapon' },
            { title: 'slot.vitality', text: 'wiki.shop.bonus.vitality', tone: 'vitality' },
            { title: 'slot.spirit', text: 'wiki.shop.bonus.spirit', tone: 'spirit' },
          ],
        },
        { k: 'p', text: 'wiki.shop.bonus.p' },
      ],
    },
  ],
};

const CC: [MsgKey, string, string, string, string, MsgKey][] = [
  // effect, move, shoot, abilities, items, note
  ['wiki.cc.stun', '✕', '✕', '✕', '✕', 'wiki.cc.stun.d'],
  ['wiki.cc.sleep', '✕', '✕', '✕', '✕', 'wiki.cc.sleep.d'],
  ['wiki.cc.silence', '✓', '✓', '✕', '✓', 'wiki.cc.silence.d'],
  ['wiki.cc.disarm', '✓', '✕', '✓', '✓', 'wiki.cc.disarm.d'],
  ['wiki.cc.curse', '✓', '✕', '✕', '✕', 'wiki.cc.curse.d'],
  ['wiki.cc.immobilize', '✕', '✓', '✓', '✓', 'wiki.cc.immobilize.d'],
  ['wiki.cc.slow', '↓', '✓', '✓', '✓', 'wiki.cc.slow.d'],
];

const COMBAT: WikiArticle = {
  id: 'combat',
  slug: 'combat',
  tab: 'wiki.tab.combat',
  title: 'wiki.combat.title',
  lead: 'wiki.combat.lead',
  meta: 'meta.wiki.combat',
  metaDesc: 'meta.desc.wiki.combat',
  sections: [
    {
      id: 'combat-damage',
      title: 'wiki.combat.damage',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'slot.weapon', text: 'wiki.combat.dmg.weapon', tone: 'weapon' },
            { title: 'slot.spirit', text: 'wiki.combat.dmg.spirit', tone: 'spirit' },
            { title: 'wiki.combat.dmg.melee.t', text: 'wiki.combat.dmg.melee', tone: 'brass' },
            { title: 'wiki.combat.dmg.pure.t', text: 'wiki.combat.dmg.pure', tone: 'steel' },
          ],
        },
        { k: 'p', text: 'wiki.combat.resist' },
      ],
    },
    {
      id: 'combat-crit',
      title: 'wiki.combat.crit',
      blocks: [
        { k: 'p', text: 'wiki.combat.crit.p1' },
        { k: 'p', text: 'wiki.combat.crit.p2' },
      ],
    },
    {
      id: 'combat-melee',
      title: 'wiki.combat.melee',
      blocks: [
        {
          k: 'cards',
          items: [
            { title: 'wiki.combat.melee.light', text: 'wiki.combat.melee.light.d', tone: 'steel' },
            { title: 'wiki.combat.melee.heavy', text: 'wiki.combat.melee.heavy.d', tone: 'brass' },
            { title: 'wiki.combat.melee.parry', text: 'wiki.combat.melee.parry.d', tone: 'vitality' },
            { title: 'wiki.combat.melee.only', text: 'wiki.combat.melee.only.d', tone: 'weapon' },
          ],
        },
        { k: 'p', text: 'wiki.combat.melee.walker' },
      ],
    },
    {
      id: 'combat-move',
      title: 'wiki.combat.move',
      sub: 'wiki.combat.move.sub',
      blocks: [
        {
          k: 'table',
          head: ['wiki.combat.colMove', 'wiki.combat.colStamina'],
          num: [1],
          rows: (c) => [
            [c.t('wiki.combat.mv.dash'), '1'],
            [c.t('wiki.combat.mv.dashJump'), '+1'],
            [c.t('wiki.combat.mv.airJump'), '1'],
            [c.t('wiki.combat.mv.downDash'), '½'],
            [c.t('wiki.combat.mv.wallJump'), c.t('wiki.combat.mv.wallJump.cost')],
            [c.t('wiki.combat.mv.slide'), '0'],
          ],
        },
        {
          k: 'cards',
          items: [
            { title: 'wiki.combat.mv.sprint', text: 'wiki.combat.mv.sprint.d', tone: 'vitality' },
            { title: 'wiki.combat.mv.mantle', text: 'wiki.combat.mv.mantle.d', tone: 'steel' },
            { title: 'wiki.combat.mv.fall', text: 'wiki.combat.mv.fall.d', tone: 'brass' },
          ],
        },
      ],
    },
    {
      id: 'combat-cc',
      title: 'wiki.combat.cc',
      sub: 'wiki.combat.cc.sub',
      blocks: [
        {
          k: 'table',
          head: ['wiki.combat.colEffect', 'wiki.combat.colMoveCc', 'wiki.combat.colShoot', 'wiki.combat.colAbilities', 'wiki.combat.colItems', 'wiki.combat.colNote'],
          marks: true,
          rows: (c) => CC.map(([name, a, b, d, e, note]) => [c.t(name), a, b, d, e, c.t(note)]),
        },
        {
          k: 'cards',
          items: [
            { title: 'wiki.cc.unstoppable', text: 'wiki.cc.unstoppable.d', tone: 'brass' },
            { title: 'wiki.cc.purge', text: 'wiki.cc.purge.d', tone: 'vitality' },
            { title: 'wiki.cc.dot', text: 'wiki.cc.dot.d', tone: 'blood' },
          ],
        },
      ],
    },
    {
      id: 'combat-heal',
      title: 'wiki.combat.heal',
      blocks: [
        { k: 'p', text: 'wiki.combat.heal.base' },
        { k: 'p', text: 'wiki.combat.heal.snack' },
        { k: 'p', text: 'wiki.combat.heal.anti' },
      ],
    },
  ],
};

const RANKS: WikiArticle = {
  id: 'ranks',
  slug: 'ranks',
  tab: 'wiki.tab.ranks',
  title: 'wiki.ranks.title',
  lead: 'wiki.ranks.lead',
  meta: 'meta.wiki.ranks',
  metaDesc: 'meta.desc.wiki.ranks',
  sections: [
    {
      id: 'ranks-all',
      title: 'wiki.ranks.all',
      sub: 'wiki.ranks.allSub',
      blocks: [{ k: 'ranks' }],
    },
  ],
};

const GLOSSARY: WikiArticle = {
  id: 'glossary',
  slug: 'glossary',
  tab: 'wiki.tab.glossary',
  title: 'wiki.gl.title',
  lead: 'wiki.gl.lead',
  meta: 'meta.wiki.glossary',
  metaDesc: 'meta.desc.wiki.glossary',
  sections: [
    {
      id: 'gl-economy',
      title: 'wiki.gl.economy',
      blocks: [
        {
          k: 'terms',
          items: (['souls', 'unsecured', 'lastHit', 'deny', 'farm', 'networth', 'boon', 'ap', 'flex'] as const).map((x) => ({
            term: `wiki.gl.${x}` as MsgKey,
            text: `wiki.gl.${x}.d` as MsgKey,
          })),
        },
      ],
    },
    {
      id: 'gl-fight',
      title: 'wiki.gl.fight',
      blocks: [
        {
          k: 'terms',
          items: (['headshot', 'spiritPower', 'shred', 'cc', 'unstoppable', 'antiheal', 'parry', 'dashJump', 'burst'] as const).map((x) => ({
            term: `wiki.gl.${x}` as MsgKey,
            text: `wiki.gl.${x}.d` as MsgKey,
          })),
        },
      ],
    },
    {
      id: 'gl-map',
      title: 'wiki.gl.map',
      blocks: [
        {
          k: 'terms',
          items: (['lane', 'jungle', 'objective', 'backdoor', 'rejuv', 'zipline', 'wave'] as const).map((x) => ({
            term: `wiki.gl.${x}` as MsgKey,
            text: `wiki.gl.${x}.d` as MsgKey,
          })),
        },
      ],
    },
    {
      id: 'gl-team',
      title: 'wiki.gl.team',
      blocks: [
        {
          k: 'terms',
          items: (['gank', 'rotate', 'push', 'splitPush', 'teamfight', 'carry', 'support', 'peel'] as const).map((x) => ({
            term: `wiki.gl.${x}` as MsgKey,
            text: `wiki.gl.${x}.d` as MsgKey,
          })),
        },
      ],
    },
  ],
};

/** The map article: content is pages/wiki/MapArticle.tsx, only the section list is shared. */
const MAP: WikiArticle = {
  id: 'map',
  slug: '',
  tab: 'wiki.tab.map',
  title: 'wiki.title',
  lead: 'wiki.lead',
  meta: 'meta.wiki',
  metaDesc: 'meta.desc.wiki',
  sections: [
    { id: 'wiki-map', title: 'wiki.map.title', blocks: [] },
    { id: 'wiki-lanes', title: 'wiki.lanes.title', blocks: [] },
    { id: 'wiki-objectives', title: 'wiki.obj.title', blocks: [] },
    { id: 'wiki-neutrals', title: 'wiki.neu.title', blocks: [] },
    { id: 'wiki-events', title: 'wiki.ev.title', blocks: [] },
    { id: 'wiki-timings', title: 'wiki.tl.title', blocks: [] },
    { id: 'wiki-moving', title: 'wiki.move.title', blocks: [] },
  ],
};

/** In the order of the article tabs. */
export const ARTICLES: WikiArticle[] = [MAP, SOULS, SHOP, COMBAT, RANKS, GLOSSARY];

export const articlePath = (a: WikiArticle) => (a.slug ? `/wiki/${a.slug}` : '/wiki');
