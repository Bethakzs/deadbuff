import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { Diamond, Page } from '../../components/UI';
import { useT } from '../../i18n';
import { useDocumentMeta } from '../../lib/seo';
import { ARTICLES, articlePath, type WikiArticle } from '../../lib/wiki';
import { ArticleBody } from './Article';
import { MapArticle } from './MapArticle';

/*
 * /wiki and /wiki/:slug — the shell every article shares: title + lead, the article tabs, and a sticky bar with
 * the sections of the current article that follows the scroll (owner's request, 17.11.2026: "when I scroll down,
 * show these at the top so I can always jump between them").
 */
export function WikiPage() {
  const { t } = useT();
  const { slug } = useParams();
  const article = ARTICLES.find((a) => a.slug === (slug ?? ''));
  useDocumentMeta(article ? t(article.meta) : undefined, article ? t(article.metaDesc) : undefined);
  if (!article) return <Navigate to="/wiki" replace />;

  return (
    <Page className="wiki-page">
      <div className="container">
        <header className="wiki-hero">
          <h1 className="wiki-hero__h1">
            <span className="eyebrow">
              <Diamond /> {t('wiki.eyebrow')}
            </span>
            <span className="sr-only"> — </span>
            <span className="display wiki-hero__title banner__line">
              <motion.span
                key={article.id}
                initial={{ y: '105%' }}
                animate={{ y: 0 }}
                transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                {t(article.title)}
              </motion.span>
            </span>
          </h1>
          <p className="wiki-hero__lead">{t(article.lead)}</p>
        </header>
        <nav className="tabs wiki-tabs" aria-label={t('wiki.articles')}>
          {ARTICLES.map((a) => (
            <NavLink key={a.id} to={articlePath(a)} end className={`tabs__link ${a.id === article.id ? 'is-active' : ''}`}>
              {t(a.tab)}
              {a.id === article.id && (
                <motion.span layoutId="wiki-tab" className="tabs__underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <SectionBar article={article} />

      <div className="container wiki-body">
        {article.id === 'map' ? <MapArticle /> : <ArticleBody article={article} />}
        <p className="muted small-note wiki-note">{t('wiki.note')}</p>
      </div>
    </Page>
  );
}

/**
 * Sticky strip of section chips under the site header. The chip of the section being read lights up (the last
 * section whose top has passed the bar; the last one at the very bottom of the page) and scrolls into view
 * inside the strip.
 */
function SectionBar({ article }: { article: WikiArticle }) {
  const { t } = useT();
  const bar = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(article.sections[0]?.id);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (bar.current?.getBoundingClientRect().bottom ?? 0) + 24;
      let current = article.sections[0]?.id;
      for (const s of article.sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = article.sections.at(-1)?.id ?? current;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [article]);

  // keep the active chip visible inside the strip (scrolls the strip only, never the page)
  useEffect(() => {
    const box = strip.current;
    const chip = box?.querySelector<HTMLElement>('.is-active');
    if (!box || !chip) return;
    const left = chip.offsetLeft - box.clientWidth / 2 + chip.offsetWidth / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  if (article.sections.length < 2) return null;
  return (
    <div className="wiki-bar" ref={bar}>
      <div className="container">
        <nav className="wiki-bar__strip" ref={strip} aria-label={t('wiki.onPage')}>
          {article.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`wiki-bar__chip ${s.id === active ? 'is-active' : ''}`}
              aria-current={s.id === active ? 'location' : undefined}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {t(s.title)}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
