import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Panel, Skeleton } from '../components/UI';
import { useSteamProfiles } from '../hooks/useStats';
import { useT, type MsgKey } from '../i18n';
import { AuthFailure, useAuth, useAuthActions } from '../lib/auth';
import { fmtDate } from '../lib/format';
import { useDocumentMeta } from '../lib/seo';
import { RankEmblem } from './Players';
import { usePlayerRank } from '../hooks/usePlayer';
import { SteamButton } from './Login';

const STEAM_NOTE: Record<string, MsgKey> = { linked: 'account.steamLinked', taken: 'account.steamTaken', error: 'auth.steamError' };

/** /account — who you are, the linked Steam account, log out, delete. */
export function AccountPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, isLoading } = useAuth();
  const { logout, unlinkSteam, deleteAccount } = useAuthActions();
  const profile = useSteamProfiles(user?.accountId ? [user.accountId] : []).get(user?.accountId ?? -1);
  const rank = usePlayerRank(user?.accountId ?? 0);
  const [error, setError] = useState<MsgKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const note = STEAM_NOTE[params.get('steam') ?? ''];

  useDocumentMeta(t('meta.account'), t('meta.desc.login'));

  if (isLoading) {
    return (
      <Page>
        <div className="container auth-wrap">
          <Skeleton h={320} r={14} />
        </div>
      </Page>
    );
  }
  if (!user) return <Navigate to="/login?next=/account" replace />;

  const fail = (e: unknown) => setError(`auth.err.${e instanceof AuthFailure ? e.code : 'unknown'}` as MsgKey);

  return (
    <Page className="auth-page">
      <div className="container auth-wrap">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('account.eyebrow')}</span>
            <h1 className="display page-head__title">{user.username}</h1>
            <p className="page-head__sub muted">{t('account.since', { date: fmtDate(user.createdAt) })}</p>
          </div>
        </header>

        {note && <p className={`auth-note ${params.get('steam') === 'linked' ? 'is-ok' : 'is-bad'}`}>{t(note)}</p>}

        <Panel title={t('account.details')} className="account-panel">
          <dl className="account-dl">
            <div>
              <dt>{t('auth.username')}</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>{t('auth.email')}</dt>
              <dd>{user.email ?? <span className="muted">{t('account.noEmail')}</span>}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title={t('account.steam')} className="account-panel">
          {user.accountId ? (
            <div className="account-steam">
              {profile?.avatarmedium ? <img src={profile.avatarmedium} alt="" /> : <span className="account-steam__avatar" />}
              <div className="account-steam__who">
                <b>{profile?.personaname ?? `#${user.accountId}`}</b>
                <span className="muted small">#{user.accountId}</span>
              </div>
              {rank.data?.badge ? <RankEmblem badge={rank.data.badge} size={36} /> : null}
              <div className="account-steam__actions">
                <Link className="btn btn--ghost" to={`/players/${user.accountId}`}>
                  {t('nav.me')}
                </Link>
                {user.hasPassword && (
                  <button className="btn btn--ghost" onClick={() => unlinkSteam().catch(fail)}>
                    {t('account.unlink')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="account-steam account-steam--empty">
              <p className="muted">{t('account.steamWhy')}</p>
              <SteamButton mode="link" next="/account" label={t('account.link')} />
            </div>
          )}
        </Panel>

        {error && (
          <p className="auth-error" role="alert">
            {t(error)}
          </p>
        )}

        <div className="account-actions">
          <Link className="btn btn--brass" to="/me">
            {t('nav.dashboard')}
          </Link>
          <button
            className="btn btn--ghost"
            onClick={() => {
              logout().catch(() => undefined);
              navigate('/');
            }}
          >
            {t('auth.logout')}
          </button>
          {confirmDelete ? (
            <span className="account-delete">
              <span className="muted">{t('account.deleteConfirm')}</span>
              <button className="btn btn--danger" onClick={() => deleteAccount().then(() => navigate('/'), fail)}>
                {t('account.deleteYes')}
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
                {t('account.cancel')}
              </button>
            </span>
          ) : (
            <button className="btn btn--text" onClick={() => setConfirmDelete(true)}>
              {t('account.delete')}
            </button>
          )}
        </div>
      </div>
    </Page>
  );
}
