import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRanks } from '../hooks/useAssets';
import { useT } from '../i18n';
import { PERIOD_DAYS, RANK_OPTIONS, useFilters } from '../lib/filters';
import { Segmented } from './UI';

function RankSelect() {
  const { rank, setRank } = useFilters();
  const { t } = useT();
  const ranks = useRanks();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = RANK_OPTIONS.find((r) => r.id === rank)!;

  const rankOf = (tier: number) => ranks.data?.find((x) => x.tier === tier);
  const img = (tier: number) => {
    const r = rankOf(tier);
    return r?.images.small_webp ?? r?.images.large_webp ?? r?.images.small;
  };
  /** "Oracle+" for brackets, plain name for the top rank, localised via /assets/ranks */
  const label = (o: (typeof RANK_OPTIONS)[number]) => {
    if (o.tier === 0) return t('filter.allRanks');
    const name = rankOf(o.tier)?.name ?? o.fallback;
    return o.tier === 11 ? name : `${name}+`;
  };

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

  return (
    <div className="rank-select" ref={ref}>
      <button className="rank-select__btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {current.tier > 0 && img(current.tier) ? <img src={img(current.tier)} alt="" /> : <span className="rank-select__all">◈</span>}
        <span>{label(current)}</span>
        <svg viewBox="0 0 12 12" className={`chev ${open ? 'is-open' : ''}`} aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="rank-select__menu"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {RANK_OPTIONS.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025 }}>
                <button
                  role="option"
                  aria-selected={r.id === rank}
                  className={r.id === rank ? 'is-active' : ''}
                  onClick={() => {
                    setRank(r.id);
                    setOpen(false);
                  }}
                >
                  {r.tier > 0 && img(r.tier) ? <img src={img(r.tier)} alt="" /> : <span className="rank-select__all">◈</span>}
                  {label(r)}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Global stats filter (rank bracket + time window). Shared by every stats view via FilterProvider. */
export function FilterBar({ fetching }: { fetching?: boolean }) {
  const { days, setDays } = useFilters();
  const { t } = useT();
  return (
    <div className="filter-bar">
      <RankSelect />
      <Segmented id="period" value={days} onChange={setDays} options={PERIOD_DAYS.map((d) => ({ value: d as number, label: t('filter.days', { n: d }) }))} />
      <AnimatePresence>
        {fetching && (
          <motion.span className="filter-bar__sync" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="spinner" /> {t('filter.updating')}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
