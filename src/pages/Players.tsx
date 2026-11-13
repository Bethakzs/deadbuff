import { motion } from 'framer-motion';
import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, ErrorState, Page, Skeleton } from '../components/UI';
import { useRanks } from '../hooks/useAssets';
import { useSteamSearch } from '../hooks/usePlayer';
import { useSteamProfiles } from '../hooks/useStats';
import { useT } from '../i18n';
import { useMe } from '../lib/me';
import { useDocumentMeta } from '../lib/seo';
import { parseAccountInput, searchTermFromInput } from '../lib/steam';

/** Small rank emblem for a badge value (tier*10 + subrank). */
export function RankEmblem({ badge, size = 28 }: { badge?: number | null; size?: number }) {
  const ranks = useRanks();
  if (!badge) return null;
  const tier = Math.floor(badge / 10);
  const sub = badge % 10;
  const r = ranks.data?.find((x) => x.tier === tier);
  const src = r?.images[`small_subrank${sub}_webp`] ?? r?.images.small_webp ?? r?.images.large_webp;
  if (!src) return null;
  return <img className="rank-emblem" src={src} alt={`${r?.name ?? ''} ${sub}`} title={`${r?.name ?? ''} ${sub}`} width={size} height={size} />;
}

export function PlayersPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const me = useMe();
  const meProfile = useSteamProfiles(me ? [me] : []).get(me ?? -1);
  const [input, setInput] = useState('');
  const deferred = useDeferredValue(input);
  const directId = parseAccountInput(deferred);
  const term = directId ? '' : searchTermFromInput(deferred);
  const search = useSteamSearch(term);

  useDocumentMeta(t('meta.players'), t('meta.desc.players'));

  return (
    <Page>
      <div className="container players">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('players.eyebrow')}</span>
            <h1 className="display page-head__title">{t('players.title')}</h1>
            <p className="page-head__sub muted">{t('players.sub')}</p>
          </div>
        </header>

        <form
          className="player-search"
          onSubmit={(e) => {
            e.preventDefault();
            const id = parseAccountInput(input) ?? search.data?.[0]?.account_id;
            if (id) navigate(`/players/${id}`);
          }}
        >
          <div className="search search--big">
            <svg className="search__icon" viewBox="0 0 20 20" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('players.placeholder')}
              aria-label={t('players.placeholder')}
              spellCheck={false}
              autoFocus
            />
          </div>
        </form>

        {me && (
          <Link to={`/players/${me}`} className="me-card">
            {meProfile?.avatarmedium && <img src={meProfile.avatarmedium} alt="" />}
            <span>
              <span className="eyebrow">{t('players.myProfile')}</span>
              <b>{meProfile?.personaname ?? `#${me}`}</b>
            </span>
            <span className="me-card__arrow" aria-hidden>
              →
            </span>
          </Link>
        )}

        <div className="player-results">
          {directId ? (
            <Link to={`/players/${directId}`} className="player-result">
              <span className="player-result__avatar is-empty">#</span>
              <span className="player-result__name">{t('players.open', { id: directId })}</span>
            </Link>
          ) : term.length < 2 ? (
            !me && <p className="muted small-note">{t('players.meNone')}</p>
          ) : search.error ? (
            <ErrorState error={search.error} onRetry={() => search.refetch()} />
          ) : search.isLoading ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={64} r={12} />)
          ) : !search.data?.length ? (
            <Empty>{t('players.noResults')}</Empty>
          ) : (
            search.data.map((p, i) => (
              <motion.div key={p.account_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/players/${p.account_id}`} className="player-result">
                  {p.avatarmedium ? <img className="player-result__avatar" src={p.avatarmedium} alt="" /> : <span className="player-result__avatar is-empty" />}
                  <span className="player-result__name">{p.personaname}</span>
                  {p.matches_played_last_30d ? (
                    <span className="player-result__meta muted">{t('players.matches30', { n: p.matches_played_last_30d })}</span>
                  ) : null}
                  <RankEmblem badge={p.last_team_avg_badge} />
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Page>
  );
}
