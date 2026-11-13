import { motion } from 'framer-motion';
import { useT } from '../i18n';
import { useFavorites, type FavKind } from '../lib/favorites';

const STAR = 'M12 2.6l2.82 5.72 6.31.92-4.57 4.45 1.08 6.29L12 17.02l-5.64 2.96 1.08-6.29-4.57-4.45 6.31-.92z';

/**
 * Star toggle for a favourite hero / build. `label` shows text next to the star (hero header);
 * without it the button is an icon (build cards). Clicks never reach a parent (build card headers toggle on click).
 */
export function FavButton({ kind, id, label = false }: { kind: FavKind; id: number; label?: boolean }) {
  const { t } = useT();
  const { has, toggle } = useFavorites();
  const on = has(kind, id);
  const text = t(on ? 'fav.remove' : 'fav.add');
  return (
    <button
      type="button"
      className={`fav-btn ${label ? 'fav-btn--label' : ''} ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={text}
      title={text}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(kind, id);
      }}
    >
      <motion.svg
        key={on ? 'on' : 'off'}
        viewBox="0 0 24 24"
        aria-hidden
        initial={{ scale: on ? 0.6 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18 }}
      >
        <path d={STAR} />
      </motion.svg>
      {label && <span>{t(on ? 'fav.saved' : 'fav.save')}</span>}
    </button>
  );
}
