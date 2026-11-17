import { motion } from 'framer-motion';
import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ErrorState, SectionTitle, Segmented, Skeleton } from '../../components/UI';
import { useGameMap, useGenericData, useLanes, useNpcUnits } from '../../hooks/useAssets';
import { useT, type MsgKey } from '../../i18n';
import { fmtFlex, fmtInt, fmtPct } from '../../lib/format';
import {
  CAMP_KINDS,
  DISTRICTS,
  LANES,
  MAP_LAYERS,
  OBJECTIVES,
  TIMELINE,
  campCount,
  campKind,
  clock,
  districtName,
  districtSpots,
  placeName,
  layerCounts,
  mapMarkers,
  midbossVars,
  wikiNumbers,
  ziplines,
  type LayerId,
  type Marker,
  type Pt,
} from '../../lib/map';
import type { GameMap } from '../../lib/types';

/*
 * /wiki — the map article: an interactive minimap (layers from /assets/map), lanes and districts, objectives with
 * health from /assets/npc-units, neutral camps, big events, the match timeline and how to get around.
 * Owner's request (17.11.2026): "a wiki tab with useful info, like deadlock.wiki" — our own text, live numbers.
 */

type Numbers = ReturnType<typeof wikiNumbers>;

const LAYER_LABEL: Record<LayerId, MsgKey> = {
  camps: 'wiki.layer.camps',
  sinners: 'wiki.layer.sinners',
  shops: 'wiki.layer.shops',
  urn: 'wiki.layer.urn',
  rift: 'wiki.layer.rift',
  bridge: 'wiki.layer.bridge',
  teleporters: 'wiki.layer.teleporters',
  snacks: 'wiki.layer.snacks',
  statues: 'wiki.layer.statues',
  pads: 'wiki.layer.pads',
  ropes: 'wiki.layer.ropes',
  vents: 'wiki.layer.vents',
  veils: 'wiki.layer.veils',
  crates: 'wiki.layer.crates',
};

