import { useT, type MsgKey } from '../i18n';
import { fmtInt, fmtPct, fmtTime } from '../lib/format';
import { TIER_ROMAN, itemImage, itemTooltip, type Slot } from '../lib/items';
import type { Item, ItemStat } from '../lib/types';
import { Html } from './Html';
import { Tooltip } from './Tooltip';
import { WinRate } from './WinRate';

const SECTION_KEYS: Record<string, MsgKey> = {
  innate: 'item.section.innate',
  passive: 'item.section.passive',
  active: 'item.section.active',
};

export function ItemCard({ item, stat, pickRate }: { item: Item; stat?: ItemStat; pickRate?: number }) {
  const { t } = useT();
  const slot = (item.item_slot_type ?? 'weapon') as Slot;
  const { stats, sections } = itemTooltip(item);
  return (
    <div className={`item-card slot-${slot}`}>
      <header className="item-card__head">
        <img src={itemImage(item)} alt="" className="item-card__img" />
        <div>
          <div className="item-card__name">{item.name}</div>
          <div className="item-card__meta">
            <span className="item-card__slot">{t(`slot.${slot}`)}</span>
            {item.item_tier && <span>{t('item.tier', { roman: TIER_ROMAN[item.item_tier] })}</span>}
            {item.cost ? <span className="souls num">{fmtInt(item.cost)}</span> : null}
          </div>
        </div>
      </header>
      {stats.length > 0 && (
        <ul className="item-card__stats">
          {stats.slice(0, 8).map((s) => (
            <li key={s.key}>
              <span className="num">{s.value}</span> {s.label}
            </li>
          ))}
        </ul>
      )}
      {sections.slice(0, 2).map((sec, i) => (
        <div key={i} className={`item-card__section is-${sec.type}`}>
          <span className="item-card__tag">{SECTION_KEYS[sec.type] ? t(SECTION_KEYS[sec.type]) : sec.type}</span>
          <Html html={sec.html} />
          {sec.stats.length > 0 && (
            <ul className="item-card__chips">
              {sec.stats.slice(0, 6).map((s) => (
                <li key={s.key}>
                  {s.label} <b className="num">{s.value}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {stat && (
        <footer className="item-card__foot">
          <span>
            {t('item.footWin')} <WinRate value={stat.wins / stat.matches} />
          </span>
          {pickRate !== undefined && (
            <span>
              {t('item.footPick')} {fmtPct(pickRate)}
            </span>
          )}
          {stat.avg_buy_time_s ? <span>{t('item.footBuy', { t: fmtTime(stat.avg_buy_time_s) })}</span> : null}
        </footer>
      )}
    </div>
  );
}

interface IconProps {
  item?: Item;
  size?: 'sm' | 'md' | 'lg';
  stat?: ItemStat;
  pickRate?: number;
  annotation?: string | null;
  showName?: boolean;
}

/** Square item icon with slot colour frame + tier pips and a rich tooltip. */
export function ItemIcon({ item, size = 'md', stat, pickRate, annotation, showName }: IconProps) {
  const { t } = useT();
  if (!item) return <span className={`item-icon item-icon--${size} is-missing`} />;
  const slot = item.item_slot_type ?? 'weapon';
  return (
    <Tooltip variant="card" content={<ItemCard item={item} stat={stat} pickRate={pickRate} />}>
      <span className={`item-icon item-icon--${size} slot-${slot}`}>
        <img src={itemImage(item)} alt={item.name} loading="lazy" decoding="async" />
        {item.item_tier ? (
          <span className="item-icon__tier" aria-hidden>
            {Array.from({ length: item.item_tier }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        ) : null}
        {item.is_active_item && <span className="item-icon__active" title={t('item.activeItem')} />}
        {annotation ? (
          <span className="item-icon__note" title={annotation}>
            !
          </span>
        ) : null}
      </span>
      {showName && <span className="item-icon__name">{item.name}</span>}
    </Tooltip>
  );
}
