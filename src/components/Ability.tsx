import { AnimatePresence, motion } from 'framer-motion';
import { useId, useState } from 'react';
import { useT } from '../i18n';
import { stripHtml, trimDot } from '../lib/html';
import { abilityDescription, abilityKeyStats, abilityOwnText, abilityUpgrades, UPGRADE_POINTS } from '../lib/items';
import type { Item } from '../lib/types';
import { Html } from './Html';
import { Tooltip } from './Tooltip';

export function AbilityGlyph({ ability, size = 'md', index }: { ability: Item; size?: 'xs' | 'sm' | 'md' | 'lg'; index?: number }) {
  const { t } = useT();
  return (
    <span className={`ability-glyph ability-glyph--${size} ${ability.ability_type === 'ultimate' ? 'is-ult' : ''}`}>
      <img src={ability.image_webp ?? ability.image} alt={ability.name} loading="lazy" />
      {index !== undefined && <span className="ability-glyph__key">{index === 3 ? t('ability.ultShort') : index + 1}</span>}
    </span>
  );
}

function AbilityTooltipCard({ ability }: { ability: Item }) {
  const stats = abilityKeyStats(ability, 4);
  return (
    <div className="ability-tt">
      <div className="ability-tt__name">{ability.name}</div>
      {stats.length > 0 && (
        <div className="ability-tt__stats">
          {stats.map((s) => (
            <span key={s.key}>
              {s.label} <b className="num">{s.value}</b>
            </span>
          ))}
        </div>
      )}
      <Html html={abilityDescription(ability)} className="ability-tt__desc" />
    </div>
  );
}

export function AbilityIcon({ ability, size = 'sm', index }: { ability?: Item; size?: 'xs' | 'sm' | 'md' | 'lg'; index?: number }) {
  if (!ability) return null;
  return (
    <Tooltip variant="card" content={<AbilityTooltipCard ability={ability} />}>
      <AbilityGlyph ability={ability} size={size} index={index} />
    </Tooltip>
  );
}

/** One short line under the ability name: the in-game quip, else the start of the description. */
function previewText(ability: Item): string {
  const quip = ability.description?.quip;
  if (quip) return trimDot(quip);
  const plain = stripHtml(abilityOwnText(ability));
  const firstSentence = plain.match(/^[^.!?]+[.!?]?/)?.[0] ?? plain;
  return trimDot(firstSentence.trim());
}

/**
 * Hero-page ability panel. Collapsed it shows only the icon, name and a one-line preview
 * (owner's request); clicking the header reveals the full description, key numbers and the
 * T1/T2/T3 upgrades. The chevron shows that the card opens.
 */
export function AbilityCard({ ability, index }: { ability: Item; index: number }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const stats = abilityKeyStats(ability);
  const ups = abilityUpgrades(ability);
  const preview = previewText(ability);

  // an open card closes from anywhere, not only from its head — but never while text is being selected
  const closeOnClick = () => {
    if (open && !window.getSelection()?.toString()) setOpen(false);
  };

  return (
    <article className={`ability-card ${open ? 'is-open' : ''}`}>
      <button
        className="ability-card__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        title={t(open ? 'ability.collapse' : 'ability.expand')}
      >
        <AbilityGlyph ability={ability} size="lg" index={index} />
        <div className="ability-card__title">
          <span className="eyebrow">{index === 3 ? t('ability.ultimate') : t('ability.n', { n: index + 1 })}</span>
          <h3 className="display">{ability.name}</h3>
          {/* always rendered (even when empty) so every collapsed card is the same height */}
          <p className="serif ability-card__quip">{preview}</p>
        </div>
        <svg viewBox="0 0 12 12" className={`chev ability-card__chev ${open ? 'is-open' : ''}`} aria-hidden>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            className="ability-card__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
            <div className="ability-card__inner" onClick={closeOnClick}>
              <Html html={abilityDescription(ability)} className="ability-card__desc" />

              {stats.length > 0 && (
                <ul className="ability-card__stats">
                  {stats.map((st) => (
                    <li key={st.key} className={st.css ? `prop-${st.css}` : ''}>
                      {st.icon && <img src={st.icon} alt="" />}
                      <span className="ability-card__stat-value num">{st.value}</span>
                      <span className="ability-card__stat-label">{st.label}</span>
                    </li>
                  ))}
                </ul>
              )}

              <ol className="ability-card__upgrades">
                {ups.map((u, i) =>
                  u ? (
                    <li key={i}>
                      <span className="upgrade-pip">
                        <b>T{i + 1}</b>
                        <small>{t('ability.ap', { n: UPGRADE_POINTS[i] })}</small>
                      </span>
                      <Html html={u} as="span" />
                    </li>
                  ) : null,
                )}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