/** The map article (/wiki): the shell (pages/wiki/index.tsx) draws the title, tabs and section bar. */
export function MapArticle() {
  const { t } = useT();
  const map = useGameMap();
  const npcs = useNpcUnits();
  const generic = useGenericData();
  const places = generic.data?.map_districts;
  const num = useMemo(() => wikiNumbers(npcs.byClass), [npcs.byClass]);

  return (
    <>
      <section id="wiki-map" className="wiki-section">
        {map.error ? <ErrorState error={map.error} onRetry={() => map.refetch()} /> : <WikiMap map={map.data} num={num} />}
      </section>

      <section id="wiki-lanes" className="wiki-section">
        <SectionTitle title={t('wiki.lanes.title')} />
        <p className="muted section-sub">{t('wiki.lanes.sub')}</p>
        <LaneCards />
        <h3 className="display wiki-subtitle">{t('wiki.districts.title')}</h3>
        <div className="wiki-districts">
          {DISTRICTS.map((d) => (
            <div key={d.id} className="wiki-district" style={{ '--c': `var(--team${d.team}-rgb)` } as CSSProperties}>
              <h4 className="display">{districtName(d.id, places)}</h4>
              <span className="wiki-district__side">{t('wiki.side', { team: t(d.team ? 'match.team1' : 'match.team0') })}</span>
              <p>{t(d.text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="wiki-objectives" className="wiki-section">
        <SectionTitle title={t('wiki.obj.title')} />
        <p className="muted section-sub">{t('wiki.obj.sub')}</p>
        <Objectives num={num} />
      </section>

      <section id="wiki-neutrals" className="wiki-section">
        <SectionTitle title={t('wiki.neu.title')} />
        <p className="muted section-sub">{t('wiki.neu.sub', { pct: num.soulGrowth !== undefined ? fmtFlex(num.soulGrowth) : '1' })}</p>
        <CampTable map={map.data} num={num} loading={npcs.isLoading} />
      </section>

      <section id="wiki-events" className="wiki-section">
        <SectionTitle title={t('wiki.ev.title')} />
        <Events map={map.data} />
      </section>

      <section id="wiki-timings" className="wiki-section">
        <SectionTitle title={t('wiki.tl.title')} />
        <p className="muted section-sub">{t('wiki.tl.sub')}</p>
        <ol className="wiki-timeline">
          {TIMELINE.map((e, i) => (
            <motion.li
              key={e.at}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="wiki-timeline__at display num">
                {e.approx ? '≈ ' : ''}
                {clock(e.at)}
              </span>
              <span className="wiki-timeline__text">{t(e.text)}</span>
            </motion.li>
          ))}
        </ol>
      </section>

      <section id="wiki-moving" className="wiki-section">
        <SectionTitle title={t('wiki.move.title')} />
        <Moving map={map.data} />
      </section>
    </>
  );
}

/* --------------------------------- map --------------------------------- */

const MAP_SIZE = 1000;
/** Small, dense layers: a nearby big marker (camp, shop…) wins the pointer over them. */
const MINOR = new Set<LayerId>(['crates', 'statues', 'vents', 'ropes', 'snacks', 'veils', 'pads']);

function WikiMap({ map, num }: { map?: GameMap; num: Numbers }) {
  const { t } = useT();
  const lanes = useLanes();
  const places = useGenericData().data?.map_districts;
  const [view, setView] = useState<0 | 1>(0);
  const [layers, setLayers] = useState<Set<LayerId>>(() => new Set(MAP_LAYERS.filter((l) => l.on).map((l) => l.id)));
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    if (!map) return null;
    const markers = mapMarkers(map);
    const sentries = map.entities.base_sentries ?? [];
    const base = (team: number): Pt | undefined => {
      const s = sentries.filter((x) => x.team === team);
      return s.length ? [s.reduce((a, x) => a + x.left_relative, 0) / s.length, s.reduce((a, x) => a + x.top_relative, 0) / s.length] : undefined;
    };
    return { markers, counts: layerCounts(markers), zips: ziplines(map), districts: districtSpots(map), bases: [base(0), base(1)] };
  }, [map]);

  // Archmother players see the minimap turned around: their base at the bottom
  const f = (p: Pt): Pt => (view ? [1 - p[0], 1 - p[1]] : p);
  const toggle = (id: LayerId) =>
    setLayers((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const label = (m: Marker): string => {
    const team = (n: number | null | undefined) => t(n ? 'match.team1' : 'match.team0');
    switch (m.layer) {
      case 'camps':
      case 'sinners': {
        const c = campKind(m.kind ?? '')!;
        const souls = num.souls(c.npc);
        return t(m.layer === 'camps' ? 'wiki.tip.camp' : 'wiki.tip.sinner', {
          tier: c.tier,
          spawn: clock(c.spawn),
          respawn: clock(c.respawn),
          souls: souls !== undefined ? fmtInt(souls) : '—',
        });
      }
      case 'shops':
        return m.kind === 'secret' ? t('wiki.tip.shopSecret') : t(m.kind === 'base' ? 'wiki.tip.shopBase' : 'wiki.tip.shopLane', { team: team(m.team) });
      case 'urn':
        return t('wiki.tip.urn');
      case 'rift':
        return t('wiki.tip.rift');
      case 'bridge':
        return t('wiki.tip.bridge');
      case 'teleporters':
        return t('wiki.tip.teleporter');
      case 'snacks':
        return t('wiki.tip.snack');
      case 'statues':
        return t('wiki.tip.statue');
      case 'pads':
        return t('wiki.tip.pad');
      case 'ropes':
        return t('wiki.tip.rope');
      case 'vents':
        return t('wiki.tip.vent');
      case 'veils':
        return t('wiki.tip.veil');
      case 'crates':
        return t('wiki.tip.crate');
    }
  };

  /*
   * The nearest visible marker within a few pixels of the pointer (markers are tiny — hit-testing the shapes
   * themselves is too fiddly, above all with a finger). Small, dense layers lose ties to the big ones.
   */
  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!data) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const reach = (e.pointerType === 'mouse' ? 14 : 26) / box.width;
    let best: number | null = null;
    let bestD = reach * reach;
    data.markers.forEach((m, i) => {
      if (!layers.has(m.layer)) return;
      const [mx, my] = f(m.at);
      const d = ((mx - x) ** 2 + (my - y) ** 2) * (MINOR.has(m.layer) ? 2.5 : 1);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hovered = data && hover !== null ? data.markers[hover] : undefined;
  const hp = hovered ? f(hovered.at) : undefined;

  return (
    <div className="wiki-map">
      <div className="wiki-map__frame">
        {!data ? (
          <div className="wiki-map__canvas wiki-map__canvas--loading">
            <Skeleton w="100%" h="100%" r={14} />
            <span className="muted">{t('wiki.map.loading')}</span>
          </div>
        ) : (
          <div
            className={`wiki-map__canvas ${hovered ? 'is-pointing' : ''}`}
            onPointerMove={(e) => e.pointerType === 'mouse' && pick(e)}
            onPointerDown={pick}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
          >
            <div className="wiki-map__glow" aria-hidden>
              <div className={`wiki-map__ground ${view ? 'is-flipped' : ''}`} style={{ '--map-img': `url("${map!.images.minimap}")` } as CSSProperties} />
            </div>
            <svg className="wiki-map__svg" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} role="img" aria-label={t('wiki.map.title')}>
              {data.zips.map((path, i) => (
                <polyline
                  key={i}
                  className="wiki-map__zip"
                  style={{ '--lane': lanes[i]?.rgb ?? '217 169 91' } as CSSProperties}
                  points={path.map((p) => f(p).map((v) => (v * MAP_SIZE).toFixed(1)).join(',')).join(' ')}
                />
              ))}
              {data.markers.map((m, i) => {
                if (!layers.has(m.layer) || !m.to || (m.layer !== 'teleporters' && m.layer !== 'pads')) return null;
                const [a, b] = [f(m.at), f(m.to)];
                return <line key={`l${i}`} className={`wiki-map__link wiki-map__link--${m.layer}`} x1={a[0] * MAP_SIZE} y1={a[1] * MAP_SIZE} x2={b[0] * MAP_SIZE} y2={b[1] * MAP_SIZE} />;
              })}
              {data.markers.map((m, i) => (layers.has(m.layer) ? <MarkerShape key={i} m={m} at={f(m.at)} active={i === hover} /> : null))}
              {hp && <circle className="wiki-map__ring" cx={hp[0] * MAP_SIZE} cy={hp[1] * MAP_SIZE} r={22} />}
            </svg>
            {data.districts.map((d) => {
              const [x, y] = f(d.at);
              return (
                <span key={d.id} className="wiki-map__district display" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
                  {districtName(d.id, places)}
                </span>
              );
            })}
            {data.bases.map((b, team) => {
              if (!b) return null;
              const [x, y] = f(b);
              return (
                <span
                  key={team}
                  className={`wiki-map__base display ${y > 0.5 ? 'is-bottom' : 'is-top'}`}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%`, '--c': `var(--team${team}-rgb)` } as CSSProperties}
                >
                  {t(team ? 'match.team1' : 'match.team0')}
                </span>
              );
            })}
            {hovered && hp && (
              <div
                className={`wiki-map__tip ${hp[1] < 0.18 ? 'is-below' : ''} ${hp[0] < 0.2 ? 'is-left' : hp[0] > 0.8 ? 'is-right' : ''}`}
                style={{ left: `${hp[0] * 100}%`, top: `${hp[1] * 100}%` }}
                role="status"
              >
                {label(hovered)}
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="wiki-map__side">
        <div className="wiki-map__block">
          <span className="eyebrow">{t('wiki.map.view')}</span>
          <Segmented
            id="wiki-view"
            value={view}
            onChange={(v) => {
              setView(v);
              setHover(null);
            }}
            options={[
              { value: 0 as const, label: t('match.team0') },
              { value: 1 as const, label: t('match.team1') },
            ]}
          />
        </div>
        <div className="wiki-map__block">
          <span className="eyebrow">{t('wiki.map.layers')}</span>
          <div className="wiki-layers">
            {MAP_LAYERS.map((l) => {
              const n = data?.counts[l.id] ?? 0;
              if (data && !n) return null;
              const on = layers.has(l.id);
              return (
                <button key={l.id} type="button" className={`wiki-layer ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggle(l.id)}>
                  <svg className={`wiki-layer__swatch mk mk--${l.id}`} viewBox="-12 -12 24 24" aria-hidden>
                    <Shape layer={l.id} kind={l.id === 'camps' ? 'medium' : l.id === 'shops' ? 'secret' : undefined} />
                  </svg>
                  <span className="wiki-layer__name">{t(LAYER_LABEL[l.id])}</span>
                  {data && <span className="wiki-layer__n num">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="wiki-map__block">
          <span className="eyebrow">{t('wiki.map.lanes')}</span>
          <ul className="wiki-legend">
            {lanes.map((l) => (
              <li key={l.id} style={{ '--lane': l.rgb } as CSSProperties}>
                <i aria-hidden />
                {l.name}
              </li>
            ))}
          </ul>
        </div>
        <p className="muted wiki-map__hint">{t('wiki.map.hint')}</p>
      </aside>
    </div>
  );
}

/** Marker symbol in a 24-unit box centred on 0,0 (sizes per layer / camp size). */
function Shape({ layer, kind }: { layer: LayerId; kind?: string }) {
  switch (layer) {
    case 'camps': {
      const s = kind === 'strong' ? 9 : kind === 'medium' ? 7 : 5;
      return <path className={`mk__camp mk__camp--${kind}`} d={`M0 ${-s} ${s} 0 0 ${s} ${-s} 0Z`} />;
    }
    case 'sinners':
      return <rect x={-6} y={-6} width={12} height={12} rx={2} />;
    case 'shops':
      return <circle r={7} className={`mk__shop mk__shop--${kind ?? 'lane'}`} />;
    case 'urn':
      return (
        <>
          <circle r={10} className="mk__ring" />
          <circle r={4} />
        </>
      );
    case 'rift':
      return <path d="M0 -11 9.5 -5.5 9.5 5.5 0 11 -9.5 5.5 -9.5 -5.5Z" />;
    case 'bridge':
      return <path d="M0 -10 2.6 -3.2 9.5 -3.1 4 1.2 6 8.1 0 4 -6 8.1 -4 1.2 -9.5 -3.1 -2.6 -3.2Z" />;
    case 'teleporters':
      return (
        <>
          <circle r={8} className="mk__ring" />
          <circle r={3} />
        </>
      );
    case 'snacks':
      return <circle r={4.5} />;
    case 'statues':
      return <path d="M0 -6 6 0 0 6 -6 0Z" />;
    case 'pads':
      return <path d="M0 -7 7 5 -7 5Z" />;
    case 'ropes':
      return <rect x={-1.6} y={-7} width={3.2} height={14} rx={1.6} />;
    case 'vents':
      return <circle r={4.5} className="mk__ring" />;
    case 'veils':
      return <rect x={-4.5} y={-4.5} width={9} height={9} className="mk__ring" />;
    case 'crates':
      return <rect x={-2.5} y={-2.5} width={5} height={5} />;
  }
}

function MarkerShape({ m, at, active }: { m: Marker; at: Pt; active: boolean }) {
  return (
    <g
      className={`mk mk--${m.layer} ${m.team === 0 ? 'mk--team0' : m.team === 1 ? 'mk--team1' : ''} ${active ? 'is-active' : ''}`}
      transform={`translate(${(at[0] * MAP_SIZE).toFixed(1)} ${(at[1] * MAP_SIZE).toFixed(1)})`}
    >
      <Shape layer={m.layer} kind={m.kind} />
    </g>
  );
}

/* -------------------------------- lanes -------------------------------- */

function LaneCards() {
  const { t } = useT();
  const lanes = useLanes();
  const places = useGenericData().data?.map_districts;
  return (
    <div className="wiki-lanes">
      {LANES.map((l, i) => {
        const lane = lanes[i];
        return (
          <article key={l.text} className="wiki-lane" style={{ '--lane': lane?.rgb ?? '217 169 91' } as CSSProperties}>
            <span className="wiki-lane__kind">{t(l.side === 'mid' ? 'wiki.lane.mid' : 'wiki.lane.side')}</span>
            <h3 className="display wiki-lane__name">{lane?.name ?? '—'}</h3>
            <p className="wiki-lane__text">{t(l.text)}</p>
            <ul className="wiki-lane__spots">
              {l.spots.map((s) => (
                <li key={s[0]}>{placeName(s, places)}</li>
              ))}
            </ul>
            <p className="wiki-lane__near muted">
              {t('wiki.lane.near')}: {l.near.map((d) => districtName(d, places)).join(' · ')}
            </p>
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------ objectives ----------------------------- */

const OBJ_TEXT: Record<(typeof OBJECTIVES)[number]['id'], MsgKey> = {
  guardian: 'wiki.obj.guardian',
  walker: 'wiki.obj.walker',
  baseGuardian: 'wiki.obj.baseGuardian',
  shrine: 'wiki.obj.shrine',
  patron: 'wiki.obj.patron',
};

function Objectives({ num }: { num: Numbers }) {
  const { t } = useT();
  const text = (id: (typeof OBJECTIVES)[number]['id']) => {
    if (id === 'walker') return num.walker ? t('wiki.obj.walker.d', { dmg: fmtInt(num.walker.dmg), pct: num.walker.pct, stun: fmtFlex(num.walker.stun) }) : t('wiki.obj.walker.short');
    if (id === 'patron') {
      const p = num.patron;
      return p?.hp2 && p.regen && p.delay && p.growth && p.from
        ? t('wiki.obj.patron.d', { hp: fmtInt(p.hp2), regen: fmtInt(p.regen), delay: p.delay, growth: fmtInt(p.growth), from: p.from })
        : t('wiki.obj.patron.short');
    }
    return t(`${OBJ_TEXT[id]}.d` as MsgKey);
  };
  return (
    <ol className="wiki-objectives">
      {OBJECTIVES.map((o, i) => {
        const hp = o.npc ? num.hp(o.npc) : undefined;
        return (
          <motion.li
            key={o.id}
            className="wiki-objective"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="wiki-objective__n display">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="display wiki-objective__name">{t(OBJ_TEXT[o.id])}</h3>
            <div className="wiki-objective__meta">
              <span>{t('wiki.perTeam', { n: o.count })}</span>
              {hp !== undefined && (
                <span>
                  <b className="num">{fmtInt(hp)}</b> {t('wiki.health')}
                </span>
              )}
            </div>
            <p>{text(o.id)}</p>
          </motion.li>
        );
      })}
    </ol>
  );
}

/* ------------------------------- neutrals ------------------------------ */

const CAMP_LABEL: Record<(typeof CAMP_KINDS)[number]['kind'], MsgKey> = {
  weak: 'wiki.neu.weak',
  medium: 'wiki.neu.medium',
  strong: 'wiki.neu.strong',
  vault: 'wiki.layer.sinners',
};

function CampTable({ map, num, loading }: { map?: GameMap; num: Numbers; loading: boolean }) {
  const { t } = useT();
  return (
    <div className="wiki-table-wrap panel">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>{t('wiki.neu.camp')}</th>
            <th className="num">{t('wiki.neu.count')}</th>
            <th className="num">{t('wiki.health')}</th>
            <th className="num">{t('wiki.neu.souls')}</th>
            <th className="num">{t('wiki.neu.spawn')}</th>
            <th className="num">{t('wiki.neu.respawn')}</th>
          </tr>
        </thead>
        <tbody>
          {CAMP_KINDS.map((c) => {
            const hp = num.hp(c.npc);
            const souls = num.souls(c.npc);
            const cell = (v: number | undefined) => (v !== undefined ? fmtInt(v) : loading ? <Skeleton w={36} h={12} /> : '—');
            return (
              <tr key={c.kind}>
                <td>
                  <span className="wiki-table__camp">
                    <svg className={`mk mk--${c.kind === 'vault' ? 'sinners' : 'camps'}`} viewBox="-12 -12 24 24" aria-hidden>
                      <Shape layer={c.kind === 'vault' ? 'sinners' : 'camps'} kind={c.kind} />
                    </svg>
                    {t(CAMP_LABEL[c.kind])}
                  </span>
                </td>
                <td className="num" data-label={t('wiki.neu.count')}>{map ? campCount(map, c.kind) : '—'}</td>
                <td className="num" data-label={t('wiki.health')}>{cell(hp)}</td>
                <td className="num wiki-table__souls" data-label={t('wiki.neu.souls')}>{cell(souls)}</td>
                <td className="num" data-label={t('wiki.neu.spawn')}>{clock(c.spawn)}</td>
                <td className="num" data-label={t('wiki.neu.respawn')}>{clock(c.respawn)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- events ------------------------------- */

function Events({ map }: { map?: GameMap }) {
  const { t } = useT();
  const rejuv = midbossVars(useGenericData().data?.rejuv_params);
  const n = (list: string[]) => (map ? list.reduce((a, k) => a + (map.entities[k]?.length ?? 0), 0) : 0);
  const boss = rejuv
    ? t('wiki.ev.midboss.d', { min: rejuv.min, hp: fmtPct(rejuv.hp, 0), resp: fmtPct(rejuv.resp, 0) })
    : t('wiki.ev.midboss.short');
  const events: { title: MsgKey; when: string; text: string; count?: number }[] = [
    { title: 'wiki.ev.midboss', when: t('wiki.ev.start'), text: boss },
    { title: 'wiki.layer.urn', when: clock(600), text: t('wiki.ev.urn.d') },
    { title: 'wiki.layer.rift', when: `≈ ${clock(660)}`, text: t('wiki.ev.rift.d') },
    { title: 'wiki.layer.bridge', when: t('wiki.ev.every5'), text: t('wiki.ev.bridge.d'), count: n(['bridge_buffs']) },
    { title: 'wiki.layer.snacks', when: clock(150), text: t('wiki.ev.snacks.d'), count: n(['healing_snacks']) },
    { title: 'wiki.ev.boxes', when: clock(180), text: t('wiki.ev.boxes.d'), count: n(['crates', 'tough_crates', 'golden_statues']) },
  ];
  return (
    <div className="wiki-events">
      {events.map((e) => (
        <article key={e.title} className={`wiki-event ${e.title === 'wiki.ev.midboss' ? 'wiki-event--boss' : ''}`}>
          <header>
            <h3 className="display">{t(e.title)}</h3>
            <span className="wiki-event__when num">{e.when}</span>
          </header>
          <p>{e.text}</p>
          {!!e.count && <span className="wiki-event__count muted">{t('wiki.onMap', { n: e.count })}</span>}
        </article>
      ))}
    </div>
  );
}

/* -------------------------------- moving ------------------------------- */

function Moving({ map }: { map?: GameMap }) {
  const { t } = useT();
  const n = (k: string) => map?.entities[k]?.length ?? 0;
  const secret = (map?.entities.shops ?? []).filter((s) => s.kind === 'secret').length;
  const items: { title: MsgKey; text: MsgKey; count?: number; layer?: LayerId }[] = [
    { title: 'wiki.map.lanes', text: 'wiki.move.zip', count: map?.zipline_paths.length },
    { title: 'wiki.layer.teleporters', text: 'wiki.move.tp', count: n('teleporters'), layer: 'teleporters' },
    { title: 'wiki.layer.pads', text: 'wiki.move.pads', count: n('bounce_pads'), layer: 'pads' },
    { title: 'wiki.layer.ropes', text: 'wiki.move.ropes', count: n('climb_ropes'), layer: 'ropes' },
    { title: 'wiki.layer.vents', text: 'wiki.move.vents', count: n('steam_vents'), layer: 'vents' },
    { title: 'wiki.layer.veils', text: 'wiki.move.veils', count: n('cosmic_veils'), layer: 'veils' },
    { title: 'wiki.move.secret', text: 'wiki.move.secret.d', count: secret, layer: 'shops' },
    { title: 'wiki.move.fog', text: 'wiki.move.fog.d' },
  ];
  return (
    <div className="wiki-moves">
      {items.map((m) => (
        <div key={m.title} className="wiki-move">
          <h3 className="display">
            {m.layer && (
              <svg className={`mk mk--${m.layer}`} viewBox="-12 -12 24 24" aria-hidden>
                <Shape layer={m.layer} kind={m.layer === 'shops' ? 'secret' : undefined} />
              </svg>
            )}
            {t(m.title)}
            {!!m.count && <span className="wiki-move__n num">{m.count}</span>}
          </h3>
          <p>{t(m.text)}</p>
        </div>
      ))}
    </div>
  );
}
