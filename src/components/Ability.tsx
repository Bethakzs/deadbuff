import { useT } from '../i18n';
import { trimDot } from '../lib/html';
import { abilityKeyStats, abilityUpgrades, UPGRADE_POINTS } from '../lib/items';
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
      <Html html={ability.description?.desc} className="ability-tt__desc" />
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

/** Full ability panel for the hero page: icon, description, key numbers, T1/T2/T3 upgrades. */
export function AbilityCard({ ability, index }: { ability: Item; index: number }) {
  const { t } = useT();
  const stats = abilityKeyStats(ability);
  const ups = abilityUpgrades(ability);
  return (
    <article className="ability-card">
      <header className="ability-card__head">
        <AbilityGlyph ability={ability} size="lg" index={index} />
        <div className="ability-card__title">
          <span className="eyebrow">{index === 3 ? t('ability.ultimate') : t('ability.n', { n: index + 1 })}</span>
          <h3 className="display">{ability.name}</h3>
          {ability.description?.quip && <p className="serif ability-card__quip">{trimDot(ability.description.quip)}</p>}
        </div>
      </header>

      <Html html={ability.description?.desc ?? ability.description?.active ?? ability.description?.passive} className="ability-card__desc" />

      {stats.length > 0 && (
        <ul className="ability-card__stats">
          {stats.map((s) => (
            <li key={s.key} className={s.css ? `prop-${s.css}` : ''}>
              {s.icon && <img src={s.icon} alt="" />}
              <span className="ability-card__stat-value num">{s.value}</span>
              <span className="ability-card__stat-label">{s.label}</span>
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
    </article>
  );
}
