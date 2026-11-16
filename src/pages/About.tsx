import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { CountUp, Diamond, Page } from '../components/UI';
import { useHeroes, useItems } from '../hooks/useAssets';
import { useHeroRows } from '../hooks/useStats';
import { LANGS, useT, type MsgKey } from '../i18n';
import { fmtCompact } from '../lib/format';
import { useDocumentMeta } from '../lib/seo';

/*
 * /about — who makes Deadbuff and where the numbers come from (owner's request, 16.11.2026):
 * short and punchy, the owner is the Deadlock streamer BethakZS → Twitch link.
 * Prerendered with an AboutPage JSON-LD (author = BethakZS, sameAs = Twitch) in scripts/prerender.ts.
 */
export const TWITCH_URL = 'https://www.twitch.tv/bethakzs';
export const STREAMER = 'BethakZS';

const FEATURES: { n: string; title: MsgKey; text: MsgKey; to: string }[] = [
  { n: '01', title: 'about.f1.t', text: 'about.f1.d', to: '/tier-list' },
  { n: '02', title: 'about.f2.t', text: 'about.f2.d', to: '/draft' },
  { n: '03', title: 'about.f3.t', text: 'about.f3.d', to: '/players' },
];

export function TwitchGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="twitch-glyph">
      <path d="M4.5 2.5 3 6.3v13h4.4v2.2h2.5l2.2-2.2h3.5l4.4-4.4V2.5H4.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 7.4v4.4M15.4 7.4v4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AboutPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.about'), t('meta.desc.about'));
  const { rows } = useHeroRows();
  const heroes = useHeroes();
  const items = useItems();
  const totalMatches = rows.reduce((a, r) => a + r.stat.matches, 0) / 12;

  return (
    <Page className="about-page">
      <div className="container">
        <header className="about-hero">
          <span className="eyebrow">
            <Diamond /> {t('about.eyebrow')}
          </span>
          <h1 className="display about-hero__title">
            {(['about.title1', 'about.title2'] as MsgKey[]).map((key, i) => (
              <span className="banner__line" key={key}>
                <motion.span
                  className={i === 1 ? 'banner__accent' : ''}
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.1 + i * 0.09, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t(key)}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p className="about-hero__lead" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}>
            {t('about.lead')}
          </motion.p>
        </header>

        <section className="numbers about-numbers">
          <div>
            <span className="numbers__val num">{totalMatches ? <CountUp value={totalMatches} format={fmtCompact} /> : '—'}</span>
            <span className="numbers__label">{t('home.numMatches')}</span>
          </div>
          <div>
            <span className="numbers__val num">{heroes.list.length || '—'}</span>
            <span className="numbers__label">{t('home.numHeroes')}</span>
          </div>
          <div>
            <span className="numbers__val num">{items.shop.length || '—'}</span>
            <span className="numbers__label">{t('home.numItems')}</span>
          </div>
          <div>
            <span className="numbers__val num">{LANGS.length}</span>
            <span className="numbers__label">{t('about.numLangs')}</span>
          </div>
        </section>

        <h2 className="display about-section__title">{t('about.what')}</h2>
        <div className="about-features">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link to={f.to} className="about-feature">
                <span className="about-feature__n display">{f.n}</span>
                <h3 className="display about-feature__title">{t(f.title)}</h3>
                <p>{t(f.text)}</p>
                <span className="about-feature__arrow" aria-hidden>
                  →
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="about-split">
          <section className="about-streamer">
            <span className="eyebrow">{t('about.who')}</span>
            <p className="display about-streamer__name">{STREAMER}</p>
            <p className="about-streamer__role">{t('about.role')}</p>
            <p className="about-streamer__text">{t('about.whoText', { name: STREAMER })}</p>
            <a className="btn twitch-btn" href={TWITCH_URL} target="_blank" rel="noopener">
              <TwitchGlyph />
              {t('about.twitch')}
            </a>
          </section>

          <section className="about-data panel">
            <span className="eyebrow">{t('about.data')}</span>
            <p className="about-data__text">{t('about.dataText')}</p>
            <a className="partner-badge" href="https://deadlock-api.com" target="_blank" rel="noopener">
              <Diamond />
              <span>
                <small>{t('footer.partnerOf')}</small>
                <b>Deadlock API</b>
              </span>
            </a>
            <a className="link-more about-data__ingest" href="https://deadlock-api.com/ingest-cache" target="_blank" rel="noopener">
              {t('about.ingest')}
            </a>
          </section>
        </div>

        <p className="muted small-note about-legal">{t('footer.legal')}</p>
      </div>
    </Page>
  );
}
