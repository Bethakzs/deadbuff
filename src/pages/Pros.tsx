import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HeroAvatar } from '../components/HeroChip';
import { ProGameList, ProName } from '../components/ProGames';
import { Empty, ErrorState, Page, Panel, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { WinRate } from '../components/WinRate';
import { useHeroes, useItems } from '../hooks/useAssets';
import { useActiveMatches, useProMatches, usePros } from '../hooks/usePros';
import { useT, type MsgKey } from '../i18n';
import { fmtCompact, fmtInt, fmtTime } from '../lib/format';
import { heroTally, PRO_REGIONS, proGames, proIds, PROS_DAYS, PROS_LIMIT, PROS_LOBBY_DAYS, REGION_TAG } from '../lib/pros';
import { useDocumentMeta } from '../lib/seo';
import type { ActiveMatch, Hero, ProPlayer, Region } from '../lib/types';
import { HeroSelect } from './Leaderboard';

type Mode = 'all' | 'ranked' | 'lobby';
const MODES: Mode[] = ['all', 'ranked', 'lobby'];
const LIST_STEP = 15;

/** Matches being played now with at least one pro in them (optionally only pros of a region / on a hero). */
function LiveGames({ pros, region, hero }: { pros: Map<number, ProPlayer>; region?: Region; hero?: Hero }) {
  const { t } = useT();
  const heroes = useHeroes();
  const active = useActiveMatches(pros.size > 0);
  const now = Math.floor(Date.now() / 1000);
  const live = useMemo(() => {
    const out: { m: ActiveMatch; who: { pro: ProPlayer; heroId: number; team: number }[] }[] = [];
    for (const m of active.data ?? []) {
      const who = m.players
        .map((p) => ({ pro: pros.get(p.account_id), heroId: p.hero_id, team: p.team }))
        .filter((x): x is { pro: ProPlayer; heroId: number; team: number } => !!x.pro && (!region || x.pro.region === region) && (!hero || x.heroId === hero.id));
      if (who.length) out.push({ m, who });
    }
    return out.sort((a, b) => b.who.length - a.who.length || a.m.start_time - b.m.start_time);
  }, [active.data, pros, region, hero]);

  if (active.isLoading) return <Skeleton h={64} r={12} />;
  if (active.error) return null;
  return (
    <Panel
      title={
        <span className="pro-live__title">
          <span className="pro-live__dot" aria-hidden /> {t('pros.live')}
        </span>
      }
      right={<span className="muted small num">{fmtInt(live.length)}</span>}
    >
      {!live.length ? (
        <p className="muted small">{t('pros.liveNone')}</p>
      ) : (
        <ul className="pro-live">
          {live.slice(0, 8).map(({ m, who }) => {
            const dur = m.duration_s ?? Math.max(0, now - m.start_time);
            const nw0 = m.net_worth_team_0 ?? 0;
            const nw1 = m.net_worth_team_1 ?? 0;
            return (
              <li key={m.match_id}>
                <span className="pro-live__time num">{fmtTime(dur)}</span>
                <span className="pro-live__who">
                  {who.map((w) => {
                    const h = heroes.byId.get(w.heroId);
                    const lead = w.team === 0 ? nw0 - nw1 : nw1 - nw0;
                    return (
                      <span key={w.pro.id} className="pro-live__pro">
                        {h && <HeroAvatar hero={h} size={26} />}
                        <ProName pro={w.pro} compact />
                        {nw0 + nw1 > 0 && (
                          <span className={`num small ${lead >= 0 ? 'is-up' : 'is-down'}`} title={t('pros.liveLead')}>
                            {lead >= 0 ? '+' : '−'}
                            {fmtCompact(Math.abs(lead))}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
                {/lobby/i.test(m.match_mode_parsed ?? '') && <span className="chip pro-game__lobby">{t('pros.lobby')}</span>}
                {!!m.spectators && <span className="muted small num" title={t('pros.spectators')}>👁 {fmtInt(m.spectators)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** /pros — a pro tracker: the newest games of the top of every region's leaderboard. */
export function ProsPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.pros'), t('meta.desc.pros'));
  const heroes = useHeroes();
  const items = useItems();
  const pros = usePros();
  const [params, setParams] = useSearchParams();
  const region = (PRO_REGIONS as string[]).includes(params.get('region') ?? '') ? (params.get('region') as Region) : undefined;
  const mode = (MODES as string[]).includes(params.get('mode') ?? '') ? (params.get('mode') as Mode) : 'all';
  const hero = heroes.bySlug.get(params.get('hero') ?? '');
  const [listAll, setListAll] = useState(false);

  const update = (next: { region?: Region | null; mode?: Mode; hero?: Hero | null }) => {
    const r = next.region === undefined ? region : (next.region ?? undefined);
    const m = next.mode ?? mode;
    const h = next.hero === undefined ? hero : (next.hero ?? undefined);
    const p: Record<string, string> = {};
    if (r) p.region = r;
    if (m !== 'all') p.mode = m;
    if (h) p.hero = h.slug;
    setParams(p, { replace: true });
  };

  const inRegion = useMemo(() => (region ? pros.pros.filter((p) => p.region === region) : pros.pros), [pros.pros, region]);
  const query = useMemo(
    () =>
      inRegion.length
        ? {
            accountIds: proIds(inRegion),
            heroId: hero?.id,
            mode: mode === 'all' ? undefined : mode,
            days: mode === 'lobby' ? PROS_LOBBY_DAYS : PROS_DAYS,
            limit: PROS_LIMIT,
          }
        : undefined,
    [inRegion, hero, mode],
  );
  const matches = useProMatches(query);
  const games = useMemo(() => proGames(matches.data, pros.byId, items.byId, hero?.id), [matches.data, pros.byId, items.byId, hero]);
  const meta = useMemo(() => heroTally(games).slice(0, 12), [games]);
  const list = useMemo(() => [...inRegion].sort((a, b) => a.rank - b.rank || a.region.localeCompare(b.region)), [inRegion]);
  const days = mode === 'lobby' ? PROS_LOBBY_DAYS : PROS_DAYS;
  const loading = pros.isLoading || matches.isLoading || (!!query && !matches.data && !matches.error);

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('pros.eyebrow')}</span>
            <h1 className="display page-head__title">{t('pros.title')}</h1>
            <p className="page-head__sub muted">{t('pros.sub')}</p>
            <Link className="link-more page-head__wiki" to="/leaderboard">
              {t('pros.toLeaderboard')}
            </Link>
          </div>
        </header>

        <div className="toolbar pros-toolbar">
          <Segmented
            id="pros-region"
            value={region ?? 'all'}
            onChange={(r) => update({ region: r === 'all' ? null : (r as Region) })}
            options={[{ value: 'all', label: t('pros.allRegions') }, ...PRO_REGIONS.map((r) => ({ value: r, label: REGION_TAG[r] }))]}
          />
          <Segmented id="pros-mode" value={mode} onChange={(m) => update({ mode: m as Mode })} options={MODES.map((m) => ({ value: m, label: t(`pros.mode.${m}` as MsgKey) }))} />
          <div className="toolbar__end">
            <HeroSelect value={hero} onChange={(h) => update({ hero: h ?? null })} />
          </div>
        </div>

        <div className="pros-layout">
          <div className="pros-layout__main">
            <LiveGames pros={pros.byId} region={region} hero={hero} />
            <SectionTitle
              title={t('pros.recent')}
              right={<span className="muted small">{t('pros.window', { n: days })}</span>}
            />
            {matches.error || pros.error ? (
              <ErrorState error={matches.error ?? pros.error} onRetry={() => (pros.error ? pros.refetch() : matches.refetch())} />
            ) : loading ? (
              <div className="pro-games">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} h={52} r={10} />
                ))}
              </div>
            ) : !games.length ? (
              <Empty>{t('pros.none')}</Empty>
            ) : (
              <ProGameList games={games} />
            )}
          </div>

          <aside className="pros-layout__side">
            <Panel title={t('pros.meta')}>
              {!meta.length ? (
                <p className="muted small">{loading ? '…' : t('pros.none')}</p>
              ) : (
                <ul className="pro-meta">
                  {meta.map((m) => {
                    const h = heroes.byId.get(m.heroId);
                    if (!h) return null;
                    return (
                      <li key={m.heroId}>
                        <button className="pro-meta__hero" onClick={() => update({ hero: h })} title={t('pros.filterHero', { hero: h.name })}>
                          <HeroAvatar hero={h} size={28} />
                          <span>{h.name}</span>
                        </button>
                        <span className="pro-meta__nums muted small num">
                          {t('pros.gamesN', { n: m.games })} · <WinRate value={m.wins / m.games} digits={0} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="muted small">{t('pros.metaNote')}</p>
            </Panel>

            <Panel title={t('pros.list')} right={<span className="muted small num">{fmtInt(list.length)}</span>}>
              <ol className="pro-list">
                {(listAll ? list : list.slice(0, LIST_STEP)).map((p) => (
                  <li key={p.id}>
                    <span className="pro-list__rank num muted">
                      {REGION_TAG[p.region]} #{p.rank}
                    </span>
                    <ProName pro={p} compact />
                    <span className="pro-list__heroes">
                      {p.heroes.slice(0, 3).map((id) => {
                        const h = heroes.byId.get(id);
                        return h ? (
                          <Link key={id} to={`/heroes/${h.slug}`} title={h.name}>
                            <HeroAvatar hero={h} size={22} />
                          </Link>
                        ) : null;
                      })}
                    </span>
                  </li>
                ))}
              </ol>
              {list.length > LIST_STEP && (
                <button className="link-more pro-list__more" onClick={() => setListAll((v) => !v)}>
                  {listAll ? t('pros.listLess') : t('pros.listAll', { n: list.length })}
                </button>
              )}
            </Panel>
          </aside>
        </div>
        <p className="muted small-note">{t('pros.about')}</p>
      </div>
    </Page>
  );
}
