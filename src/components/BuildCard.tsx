import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useBuildTags, useItems } from '../hooks/useAssets';
import { useT } from '../i18n';
import { fmtCompact } from '../lib/format';
import { itemImage } from '../lib/items';
import type { Hero, HeroBuild, HeroBuildStat, Item, SteamProfile } from '../lib/types';
import { AbilityOrderGrid } from './AbilityOrderGrid';
import { FavButton } from './FavButton';
import { HeroAvatar } from './HeroChip';
import { ItemIcon } from './ItemIcon';
import { Tooltip } from './Tooltip';
import { WinRate } from './WinRate';

/** Ability points spent in order (currency_type 1 = ability points; the first point in a skill unlocks it). */
export function buildAbilityOrder(build: HeroBuild): number[] {
  return (build.hero_build.details.ability_order?.currency_changes ?? [])
    .filter((c) => c.currency_type === 1 && c.delta < 0)
    .map((c) => c.ability_id);
}

/** First N unique shop items in build order — used as the collapsed preview. */
export function buildKeyItems(build: HeroBuild, byId: Map<number, Item>, max = 12): Item[] {
  const seen = new Set<number>();
  const out: Item[] = [];
  for (const cat of build.hero_build.details.mod_categories) {
    for (const m of cat.mods) {
      const it = byId.get(m.ability_id);
      if (!it || seen.has(it.id) || it.type !== 'upgrade') continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= max) return out;
    }
  }
  return out;
}

interface PinnedIcon {
  id: number;
  label: string;
  icon: string;
  /** css modifier: tag (svg glyph), ability (white glyph), or the item slot colour */
  kind: string;
}

/**
 * The (up to) three icons a build author pins in-game to say what the build is about.
 * Each id is a build tag ("Spirit", "For New Players"…), an item or an ability.
 */
function BuildTagIcons({ ids }: { ids: number[] }) {
  const tags = useBuildTags();
  const { byId } = useItems();
  const pinned = useMemo(() => {
    const out: PinnedIcon[] = [];
    for (const id of new Set(ids.filter(Boolean))) {
      const tag = tags.get(id);
      const it = byId.get(id);
      if (tag) out.push({ id, label: tag.label, icon: tag.icon, kind: 'tag' });
      else if (it?.type === 'upgrade') out.push({ id, label: it.name, icon: itemImage(it), kind: `item slot-${it.item_slot_type}` });
      else if (it) out.push({ id, label: it.name, icon: it.image_webp ?? it.image ?? '', kind: 'ability' });
    }
    return out.slice(0, 3);
  }, [ids, tags, byId]);

  if (!pinned.length) return null;
  return (
    <span className="build-tags">
      {pinned.map((p) => (
        <Tooltip key={p.id} content={p.label}>
          <span className={`build-tag build-tag--${p.kind}`}>
            <img src={p.icon} alt={p.label} loading="lazy" />
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

interface Props {
  build: HeroBuild;
  stat?: HeroBuildStat;
  profile?: SteamProfile;
  abilities?: Item[];
  hero?: Hero;
  rank?: number;
  defaultOpen?: boolean;
}

export function BuildCard({ build, stat, profile, abilities, hero, rank, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const { byId } = useItems();
  const { t, ago } = useT();
  const b = build.hero_build;
  const order = useMemo(() => buildAbilityOrder(build), [build]);
  const preview = useMemo(() => buildKeyItems(build, byId, 10), [build, byId]);
  const totalItems = b.details.mod_categories.reduce((a, c) => a + c.mods.length, 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(b.hero_build_id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <motion.article layout="position" className={`build-card ${open ? 'is-open' : ''}`}>
      <header className="build-card__head" onClick={() => setOpen((o) => !o)}>
        {rank !== undefined && <span className="build-card__rank num">{String(rank).padStart(2, '0')}</span>}
        {hero && <HeroAvatar hero={hero} size={40} />}
        <div className="build-card__title">
          <div className="build-card__name-row">
            <BuildTagIcons ids={b.tags ?? []} />
            <h3>{b.name || t('build.untitled')}</h3>
          </div>
          <div className="build-card__meta">
            {profile ? (
              <span className="build-card__author">
                {profile.avatar && <img src={profile.avatar} alt="" />}
                {profile.personaname}
              </span>
            ) : (
              <span className="build-card__author muted">{t('build.author', { id: b.author_account_id })}</span>
            )}
            <span>v{b.version}</span>
            <span>{t('build.updated', { ago: ago(b.last_updated_timestamp) })}</span>
            {stat && build.num_weekly_favorites ? <span>{t('build.thisWeek', { n: fmtCompact(build.num_weekly_favorites) })}</span> : null}
          </div>
        </div>
        <div className="build-card__stats">
          {stat ? (
            <>
              <div>
                <WinRate value={stat.wins / stat.matches} />
                <small>{t('stat.winLower')}</small>
              </div>
              <div>
                <span className="num">{fmtCompact(stat.matches)}</span>
                <small>{t('stat.matchesLower')}</small>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="num build-card__fav">★ {fmtCompact(build.num_weekly_favorites ?? 0)}</span>
                <small>{t('build.weeklyFavs')}</small>
              </div>
              {build.num_favorites ? (
                <div className="hide-sm">
                  <span className="num">{fmtCompact(build.num_favorites)}</span>
                  <small>{t('build.allTime')}</small>
                </div>
              ) : null}
            </>
          )}
        </div>
        <FavButton kind="build" id={b.hero_build_id} />
        <button className="build-card__toggle" aria-expanded={open} aria-label={t(open ? 'build.collapse' : 'build.expand')}>
          <svg viewBox="0 0 12 12" aria-hidden>
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </header>

      {!open && (
        <div className="build-card__preview">
          {preview.map((it) => (
            <ItemIcon key={it.id} item={it} size="sm" />
          ))}
          {totalItems > preview.length && <span className="build-card__more">+{totalItems - preview.length}</span>}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="build-card__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="build-card__inner">
              {b.description && <p className="build-card__desc">{b.description}</p>}

              <div className="build-card__cats">
                {b.details.mod_categories
                  .filter((c) => c.mods.length)
                  .map((cat, ci) => (
                    <section key={ci} className="build-cat">
                      <header>
                        <h4>{cat.name || t('build.section', { n: ci + 1 })}</h4>
                        {cat.description && <p>{cat.description}</p>}
                      </header>
                      <div className="build-cat__items">
                        {cat.mods.map((m, mi) => (
                          <ItemIcon key={`${m.ability_id}-${mi}`} item={byId.get(m.ability_id)} annotation={m.annotation} size="md" />
                        ))}
                      </div>
                    </section>
                  ))}
              </div>

              {abilities && abilities.length === 4 && order.length > 0 && (
                <div className="build-card__order">
                  <h4 className="eyebrow">{t('build.abilityOrder')}</h4>
                  <AbilityOrderGrid abilities={abilities} order={order} />
                </div>
              )}

              <footer className="build-card__foot">
                <button className="btn btn--brass" onClick={copy}>
                  {copied ? t('build.copied') : t('build.copy', { id: b.hero_build_id })}
                </button>
                <span className="muted">{t('build.copyHint')}</span>
              </footer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
