import { motion, useScroll, useTransform } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSteamProfiles } from '../hooks/useStats';
import { LANGS, useT, type MsgKey } from '../i18n';
import { useMe } from '../lib/me';
import { HeroSearch } from './HeroSearch';

const NAV: { to: string; key: MsgKey }[] = [
  { to: '/heroes', key: 'nav.heroes' },
  { to: '/tier-list', key: 'nav.tierList' },
  { to: '/items', key: 'nav.items' },
  { to: '/builds', key: 'nav.builds' },
  { to: '/players', key: 'nav.players' },
];

export function Logo() {
  const { t } = useT();
  return (
    <Link to="/" className="logo" aria-label={t('nav.home')}>
      <svg viewBox="0 0 32 32" className="logo__mark" aria-hidden>
        <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 8 24 16 16 24 8 16Z" fill="currentColor" />
        <circle cx="16" cy="16" r="2.6" fill="var(--bg)" />
      </svg>
      <span className="logo__word">
        Dead<b>buff</b>
      </span>
    </Link>
  );
}

/** EN / UA switch with a sliding brass pill. */
export function LangSwitch() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang-switch" role="radiogroup" aria-label={t('nav.language')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          role="radio"
          aria-checked={lang === l.id}
          className={lang === l.id ? 'is-active' : ''}
          onClick={() => setLang(l.id)}
        >
          {lang === l.id && <motion.span layoutId="lang-pill" className="lang-switch__pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="lang-switch__label">{l.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Avatar shortcut to the profile marked with "It's me" (shown only once one is set). */
function MeLink() {
  const { t } = useT();
  const me = useMe();
  const profile = useSteamProfiles(me ? [me] : []).get(me ?? -1);
  if (!me) return null;
  return (
    <Link to="/me" className="me-link" title={t('nav.me')} aria-label={t('nav.me')}>
      {profile?.avatar ? <img src={profile.avatar} alt="" /> : <span>{(profile?.personaname ?? '?').slice(0, 1)}</span>}
    </Link>
  );
}

function Header() {
  const { t } = useT();
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 80], ['rgba(12,10,8,0.35)', 'rgba(12,10,8,0.86)']);
  const border = useTransform(scrollY, [0, 80], ['rgba(236,222,196,0)', 'rgba(236,222,196,0.09)']);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();

  return (
    <motion.header className="site-header" style={{ backgroundColor: bg, borderBottomColor: border }}>
      <div className="container site-header__inner">
        <Logo />
        <nav className={`nav ${menu ? 'is-open' : ''}`} onClick={() => setMenu(false)}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}>
              {({ isActive }) => (
                <>
                  {t(n.key)}
                  {isActive && <motion.span layoutId="nav-underline" className="nav__underline" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="site-header__search">{loc.pathname !== '/' && <HeroSearch />}</div>
        <MeLink />
        <LangSwitch />
        <button className="burger" aria-label={t('nav.menu')} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <span />
          <span />
        </button>
      </div>
    </motion.header>
  );
}

function Footer() {
  const { t } = useT();
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <Logo />
          <p className="muted site-footer__blurb">{t('footer.blurb')}</p>
        </div>
        <div className="site-footer__cols">
          <div>
            <span className="eyebrow">{t('footer.browse')}</span>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to}>
                {t(n.key)}
              </Link>
            ))}
          </div>
          <div>
            <span className="eyebrow">{t('footer.data')}</span>
            <a href="https://deadlock-api.com" target="_blank" rel="noreferrer">
              deadlock-api.com
            </a>
            <a href="https://forums.playdeadlock.com/forums/changelog.10/" target="_blank" rel="noreferrer">
              {t('footer.patchNotes')}
            </a>
          </div>
        </div>
      </div>
      <div className="container site-footer__legal">{t('footer.legal')}</div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
