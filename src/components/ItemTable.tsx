import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { ItemRow } from '../hooks/useHeroData';
import { useT } from '../i18n';
import { fmtCompact, fmtInt, fmtPct, fmtTime } from '../lib/format';
import { SLOTS, type Slot } from '../lib/items';
import { ItemIcon } from './ItemIcon';
import { Segmented } from './UI';
import { MeterBar, WinRate, WinRateBar } from './WinRate';

type SortKey = 'name' | 'winRate' | 'pickRate' | 'buy' | 'matches' | 'cost';

/** Sortable, filterable item stats table (used on hero pages and the items page). */
export function ItemTable({ rows }: { rows: ItemRow[] }) {
  const { t, meta } = useT();
  const [slot, setSlot] = useState<'all' | Slot>('all');
  const [tier, setTier] = useState<number>(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'pickRate', dir: -1 });

  const list = useMemo(() => {
    const v = (r: ItemRow): number | string =>
      sort.key === 'name'
        ? r.item.name
        : sort.key === 'buy'
          ? r.stat.avg_buy_time_s ?? 0
          : sort.key === 'matches'
            ? r.stat.matches
            : sort.key === 'cost'
              ? r.item.cost ?? 0
              : r[sort.key];
    return rows
      .filter((r) => (slot === 'all' || r.item.item_slot_type === slot) && (!tier || r.item.item_tier === tier))
      .sort((a, b) => {
        const va = v(a);
        const vb = v(b);
        return (typeof va === 'string' ? va.localeCompare(vb as string, meta.locale) : (va as number) - (vb as number)) * sort.dir;
      });
  }, [rows, slot, tier, sort, meta.locale]);

  const maxPick = Math.max(0.01, ...list.map((r) => r.pickRate));
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' || key === 'buy' ? 1 : -1 }));
  const th = (key: SortKey, label: string, className = '') => (
    <th className={`${className} is-sortable ${sort.key === key ? 'is-sorted' : ''}`}>
      <button onClick={() => toggle(key)}>
        {label}
        <span className={`sort-arrow ${sort.key === key ? (sort.dir === 1 ? 'is-asc' : 'is-desc') : ''}`} aria-hidden />
      </button>
    </th>
  );

  return (
    <>
      <div className="toolbar">
        <Segmented
          id="item-slot"
          value={slot}
          onChange={setSlot}
          options={[
            { value: 'all', label: t('item.all') },
            ...SLOTS.map((s) => ({
              value: s,
              label: <span className={`slot-label slot-${s}`}>{t(`slot.${s}`)}</span>,
            })),
          ]}
        />
        <Segmented
          id="item-tier"
          value={tier}
          onChange={setTier}
          options={[{ value: 0, label: t('item.allTiers') }, ...[1, 2, 3, 4].map((n) => ({ value: n, label: t('item.tierShort', { n }) }))]}
        />
      </div>
      <div className="table-wrap">
        <table className="data-table items-table">
          <thead>
            <tr>
              {th('name', t('stat.item'))}
              {th('cost', t('stat.cost'), 'hide-sm')}
              {th('winRate', t('stat.winRate'), 'c-wr')}
              {th('pickRate', t('stat.pickRate'), 'c-pr')}
              {th('buy', t('stat.avgBuy'), 'hide-sm')}
              {th('matches', t('stat.matches'), 'hide-md')}
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <motion.tr
                key={r.item.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.012, 0.3), layout: { duration: 0.35 } }}
              >
                <td>
                  <div className="item-cell">
                    <ItemIcon item={r.item} stat={r.stat} pickRate={r.pickRate} size="sm" />
                    <div>
                      <div className="item-cell__name">{r.item.name}</div>
                      <div className={`item-cell__sub slot-text-${r.item.item_slot_type}`}>
                        {t(`slot.${r.item.item_slot_type as Slot}`)} · {t('item.tierShort', { n: r.item.item_tier ?? 0 })}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hide-sm num souls">{r.item.cost ? fmtInt(r.item.cost) : '—'}</td>
                <td className="c-wr">
                  <div className="cell-bar">
                    <WinRate value={r.winRate} />
                    <WinRateBar value={r.winRate} spread={0.12} />
                  </div>
                </td>
                <td className="c-pr">
                  <div className="cell-bar">
                    <span className="num">{fmtPct(r.pickRate)}</span>
                    <MeterBar value={r.pickRate} max={maxPick} tone={r.item.item_slot_type as Slot} />
                  </div>
                </td>
                <td className="hide-sm num muted">{r.stat.avg_buy_time_s ? fmtTime(r.stat.avg_buy_time_s) : '—'}</td>
                <td className="hide-md num muted">{fmtCompact(r.stat.matches)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small-note">{t('item.biasNote')}</p>
    </>
  );
}
