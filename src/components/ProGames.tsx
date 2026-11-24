import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes, useItems } from '../hooks/useAssets';
import { useT } from '../i18n';
import { fmtCompact, fmtTime } from '../lib/format';
import { heroRgb } from '../lib/heroes';
import { REGION_TAG, type ProGame } from '../lib/pros';
import type { ProPlayer } from '../lib/types';
import { HeroAvatar } from './HeroChip';
import { ItemIcon } from './ItemIcon';

/** Pro name → their player page, with region and leaderboard place. */
export function ProName({ pro, compact }: { pro: ProPlayer; compact?: boolean }) {
  const { t } = useT();
  return (
    <span className="pro-name">
      <Link to={`/players/${pro.id}`} className="pro-name__link" title={t('pros.openPlayer')}>
        {pro.name}
      </Link>
      {!compact && (
        <span className="pro-name__meta muted small num" title={t('pros.rankHint', { region: t(`lb.region.${pro.region}`), n: pro.rank })}>
          {REGION_TAG[pro.region]} #{pro.rank}
        </span>
      )}
    </span>
  );
}

/**
 * Pro games, newest first: result, hero, pro, K/D/A, souls, final build, when — and the match id, which opens
 * the match page here. `showHero` off on a hero page (every row is that hero).
 */
export function ProGameList({ games, showHero = true, step = 15 }: { games: ProGame[]; showHero?: boolean; step?: number }) {
  const { t, ago } = useT();
  const heroes = useHeroes();
  const items = useItems();
  const [shown, setShown] = useState(step);

  return (
    <>
      <ol className={`pro-games ${showHero ? '' : 'is-one-hero'}`}>
        {games.slice(0, shown).map((g) => {
          const hero = heroes.byId.get(g.player.hero_id);
          return (
            <li key={`${g.match.match_id}-${g.pro.id}`} className={`pro-game ${g.won ? 'is-win' : 'is-loss'}`}>
              <span className="pro-game__result">{g.won ? t('player.win') : t('player.loss')}</span>
              {showHero && (
                <span className="pro-game__hero" style={{ ['--hero' as string]: heroRgb(hero) }}>
                  {hero ? (
                    <Link to={`/heroes/${hero.slug}`} title={hero.name}>
                      <HeroAvatar hero={hero} size={34} />
                    </Link>
                  ) : (
                    <span className="muted">#{g.player.hero_id}</span>
                  )}
                </span>
              )}
              <span className="pro-game__who">
                <ProName pro={g.pro} />
                {g.lobby && (
                  <span className="chip pro-game__lobby" title={t('pros.lobbyHint')}>
                    {t('pros.lobby')}
                  </span>
                )}
              </span>
              <span className="pro-game__kda num">
                {g.player.kills} / {g.player.deaths} / {g.player.assists}
              </span>
              <span className="pro-game__souls souls num">{fmtCompact(g.player.net_worth)}</span>
              <span className="pro-game__items">
                {g.items.map((id) => (
                  <ItemIcon key={id} item={items.byId.get(id)} size="sm" />
                ))}
              </span>
              <span className="pro-game__when muted small">
                <span title={t('player.duration')} className="num">
                  {fmtTime(g.match.duration_s)}
                </span>{' '}
                · {ago(g.at)}
                <Link to={`/matches/${g.match.match_id}`} className="pro-game__match num" title={t('match.open')}>
                  #{g.match.match_id} →
                </Link>
              </span>
            </li>
          );
        })}
      </ol>
      {games.length > shown && (
        <div className="load-more">
          <button className="btn btn--ghost" onClick={() => setShown((n) => n + step)}>
            {t('player.showMore')}
          </button>
        </div>
      )}
    </>
  );
}
