import { motion } from 'framer-motion';
import { Panel } from '../../components/UI';
import { useT } from '../../i18n';
import { trimDot } from '../../lib/html';
import type { Hero } from '../../lib/types';

export function HeroLore({ hero }: { hero: Hero }) {
  const { t } = useT();
  const art = hero.images.hero_card_gloat_webp ?? hero.images.icon_hero_card_webp;
  const paragraphs = (hero.description.lore ?? '').split(/\n+/).filter(Boolean);
  return (
    <div className="lore">
      <motion.figure className="lore__art" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
        {art && <img src={art} alt={hero.name} />}
      </motion.figure>
      <div className="lore__text">
        <span className="eyebrow">{t('lore.dossier')}</span>
        <h2 className="display lore__title">{t('lore.title', { name: hero.name })}</h2>
        {paragraphs.length ? (
          paragraphs.map((p, i) => (
            <motion.p key={i} className="lore__p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
              {/* site style: the text block ends without a full stop */}
              {i === paragraphs.length - 1 ? trimDot(p.trim()) : p}
            </motion.p>
          ))
        ) : (
          <p className="muted">{t('lore.empty')}</p>
        )}
        {hero.description.playstyle && (
          <Panel title={t('lore.playstyle')} className="lore__playstyle">
            <p>{trimDot(hero.description.playstyle.trim())}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
