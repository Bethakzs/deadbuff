import { motion } from 'framer-motion';
import { useT, type MsgKey } from '../i18n';
import { heroPositions, ROLE_KEYS, type RoleKey, type RoleScores } from '../lib/roles';
import type { Hero } from '../lib/types';
import { Segmented } from './UI';

/*
 * Positions are secondary info: monochrome in lists, tables, cards and filters.
 * Only the hero profile (header chips + the positions panel) shows them in colour
 * (`colored`): carry yellow · playmaker red · pick blue · support green.
 */

const label = (r: RoleKey): MsgKey => `pos.${r}` as MsgKey;
const hint = (r: RoleKey): MsgKey => `pos.hint.${r}` as MsgKey;

export function PositionChip({ role, compact, colored }: { role: RoleKey; compact?: boolean; colored?: boolean }) {
  const { t } = useT();
  return (
    <span
      className={`pos-chip ${compact ? 'pos-chip--compact' : ''} ${colored ? `pos-chip--color pos--${role}` : ''}`}
      title={t(hint(role))}
    >
      {colored && <i aria-hidden />}
      {t(label(role))}
    </span>
  );
}

/** The hero's main positions (strongest first). Renders nothing for an unrated/undecided hero. */
export function PositionChips({ hero, max = 2, compact, colored }: { hero: Hero; max?: number; compact?: boolean; colored?: boolean }) {
  const roles = heroPositions(hero).slice(0, max);
  if (!roles.length) return null;
  return (
    <span className="pos-chips">
      {roles.map((r) => (
        <PositionChip key={r} role={r} compact={compact} colored={colored} />
      ))}
    </span>
  );
}

export type PositionValue = RoleKey | 'all';

/** "All positions | Carry | Playmaker | Pick | Support" filter. */
export function PositionFilter({ value, onChange, id }: { value: PositionValue; onChange: (v: PositionValue) => void; id: string }) {
  const { t } = useT();
  return (
    <Segmented<PositionValue>
      id={id}
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: t('pos.all') },
        ...ROLE_KEYS.map((r) => ({
          value: r as PositionValue,
          label: <span title={t(hint(r))}>{t(label(r))}</span>,
        })),
      ]}
    />
  );
}

/** Dota-style role bars, 0–10 each (strong roles ≥ 7 are brighter). */
export function RoleBars({ scores, colored }: { scores: RoleScores; colored?: boolean }) {
  const { t } = useT();
  return (
    <ul className={`role-bars ${colored ? 'role-bars--color' : ''}`}>
      {ROLE_KEYS.map((r, i) => (
        <li key={r} className={`${scores[r] >= 7 ? 'is-strong' : ''} ${colored ? `pos--${r}` : ''}`} title={t(hint(r))}>
          <span className="role-bars__label">
            {colored && <i aria-hidden />}
            {t(label(r))}
          </span>
          <span className="role-bars__track">
            <motion.span
              className="role-bars__fill"
              initial={{ width: 0 }}
              animate={{ width: `${scores[r] * 10}%` }}
              transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            />
            {Array.from({ length: 9 }, (_, n) => (
              <span key={n} className="role-bars__tick" style={{ left: `${(n + 1) * 10}%` }} />
            ))}
          </span>
          <b className="role-bars__value num">{scores[r]}</b>
        </li>
      ))}
    </ul>
  );
}
