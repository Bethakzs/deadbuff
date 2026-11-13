import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Segmented } from '../components/UI';
import { useT, type MsgKey } from '../i18n';
import { AuthFailure, steamUrl, useAuth, useAuthActions } from '../lib/auth';
import { useDocumentMeta } from '../lib/seo';

type Mode = 'login' | 'register';

/** Only in-app paths ("/me", "/heroes/haze") — never another site. */
const safeNext = (raw: string | null) => (raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/me');

export function SteamGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="steam-glyph">
      <circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15.4" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.6" cy="15.6" r="2.1" fill="currentColor" />
      <path d="M2.6 13.4l6 2.2M8.6 15.6l4.6-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** "Sign in with Steam" — a full page navigation to Steam's own login page. */
export function SteamButton({ mode, next, label }: { mode: 'login' | 'link'; next: string; label: string }) {
  const { meta } = useT();
  return (
    <a className="btn steam-btn" href={steamUrl(mode, `${meta.prefix}${next}`)}>
      <SteamGlyph />
      {label}
    </a>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} spellCheck={false} required />
      {hint && <span className="field__hint muted">{hint}</span>}
    </label>
  );
}

export function LoginPage() {
  const { t } = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { login, register } = useAuthActions();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'register' ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MsgKey | null>(params.get('steam') === 'error' ? 'auth.steamError' : null);
  const next = safeNext(params.get('next'));

  useDocumentMeta(t('meta.login'), t('meta.desc.login'));

  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(name.trim(), password);
      else await register(name.trim(), email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(`auth.err.${err instanceof AuthFailure ? err.code : 'unknown'}` as MsgKey);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="auth-page">
      <div className="container auth-wrap">
        <header className="page-head auth-head">
          <div>
            <span className="eyebrow">{t('auth.eyebrow')}</span>
            <h1 className="display page-head__title">{t(mode === 'login' ? 'auth.titleLogin' : 'auth.titleRegister')}</h1>
            <p className="page-head__sub muted">{t('auth.sub')}</p>
          </div>
        </header>

        <section className="panel auth-card">
          <SteamButton mode="login" next={next} label={t('auth.steam')} />
          <p className="muted small-note auth-card__steam-note">{t('auth.steamNote')}</p>

          <div className="auth-card__or" aria-hidden>
            <span>{t('auth.or')}</span>
          </div>

          <Segmented
            id="auth-mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: 'login', label: t('auth.login') },
              { value: 'register', label: t('auth.register') },
            ]}
          />

          <form className="auth-form" onSubmit={submit}>
            <Field
              label={t(mode === 'login' ? 'auth.loginField' : 'auth.username')}
              value={name}
              onChange={setName}
              autoComplete="username"
              hint={mode === 'register' ? t('auth.usernameHint') : undefined}
            />
            <AnimatePresence initial={false}>
              {mode === 'register' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                  <Field label={t('auth.email')} type="email" value={email} onChange={setEmail} autoComplete="email" />
                </motion.div>
              )}
            </AnimatePresence>
            <Field
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={mode === 'register' ? t('auth.passwordHint') : undefined}
            />
            {error && (
              <p className="auth-error" role="alert">
                {t(error)}
              </p>
            )}
            <button className="btn btn--brass auth-form__submit" type="submit" disabled={busy}>
              {busy ? t('auth.wait') : t(mode === 'login' ? 'auth.login' : 'auth.createAccount')}
            </button>
          </form>
        </section>
      </div>
    </Page>
  );
}
