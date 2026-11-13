import { motion } from 'framer-motion';
import { fmtDelta, fmtPct, wrTone } from '../lib/format';

export function WinRate({ value, digits = 1, className = '' }: { value: number; digits?: number; className?: string }) {
  return <span className={`wr wr--${wrTone(value)} num ${className}`}>{fmtPct(value, digits)}</span>;
}

export function Delta({ value }: { value: number }) {
  const tone = value > 0.005 ? 'great' : value < -0.005 ? 'awful' : 'even';
  return <span className={`wr wr--${tone} num delta`}>{fmtDelta(value)}</span>;
}

/**
 * Horizontal bar centred on 50%: fills right (green) above, left (red) below.
 * `spread` = the win-rate distance that fills half of the bar.
 */
export function WinRateBar({ value, spread = 0.06 }: { value: number; spread?: number }) {
  const d = Math.max(-1, Math.min(1, (value - 0.5) / spread));
  const width = Math.abs(d) * 50;
  return (
    <span className="wr-bar" aria-hidden>
      <span className="wr-bar__mid" />
      <motion.span
        className={`wr-bar__fill ${d >= 0 ? 'is-up' : 'is-down'}`}
        style={d >= 0 ? { left: '50%' } : { right: '50%' }}
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}

/** Simple 0..max bar (pick rate, usage). */
export function MeterBar({ value, max, tone = 'brass' }: { value: number; max: number; tone?: 'brass' | 'weapon' | 'vitality' | 'spirit' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className={`meter meter--${tone}`} aria-hidden>
      <motion.span
        className="meter__fill"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}
