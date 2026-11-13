import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, ErrorState, Page, Skeleton } from '../components/UI';
import { useMatchHistory } from '../hooks/usePlayer';
import { useSteamProfiles } from '../hooks/useStats';
import { useT } from '../i18n';
import { useMe } from '../lib/me';
import { useDocumentMeta } from '../lib/seo';
import { MatchList, normalMatches } from './Player';

/** Match lookup by ID + the recent matches of the profile marked "It's me". */
export function MatchesPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.matches'), t('meta.desc.matches'));
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const clean = id.replace(/\D/g, '');
  const me = useMe();
  const profile = useSteamProfiles(me ? [me] : []).get(me ?? -1);
  const history = useMatchHistory(me ?? 0);
  const mine = normalMatches(history.data);

  return (
    <Page>
      <div className="container matches">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('matches.eyebrow')}</span>
            <h1 className="display page-head__title">{t('matches.title')}</h1>
            <p className="page-head__sub muted">{t('matches.sub')}</p>
          </div>
        </header>

        <form
          className="player-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean) navigate(`/matches/${clean}`);
          }}
        >
          <div className="search search--big match-search">
            <span className="search__icon match-search__hash" aria-hidden>
              #
            </span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              inputMode="numeric"
              placeholder={t('match.lookupPh')}
              aria-label={t('match.lookupPh')}
              spellCheck={false}
              autoFocus
            />
            <button className="btn btn--brass match-search__go" type="submit" disabled={!clean}>
              {t('match.lookupGo')}
            </button>
          </div>
        </form>

        {!me ? (
          <p className="muted small-note">
            {t('matches.meNone')} ·{' '}
            <Link to="/players" className="link-more">
              {t('matches.findMe')}
            </Link>
          </p>
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : history.isLoading ? (
          <div className="match-list">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} h={52} r={10} />
            ))}
          </div>
        ) : !mine.length ? (
          <Empty>{t('player.empty')}</Empty>
        ) : (
          <MatchList matches={mine} title={profile?.personaname ? `${t('matches.mine')} · ${profile.personaname}` : t('matches.mine')} />
        )}
      </div>
    </Page>
  );
}
