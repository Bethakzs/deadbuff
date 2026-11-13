import { motion } from 'framer-motion';
import type { Item } from '../lib/types';
import { AbilityIcon } from './Ability';

const MARK = ['◆', 'I', 'II', 'III'];

/**
 * Dotabuff-style skill order grid. Rows = the hero's 4 abilities, columns = ability-point steps.
 * The first point in an ability unlocks it (◆), the next three buy T1/T2/T3 (I, II, III).
 */
export function AbilityOrderGrid({ abilities, order, compact }: { abilities: Item[]; order: number[]; compact?: boolean }) {
  const counts = new Map<number, number>();
  const marks = order.map((id) => {
    const n = counts.get(id) ?? 0;
    counts.set(id, n + 1);
    return { id, mark: MARK[n] ?? '' };
  });
  const steps = Math.max(order.length, 12);

  return (
    <div className={`skill-grid ${compact ? 'is-compact' : ''}`} style={{ ['--steps' as string]: steps }}>
      {abilities.map((ab, row) => (
        <div className="skill-grid__row" key={ab.id}>
          <div className="skill-grid__label">
            <AbilityIcon ability={ab} size="xs" index={row} />
            {!compact && <span className="skill-grid__name">{ab.name}</span>}
          </div>
          <div className="skill-grid__cells">
            {Array.from({ length: steps }, (_, i) => {
              const m = marks[i];
              const hit = m && m.id === ab.id;
              return (
                <motion.span
                  key={i}
                  className={`skill-grid__cell ${hit ? `is-hit r${row}` : ''} ${hit && m.mark === '◆' ? 'is-unlock' : ''}`}
                  initial={hit ? { scale: 0.4, opacity: 0 } : false}
                  animate={hit ? { scale: 1, opacity: 1 } : undefined}
                  transition={{ delay: i * 0.025, duration: 0.25 }}
                >
                  {hit ? m.mark : ''}
                </motion.span>
              );
            })}
          </div>
        </div>
      ))}
      {!compact && (
        <div className="skill-grid__row skill-grid__steps" aria-hidden>
          <div className="skill-grid__label" />
          <div className="skill-grid__cells">
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className="skill-grid__step num">
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
