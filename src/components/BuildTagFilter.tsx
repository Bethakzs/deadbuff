import { useBuildTags } from '../hooks/useAssets';
import { useT } from '../i18n';

/**
 * Build-tag chips ("For Advanced Players", "Spirit", …) — the same icons authors pin to builds in-game.
 * Used by the hero Builds tab and the global build browser. The selected id is sent to the API as
 * `tag`, so filtering is server-side and stays correct across every page of results.
 */
export function BuildTagFilter({ value, onChange }: { value?: number; onChange: (id?: number) => void }) {
  const { t } = useT();
  const tags = useBuildTags();
  const list = [...tags.values()];
  if (!list.length) return null;
  return (
    <div className="tag-filter" role="radiogroup" aria-label={t('hb.tagsLabel')}>
      <span className="tag-filter__label eyebrow">{t('hb.tagsLabel')}</span>
      <button role="radio" aria-checked={value === undefined} className={`tag-chip ${value === undefined ? 'is-active' : ''}`} onClick={() => onChange(undefined)}>
        {t('hb.tagsAll')}
      </button>
      {list.map((tag) => (
        <button
          key={tag.id}
          role="radio"
          aria-checked={value === tag.id}
          className={`tag-chip ${value === tag.id ? 'is-active' : ''}`}
          onClick={() => onChange(value === tag.id ? undefined : tag.id)}
        >
          <img src={tag.icon} alt="" />
          {tag.label}
        </button>
      ))}
    </div>
  );
}
