import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { ItemIcon } from '../components/ItemIcon';
import { ItemTable } from '../components/ItemTable';
import { ErrorState, Page, Segmented, SkeletonRows } from '../components/UI';
import { WinRate } from '../components/WinRate';
import { useItems } from '../hooks/useAssets';
import { useHeroItemRows, type ItemRow } from '../hooks/useHeroData';
import { useT } from '../i18n';
import { useDocumentMeta } from '../lib/seo';
import { fmtInt, fmtPct } from '../lib/format';
import { SLOTS, TIER_COST, TIER_ROMAN, type Slot } from '../lib/items';

function Shop({ rows }: { rows: ItemRow[] }) {
  const { t } = useT();
  const { shop } = useItems();
  const [slot, setSlot] = useState<Slot>('weapon');
  const statById = useMemo(() => new Map(rows.map((r) => [r.item.id, r])), [rows]);
  const tiers = [1, 2, 3, 4].map((tier) =>
    shop
      .filter((i) => i.item_slot_type === slot && (tier === 4 ? (i.item_tier ?? 0) >= 4 : i.item_tier === tier))
      .sort((a, b) => (statById.get(b.id)?.winRate ?? 0) - (statById.get(a.id)?.winRate ?? 0)),
  );

  return (
    <div className={`shop shop--${slot}`}>
      <div className="shop__tabs">
        {SLOTS.map((s) => (
          <button key={s} className={`shop__tab slot-${s} ${slot === s ? 'is-active' : ''}`} onClick={() => setSlot(s)}>
            {slot === s && <motion.span layoutId="shop-tab" className="shop__tab-bg" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            <span>{t(`slot.${s}`)}</span>
          </button>
        ))}
      </div>
      <div className="shop__cols">
        {tiers.map((list, ti) => (
          <section key={`${slot}-${ti}`} className="shop__col">
            <header>
              <span className="display">{t('item.tier', { roman: TIER_ROMAN[ti + 1] })}</span>
              <span className="souls num">{fmtInt(TIER_COST[ti + 1])}</span>
            </header>
            <div className="shop__items">
              {list.map((it, i) => {
                const r = statById.get(it.id);
                return (
                  <motion.div
                    key={it.id}
                    className="shop-item"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: ti * 0.05 + i * 0.015, duration: 0.3 }}
                  >
                    <ItemIcon item={it} stat={r?.stat} pickRate={r?.pickRate} />
                    <div className="shop-item__text">
                      <span className="shop-item__name">{it.name}</span>
                      {r ? (
                        <span className="shop-item__stats">
                          <WinRate value={r.winRate} />
                          <span className="muted num">{fmtPct(r.pickRate)}</span>
                        </span>
                      ) : (
                        <span className="muted shop-item__stats">{t('state.noData')}</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ItemsPage() {
  const { t } = useT();
  useDocumentMeta(t('meta.items'), t('meta.desc.items'));
  const { rows, isLoading, isFetching, error } = useHeroItemRows(undefined);
  const [view, setView] = useState<'shop' | 'table'>('shop');

  return (
    <Page>
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('items.eyebrow')}</span>
            <h1 className="display page-head__title">{t('items.title')}</h1>
            <p className="page-head__sub muted">{t('items.sub')}</p>
          </div>
          <FilterBar fetching={isFetching && !isLoading} />
        </header>
        <div className="toolbar">
          <Segmented
            id="items-view"
            value={view}
            onChange={setView}
            options={[
              { value: 'shop', label: t('items.shopView') },
              { value: 'table', label: t('items.tableView') },
            ]}
          />
        </div>
        {error ? <ErrorState error={error} /> : isLoading ? <SkeletonRows rows={10} /> : view === 'shop' ? <Shop rows={rows} /> : <ItemTable rows={rows} />}
      </div>
    </Page>
  );
}
