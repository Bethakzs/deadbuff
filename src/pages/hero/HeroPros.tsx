import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ItemIcon } from '../../components/ItemIcon';
import { ProGameList, ProName } from '../../components/ProGames';
import { Empty, ErrorState, Panel, SectionTitle, Skeleton } from '../../components/UI';
import { WinRate } from '../../components/WinRate';
import { useItems } from '../../hooks/useAssets';
import { useProMatches, usePros } from '../../hooks/usePros';
import { useT } from '../../i18n';
import { fmtNum, fmtPct } from '../../lib/format';
import { HERO_PRO_DAYS, HERO_PRO_LIMIT, itemTally, proGames, proIds, proTally } from '../../lib/pros';
import type { Hero } from '../../lib/types';

/**
 * Bottom of the hero page: the pros' recent games on this hero (last 2 weeks), who of them plays it and what
 * they end up building. The query is the same as the prerender's, so it is read from the build's snapshot.
 */
export function HeroPros({ hero }: { hero: Hero }) {
  const { t } = useT();
  const pros = usePros();
  const items = useItems();
  const query = useMemo(
    () => (pros.pros.length ? { accountIds: proIds(pros.pros), heroId: hero.id, days: HERO_PRO_DAYS, limit: HERO_PRO_LIMIT } : undefined),
    [pros.pros, hero.id],
  );
  const matches = useProMatches(query);
  const games = useMemo(() => proGames(matches.data, pros.byId, items.byId, hero.id), [matches.data, pros.byId, items.byId, hero.id]);
  const players = useMemo(() => proTally(games).slice(0, 6), [games]);
  const build = useMemo(() => itemTally(games).slice(0, 12), [games]);
  const loading = pros.isLoading || matches.isLoading || (!!query && !matches.data && !matches.error);

  return (
    <section className="hero-pros">
      <SectionTitle
        eyebrow={t('pros.eyebrow')}
        title={t('pros.onHero', { hero: hero.name })}
        right={
          <Link to={`/pros?hero=${hero.slug}`} className="link-more">
            {t('pros.allGames')}
          </Link>
        }
      />
      {matches.error ? (
        <ErrorState error={matches.error} onRetry={() => matches.refetch()} />
      ) : loading ? (
        <div className="pro-games">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} h={52} r={10} />
          ))}
        </div>
      ) : !games.length ? (
        <Empty>{t('pros.noneOnHero', { hero: hero.name, n: HERO_PRO_DAYS })}</Empty>
      ) : (
        <>
          <ProGameList games={games} showHero={false} step={8} />
          <div className="hero-pros__side">
            <Panel title={t('pros.whoPlays')}>
              <ul className="pro-tally">
                {players.map((p) => (
                  <li key={p.pro.id}>
                    <ProName pro={p.pro} />
                    <span className="pro-tally__nums muted small num">
                      {t('pros.gamesN', { n: p.games })} · <WinRate value={p.wins / p.games} digits={0} /> ·{' '}
                      {fmtNum((p.kills + p.assists) / Math.max(1, p.deaths), 1)} KDA
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t('pros.theyBuild')}>
              <ul className="pro-build">
                {build.map((b) => (
                  <li key={b.itemId} title={t('pros.buildHint', { share: fmtPct(b.share, 0), n: b.games })}>
                    <ItemIcon item={items.byId.get(b.itemId)} size="sm" />
                    <span className="num small">{fmtPct(b.share, 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">{t('pros.buildNote', { n: games.length })}</p>
            </Panel>
          </div>
          <p className="muted small hero-pros__note">{t('pros.note', { n: HERO_PRO_DAYS })}</p>
        </>
      )}
    </section>
  );
}
