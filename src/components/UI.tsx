import { animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../i18n';
import type { Tier } from '../lib/heroes';

/* ----------------------------- section title ---------------------------- */
export function SectionTitle({ eyebrow, title, right, id }: { eyebrow?: string; title: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="section-title" id={id}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="display">{title}</h2>
      </div>
      <span className="section-title__rule" aria-hidden />
      {right && <div className="section-title__right">{right}</div>}
    </div>
  );
}

/* --------------------------------- panel -------------------------------- */
export function Panel({
  children,
  className = '',
  title,
  right,
  style,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  right?: ReactNode;
  /** only for CSS custom properties (e.g. a lane colour) */
  style?: CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title && (
        <header className="panel__head">
          <h3 className="panel__title">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------- tier badge ----------------------------- */
export function TierBadge({ tier, size = 'md' }: { tier: Tier; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`tier tier--${tier} tier--${size}`}>{tier}</span>;
}

/* -------------------------------- skeleton ------------------------------ */
export function Skeleton({ w = '100%', h = 16, r = 6, className = '' }: { w?: number | string; h?: number | string; r?: number; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: r }} />;
}

export function SkeletonRows({ rows = 8, h = 52 }: { rows?: number; h?: number }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} r={8} />
      ))}
    </div>
  );
}

/* ------------------------------- error state ---------------------------- */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT();
  const msg = error instanceof Error ? error.message : '';
  return (
    <div className="error-state">
      <span className="error-state__sigil" aria-hidden>
        ✕
      </span>
      <div>
        <strong>{t('state.errorTitle')}</strong>
        <p className="muted">{t('state.errorText')}</p>
        {msg && <code className="error-state__code">{msg}</code>}
      </div>
      {onRetry && (
        <button className="btn btn--ghost" onClick={onRetry}>
          {t('state.retry')}
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ------------------------------ count-up number ------------------------- */
export function CountUp({ value, format, duration = 1.1 }: { value: number; format: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, duration, mv]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

/* ---------------------------- segmented control ------------------------- */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  id,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className={`segmented__btn ${o.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.value === value && (
            <motion.span layoutId={`seg-${id}`} className="segmented__pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className="segmented__label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ page wrapper ---------------------------- */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.main
      className={`page ${className}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.main>
  );
}

/** Small diamond ornament used in headings and separators. */
export const Diamond = () => (
  <svg className="diamond" viewBox="0 0 10 10" aria-hidden>
    <path d="M5 0 10 5 5 10 0 5Z" />
  </svg>
);
