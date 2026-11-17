import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HeroAvatar } from '../components/HeroChip';
import { Empty, ErrorState, Page, Segmented, SkeletonRows } from '../components/UI';
import { useHeroes } from '../hooks/useAssets';
import { usePlayerRanks } from '../hooks/usePlayer';
import { useLeaderboard } from '../hooks/useStats';
import { useT, type MsgKey } from '../i18n';
import { useDocumentMeta } from '../lib/seo';
import type { Hero, LeaderboardEntry, Region } from '../lib/types';

export const REGIONS: Region[] = ['Europe', 'NAmerica', 'SAmerica', 'Asia', 'Oceania'];

/**
 * Valve publishes only the account NAME, so a common name matches many accounts. We resolve an
 * entry to the account with the highest rank (that is the leaderboard player), but only when the
 * list is short enough to check — a name shared by hundreds stays unlinked instead of guessing.
 */
const MAX_CANDIDATES = 32;
const MAX_LOOKUPS = 400;

/** Dropdown: overall leaderboard or one hero's. */
function HeroSelect({ value, onChange }: { value?: Hero; onChange: (h?: Hero) => void }) {
  const { t } = useT();
  const heroes = useHeroes();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (h?: Hero) => {
    onChange(h);
    setOpen(false);
  };

  return (
    <div className="rank-select" ref={ref}>
      <button className="rank-select__btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {value ? <HeroAvatar hero={value} size={26} /> : <span className="rank-select__all">◈</span>}
        <span>{value?.name ?? t('lb.allHeroes')}</span>
        <svg viewBox="0 0 12 12" className={`chev ${open ? 'is-open' : ''}`} aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="rank-select__menu rank-select__menu--scroll"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: -4,
              scale: 0.98,
              transition: { duration: 0.1 },
            }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <li>
              <button role="option" aria-selected={!value} className={!value ? 'is-active' : ''} onClick={() => pick(undefined)}>
                <span className="rank-select__all">◈</span>
                {t('lb.allHeroes')}
              </button>
            </li>
            {heroes.list.map((h) => (
              <li key={h.id}>
                <button role="option" aria-selected={value?.id === h.id} className={value?.id === h.id ? 'is-active' : ''} onClick={() => pick(h)}>
                  <HeroAvatar hero={h} size={26} />
                  {h.name}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LeaderboardPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.leaderboard'), t('meta.desc.leaderboard'));
  const heroes = useHeroes();
  const [params, setParams] = useSearchParams();
  const region = (REGIONS as string[]).includes(params.get('region') ?? '') ? (params.get('region') as Region) : 'Europe';
  const hero = heroes.bySlug.get(params.get('hero') ?? '');
  const q = useLeaderboard(region, hero?.id);
  const entries = q.data?.entries ?? [];
  // a single-hero leaderboard comes without top heroes, so the column is hidden then
  const showHeroes = entries.some((e) => e.top_hero_ids?.length);

  // ask for the ranks of the candidates we can check, best-ranked entries first
  const lookups = useMemo(() => {
    const ids: number[] = [];
    for (const e of [...entries].sort((a, b) => a.rank - b.rank)) {
      const cand = e.possible_account_ids ?? [];
      if (cand.length < 2 || cand.length > MAX_CANDIDATES) continue;
      if (ids.length + cand.length > MAX_LOOKUPS) break;
      ids.push(...cand);
    }
    return ids;
  }, [entries]);
  const ranks = usePlayerRanks(lookups);

  /** The account behind a leaderboard name: the only candidate, or the highest-ranked one. */
  const accountOf = (e: LeaderboardEntry): number | undefined => {
    const cand = e.possible_account_ids ?? [];
    if (cand.length <= 1) return cand[0];
    let best: { id: number; badge: number; at: number } | undefined;
    for (const id of cand) {
      const r = ranks.get(id);
      if (!r?.badge) continue;
      const at = r.last_match?.start_time ?? 0;
      if (!best || r.badge > best.badge || (r.badge === best.badge && at > best.at)) best = { id, badge: r.badge, at };
    }
    return best?.id;
  };

  const update = (next: { region?: Region; hero?: Hero | null }) => {
    const r = next.region ?? region;
    const h = next.hero === undefined ? hero : (next.hero ?? undefined);
    const p: Record<string, string> = {};
    if (r !== 'Europe') p.region = r;
    if (h) p.hero = h.slug;
    setParams(p, { replace: true });
  };

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('lb.eyebrow')}</span>
            <h1 className="display page-head__title">{t('lb.title')}</h1>
            <p className="page-head__sub muted">{t('lb.sub')}</p>
            <Link className="link-more page-head__wiki" to="/wiki/ranks">
              {t('wiki.link.ranks')}
            </Link>
          </div>
        </header>

        <div className="toolbar">
          <Segmented
            id="lb-region"
            value={region}
            onChange={(r) => update({ region: r })}
            options={REGIONS.map((r) => ({
              value: r,
              label: t(`lb.region.${r}` as MsgKey),
            }))}
          />
          <div className="toolbar__end">
            <HeroSelect value={hero} onChange={(h) => update({ hero: h ?? null })} />
          </div>
        </div>

        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <SkeletonRows rows={12} />
        ) : !entries.length ? (
          <Empty>{t('lb.empty')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data-table lb-table">
              <thead>
                <tr>
                  <th className="c-rank">#</th>
                  <th>{t('lb.player')}</th>
                  {showHeroes && <th>{t('lb.topHeroes')}</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const account = accountOf(e);
                  return (
                    <motion.tr
                      key={`${e.rank}-${e.account_name}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.012, 0.3) }}
                    >
                      <td className={`c-rank num lb-rank ${e.rank <= 3 ? `lb-rank--${e.rank}` : ''}`}>{e.rank}</td>
                      <td>
                        {account ? (
                          <Link to={`/players/${account}`} className="lb-name">
                            {e.account_name}
                          </Link>
                        ) : (
                          <span className="lb-name">{e.account_name}</span>
                        )}
                      </td>
                      {showHeroes && (
                        <td>
                          <div className="lb-heroes">
                            {(e.top_hero_ids ?? []).map((id) => {
                              const h = heroes.byId.get(id);
                              return h ? (
                                <Link key={id} to={`/heroes/${h.slug}`} title={h.name}>
                                  <HeroAvatar hero={h} size={28} />
                                </Link>
                              ) : null;
                            })}
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small-note">{t('lb.note')}</p>
      </div>
    </Page>
  );
}
