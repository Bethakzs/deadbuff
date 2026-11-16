import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BuildCard } from '../components/BuildCard';
import { FilterBar } from '../components/FilterBar';
import { HeroCard } from '../components/HeroCard';
import { HeroAvatar, HeroChip } from '../components/HeroChip';
import { SiteSearch } from '../components/SiteSearch';
import { CountUp, Diamond, Empty, ErrorState, Page, Panel, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { MeterBar, WinRate, WinRateBar } from '../components/WinRate';
import { useHeroes, useItems, usePatches } from '../hooks/useAssets';
import { useBuilds, useHeroRows, useSteamProfiles } from '../hooks/useStats';
import { useT, type MsgKey } from '../i18n';
import { useDocumentMeta } from '../lib/seo';
import { fmtCompact, fmtInt, fmtLongDate, fmtNum, fmtPct } from '../lib/format';
import { heroBg, heroCard, heroRgb, roleOf, type HeroRow } from '../lib/heroes';
import { PositionFilter, type PositionValue } from '../components/Position';
import { heroMatches, useRoleOptions, type RoleFilter } from './Heroes';

/* --------------------------- rotating showcase --------------------------- */
function Showcase({ rows }: { rows: HeroRow[] }) {
  const { t } = useT();
  const featured = useMemo(() => [...rows].sort((a, b) => b.score - a.score).slice(0, 5), [rows]);
  const [i, setI] = useState(0);
  // auto-advance; any manual change (dot, swipe) restarts the 6 s wait
  useEffect(() => {
    if (featured.length < 2) return;
    const timer = setTimeout(() => setI((x) => (x + 1) % featured.length), 6000);
    return () => clearTimeout(timer);
  }, [featured.length, i]);
  const step = (d: number) => setI((x) => (x + d + featured.length) % featured.length);

  const cur = featured[i];
  if (!cur)
    return (
      <div className="showcase showcase--loading">
        <Skeleton h="100%" r={14} />
      </div>
    );

  // The SVG logotype spells the English name — use it whenever the localised name is the same, else typeset it.
  const useLogo = cur.hero.name === cur.hero.name_en && cur.hero.images.name_image;

  return (
    // swipe left / right on phones (vertical drags still scroll the page: touch-action pan-y)
    <motion.div
      className="showcase"
      style={{ ['--hero' as string]: heroRgb(cur.hero) }}
      onPanEnd={(_, info) => {
        const { x, y } = info.offset;
        if (Math.abs(x) > 40 && Math.abs(x) > Math.abs(y) * 1.2) step(x < 0 ? 1 : -1);
      }}
    >
      <AnimatePresence mode="popLayout">
        <motion.img
          key={`bg-${cur.hero.id}`}
          className="showcase__bg"
          src={heroBg(cur.hero)}
          alt=""
          initial={{ opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1.02 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.9 }, scale: { duration: 7, ease: 'linear' } }}
        />
      </AnimatePresence>
      <div className="showcase__shade" />
      <AnimatePresence mode="wait">
        <motion.div
          key={cur.hero.id}
          className="showcase__content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          <motion.img
            className="showcase__art"
            src={heroCard(cur.hero)}
            alt={cur.hero.name}
            initial={{ x: 40, opacity: 0, filter: 'blur(6px)' }}
            animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            className="showcase__info"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="eyebrow">{t('home.inMeta', { n: i + 1 })}</span>
            {useLogo ? (
              <img className="showcase__name" src={cur.hero.images.name_image} alt={cur.hero.name} />
            ) : (
              <h3 className="display showcase__name-text">{cur.hero.name}</h3>
            )}
            <div className="showcase__stats">
              <div>
                <WinRate value={cur.winRate} />
                <small>{t('stat.winLower')}</small>
              </div>
              <div>
                <span className="num">{fmtPct(cur.pickRate)}</span>
                <small>{t('stat.pickLower')}</small>
              </div>
              <div>
                <span className="num">{fmtNum(cur.kda, 2)}</span>
                <small>{t('stat.kda')}</small>
              </div>
            </div>
            <Link to={`/heroes/${cur.hero.slug}`} className="btn btn--brass">
              {t('home.cta')}
            </Link>
          </motion.div>
        </motion.div>
      </AnimatePresence>
      <div className="showcase__dots">
        {featured.map((f, n) => (
          <button key={f.hero.id} className={n === i ? 'is-active' : ''} onClick={() => setI(n)} aria-label={t('home.show', { name: f.hero.name })}>
            {n === i && <motion.span layoutId="showcase-dot" className="showcase__dot-fill" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------ meta snapshot ---------------------------- */
function SnapshotList({ rows, metric }: { rows: HeroRow[]; metric: 'wr' | 'pick' }) {
  const { t } = useT();
  const max = Math.max(...rows.map((r) => r.pickRate), 0.01);
  return (
    <ol className="snapshot">
      {rows.map((r, i) => (
        <motion.li key={r.hero.id} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
          <span className="snapshot__n num">{i + 1}</span>
          <HeroChip hero={r.hero} size={34} sub={t(`role.${roleOf(r.hero)}` as MsgKey)} />
          <div className="snapshot__val">
            {metric === 'wr' ? (
              <>
                <WinRate value={r.winRate} />
                <WinRateBar value={r.winRate} />
              </>
            ) : (
              <>
                <span className="num">{fmtPct(r.pickRate)}</span>
                <MeterBar value={r.pickRate} max={max} />
              </>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/* ------------------------------ draft helper ----------------------------- */
/** Teaser for /draft: the six most picked heroes as an enemy lineup → one click opens the draft with them. */
function DraftPromo({ byPick }: { byPick: HeroRow[] }) {
  const { t } = useT();
  const lineup = byPick.slice(0, 6).map((r) => r.hero);
  return (
    <section className="draft-promo">
      <div className="draft-promo__copy">
        <span className="eyebrow">
          <Diamond /> {t('home.draftEyebrow')}
        </span>
        <h2 className="display draft-promo__title">{t('home.draftTitle')}</h2>
        <p className="draft-promo__lead">{t('home.draftLead')}</p>
        <div className="draft-promo__cta">
          <Link to="/draft" className="btn btn--brass">
            {t('home.draftCta')}
          </Link>
          <Link to="/counters" className="link-more">
            {t('ctr.allLink')}
          </Link>
        </div>
      </div>
      <div className="draft-promo__board">
        <span className="draft-promo__label">{t('home.draftTry')}</span>
        {lineup.length ? (
          <Link to={`/draft?e=${lineup.map((h) => h.slug).join(',')}`} className="draft-promo__lineup" aria-label={t('home.draftCta')}>
            <span className="draft-promo__enemies">
              {lineup.map((h, n) => (
                <motion.span
                  key={h.id}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: n * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <HeroAvatar hero={h} size={48} />
                </motion.span>
              ))}
            </span>
            <span className="draft-promo__vs display">vs</span>
            <span className="draft-promo__you display">?</span>
          </Link>
        ) : (
          <Skeleton h={64} r={12} />
        )}
        <div className="draft-promo__guides">
          {lineup.slice(0, 4).map((h) => (
            <Link key={h.id} to={`/counters/${h.slug}`} className="chip">
              {t('ctr.linkName', { name: h.name })}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- page --------------------------------- */
export function HomePage() {
  const { t, rich } = useT();
  useDocumentMeta(t('meta.title'), t('meta.desc.home'));
  const { rows, isLoading, isFetching, error } = useHeroRows();
  const heroes = useHeroes();
  const items = useItems();
  const patches = usePatches();
  const trending = useBuilds({ sortBy: 'weekly_favorites', limit: 6 });
  const profiles = useSteamProfiles(useMemo(() => (trending.data ?? []).map((b) => b.hero_build.author_account_id), [trending.data]));
  const roleOptions = useRoleOptions();
  const [role, setRole] = useState<RoleFilter>('all');
  const [pos, setPos] = useState<PositionValue>('all');

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.hero.id, r])), [rows]);
  const byWr = useMemo(() => [...rows].sort((a, b) => b.winRate - a.winRate), [rows]);
  const byPick = useMemo(() => [...rows].sort((a, b) => b.pickRate - a.pickRate), [rows]);
  const totalMatches = rows.reduce((a, r) => a + r.stat.matches, 0) / 12;
  const changelog = (patches.data ?? []).slice(0, 4);
  const grid = heroes.list.filter((h) => heroMatches(h, role, pos));
  const titleLines: MsgKey[] = ['home.title1', 'home.title2', 'home.title3'];

  return (
    <Page className="home">
      {/* ---------- hero banner ---------- */}
      <section className="banner">
        <div className="container banner__inner">
          <div className="banner__copy">
            <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <Diamond /> {t('home.eyebrow')}
            </motion.span>
            <h1 className="display banner__title">
              {titleLines.map((key, i) => (
                <span className="banner__line" key={key}>
                  <motion.span
                    initial={{ y: '105%' }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.12 + i * 0.09, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className={i === 2 ? 'banner__accent' : ''}
                  >
                    {t(key)}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p className="banner__lead" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }}>
              {t('home.lead')}
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}>
              <SiteSearch big />
              <div className="banner__quick">
                <Link to="/tier-list" className="chip">
                  {t('home.chipTier')}
                </Link>
                <Link to="/draft" className="chip">
                  {t('home.chipDraft')}
                </Link>
                <Link to="/heroes" className="chip">
                  {t('home.chipWr')}
                </Link>
                <Link to="/items" className="chip">
                  {t('home.chipItems')}
                </Link>
                <Link to="/builds" className="chip">
                  {t('home.chipBuilds')}
                </Link>
              </div>
            </motion.div>
          </div>
          <motion.div
            className="banner__showcase"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <Showcase rows={rows} />
          </motion.div>
        </div>
      </section>

      <div className="container">
        {/* ---------- numbers strip ---------- */}
        <section className="numbers">
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
            <span className="numbers__val">{changelog[0]?.title ?? '—'}</span>
            <span className="numbers__label">{t('home.numPatch')}</span>
          </div>
        </section>

        {/* ---------- meta snapshot ---------- */}
        <SectionTitle eyebrow={t('home.snapEyebrow')} title={t('home.snapTitle')} right={<FilterBar fetching={isFetching && !isLoading} />} />
        {error ? (
          <ErrorState error={error} />
        ) : (
          <div className="snapshot-grid">
            <Panel title={t('home.highestWr')} right={<Link to="/heroes" className="link-more">{t('home.allHeroes')}</Link>}>
              {isLoading ? <Skeleton h={260} /> : <SnapshotList rows={byWr.slice(0, 5)} metric="wr" />}
            </Panel>
            <Panel title={t('home.mostPicked')} right={<Link to="/heroes" className="link-more">{t('home.fullTable')}</Link>}>
              {isLoading ? <Skeleton h={260} /> : <SnapshotList rows={byPick.slice(0, 5)} metric="pick" />}
            </Panel>
            <Panel title={t('home.struggling')} right={<Link to="/tier-list" className="link-more">{t('home.tierLink')}</Link>}>
              {isLoading ? <Skeleton h={260} /> : <SnapshotList rows={byWr.slice(-5).reverse()} metric="wr" />}
            </Panel>
          </div>
        )}

        {/* ---------- draft helper teaser ---------- */}
        {!error && <DraftPromo byPick={byPick} />}

        {/* ---------- hero grid ---------- */}
        <SectionTitle eyebrow={t('home.heroCount', { n: heroes.list.length })} title={t('home.pickHero')} />
        <div className="toolbar">
          <Segmented id="home-role" value={role} onChange={setRole} options={roleOptions} />
          <div className="toolbar__end">
            <PositionFilter id="home-pos" value={pos} onChange={setPos} />
          </div>
        </div>
        {/* No `layout` on the grid itself: animating the container's size scales (stretches) the cards.
            Each card animates its own position instead, and filtered-out cards pop out. */}
        <div className="hero-grid">
          {heroes.isLoading ? (
            Array.from({ length: 18 }, (_, i) => <Skeleton key={i} h={250} r={12} />)
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {grid.map((h, i) => (
                <HeroCard key={h.id} hero={h} row={rowsById.get(h.id)} index={i} />
              ))}
            </AnimatePresence>
          )}
        </div>

        {!heroes.isLoading && grid.length === 0 && <Empty>{t('home.noHeroes')}</Empty>}

        {/* ---------- builds + patches ---------- */}
        <div className="home-split">
          <div>
            <SectionTitle eyebrow={t('home.community')} title={t('home.trending')} right={<Link to="/builds" className="link-more">{t('home.moreBuilds')}</Link>} />
            <div className="build-list">
              {trending.isLoading
                ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={120} r={12} />)
                : (trending.data ?? []).map((b) => (
                    <BuildCard
                      key={b.hero_build.hero_build_id}
                      build={b}
                      hero={heroes.byId.get(b.hero_build.hero_id)}
                      profile={profiles.get(b.hero_build.author_account_id)}
                    />
                  ))}
            </div>
          </div>
          <aside>
            <SectionTitle
              eyebrow={t('home.changelog')}
              title={t('home.patches')}
              right={
                <Link to="/patches" className="link-more">
                  {t('patch.cta')} →
                </Link>
              }
            />
            <ul className="patch-list">
              {patches.isLoading
                ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={64} r={10} />)
                : changelog.map((p, i) => (
                    <motion.li key={p.link} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                      <a href={p.link} target="_blank" rel="noreferrer" className="patch">
                        <span className="patch__title display">{p.title}</span>
                        <span className="patch__date muted">{fmtLongDate(p.pub_date)}</span>
                        <span className="patch__arrow" aria-hidden>
                          ↗
                        </span>
                      </a>
                    </motion.li>
                  ))}
            </ul>
            <p className="muted small-note">{rich('home.coverage', { n: <b className="num">{totalMatches ? fmtInt(totalMatches) : '—'}</b> })}</p>
          </aside>
        </div>
      </div>
    </Page>
  );
}
