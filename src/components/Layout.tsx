import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSteamProfiles } from '../hooks/useStats';
import { LANGS, useT, type Lang, type MsgKey } from '../i18n';
import { useAuth, useAuthActions } from '../lib/auth';
import { FavoritesSync } from '../lib/favorites';
import { useMe } from '../lib/me';
import { SiteSearch } from './SiteSearch';
import { Diamond } from './UI';

type NavItem = { to: string; key: MsgKey };

/** Main tabs in the header (owner's order: tier list first). */
const NAV: NavItem[] = [
  { to: '/tier-list', key: 'nav.tierList' },
  { to: '/heroes', key: 'nav.heroes' },
  { to: '/builds', key: 'nav.builds' },
  { to: '/items', key: 'nav.items' },
];

/** Secondary sections behind the "three lines" menu at the end of the nav (owner's request). */
const MORE: NavItem[] = [
  { to: '/draft', key: 'nav.draft' },
  { to: '/patches', key: 'nav.patches' },
  { to: '/players', key: 'nav.players' },
  { to: '/matches', key: 'nav.matches' },
  { to: '/leaderboard', key: 'nav.leaderboard' },
];

const inSection = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

/** Desktop: "three lines" button with the secondary sections (the mobile burger lists them inline). */
function MoreMenu() {
  const { t } = useT();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = MORE.some((m) => inSection(pathname, m.to));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="more-menu" ref={root}>
      <button
        className={`more-menu__btn ${open ? 'is-open' : ''} ${active ? 'is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.more')}
        title={t('nav.more')}
      >
        <span />
        <span />
        <span />
        {active && <motion.span layoutId="nav-underline" className="nav__underline" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="more-menu__list"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {MORE.map((m, i) => (
              <motion.li key={m.to} role="none" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Link role="menuitem" to={m.to} className={inSection(pathname, m.to) ? 'is-active' : ''}>
                  {t(m.key)}
                </Link>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

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

/** Language menu: globe button with the current language code, opens the list of languages (native names). */
export function LangSwitch() {
  const { lang, meta, setLang, t } = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    // keyboard users land on the current language
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (id: Lang) => {
    setOpen(false);
    if (id !== lang) setLang(id);
  };

  /** Arrow keys move between options. */
  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const opts = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length]?.focus();
  };

  return (
    <div className="lang-menu" ref={root}>
      <button
        ref={button}
        className={`lang-menu__btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('nav.language')}: ${meta.name}`}
        title={t('nav.language')}
      >
        <svg viewBox="0 0 24 24" className="lang-menu__globe" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="3.9" ry="9" />
          <path d="M3 12h18M4.7 7.2h14.6M4.7 16.8h14.6" />
        </svg>
        <span className="lang-menu__code">{meta.label}</span>
        <svg viewBox="0 0 12 12" className={`chev ${open ? 'is-open' : ''}`} aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={list}
            className="lang-menu__list"
            role="listbox"
            aria-label={t('nav.language')}
            onKeyDown={onListKey}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {LANGS.map((l, i) => (
              <motion.li key={l.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025 }}>
                <button role="option" aria-selected={l.id === lang} className={l.id === lang ? 'is-active' : ''} lang={l.locale} onClick={() => pick(l.id)}>
                  <span className="lang-menu__name">{l.name}</span>
                  <span className="lang-menu__tag">{l.label}</span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Small "back" arrow tucked under the logo. Only shown once this tab has somewhere to go back to:
 * react-router keeps its position in `history.state.idx`, so idx 0 means we landed here directly.
 */
function BackButton() {
  const { t } = useT();
  const navigate = useNavigate();
  const loc = useLocation();
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (loc.pathname === '/' || idx <= 0) return null;
  return (
    <button className="back-btn" onClick={() => navigate(-1)} aria-label={t('nav.back')} title={t('nav.back')}>
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * Account corner of the header. Guests without a profile see a "Log in" button; anyone with an
 * account or an "It's me" profile gets an avatar (Steam avatar or the name's first letter) opening a
 * menu: dashboard, my profile, compare, account / log in, log out.
 */
function AccountMenu() {
  const { t } = useT();
  const { user } = useAuth();
  const { logout } = useAuthActions();
  const me = useMe();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const profile = useSteamProfiles(me ? [me] : []).get(me ?? -1);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user && !me) {
    return (
      <Link to="/login" className="login-btn" title={t('auth.login')}>
        <svg viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="7" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>{t('auth.login')}</span>
      </Link>
    );
  }

  const name = user?.username ?? profile?.personaname ?? `#${me}`;
  const items: { to: string; key: MsgKey }[] = [
    { to: '/me', key: 'nav.dashboard' },
    ...(me ? [{ to: `/players/${me}`, key: 'nav.me' as MsgKey }] : []),
    { to: '/compare', key: 'nav.compare' },
    { to: user ? '/account' : '/login', key: user ? 'nav.account' : 'auth.login' },
    // the owner (ADMIN_USERS on the server) also gets the site statistics
    ...(user?.admin ? [{ to: '/admin', key: 'nav.admin' as MsgKey }] : []),
  ];

  return (
    <div className="account-menu" ref={root}>
      <button
        className={`me-link ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('nav.accountMenu')}: ${name}`}
        title={name}
      >
        {profile?.avatar ? <img src={profile.avatar} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="account-menu__list"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="account-menu__who">
              <span className="eyebrow">{user ? t('auth.signedInAs') : t('player.isMe')}</span>
              <b>{name}</b>
            </div>
            {items.map((m) => (
              <Link key={m.to} role="menuitem" to={m.to} className={inSection(pathname, m.to) ? 'is-active' : ''}>
                {t(m.key)}
              </Link>
            ))}
            {user && (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  logout().catch(() => undefined);
                  navigate('/');
                }}
              >
                {t('auth.logout')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
        <div className="site-header__brand">
          <Logo />
          <BackButton />
        </div>
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
          {/* in the mobile burger the secondary sections are listed inline */}
          {MORE.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav__link nav__link--more ${isActive ? 'is-active' : ''}`}>
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <MoreMenu />
        <div className="site-header__search">{loc.pathname !== '/' && <SiteSearch />}</div>
        <AccountMenu />
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
          {/* Deadbuff is listed among the tracker sites on deadlock-api.com (owner, 16.11.2026) */}
          <a className="partner-badge" href="https://deadlock-api.com" target="_blank" rel="noopener">
            <Diamond />
            <span>
              <small>{t('footer.partnerOf')}</small>
              <b>Deadlock API</b>
            </span>
          </a>
        </div>
        <div className="site-footer__cols">
          <div>
            <span className="eyebrow">{t('footer.browse')}</span>
            {[...NAV, ...MORE].map((n) => (
              <Link key={n.to} to={n.to}>
                {t(n.key)}
              </Link>
            ))}
            <Link to="/about">{t('nav.about')}</Link>
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
      <FavoritesSync />
      <Header />
      {children}
      <Footer />
    </>
  );
}
