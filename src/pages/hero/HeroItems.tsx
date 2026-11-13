import { ItemTable } from '../../components/ItemTable';
import { ErrorState, SectionTitle, SkeletonRows } from '../../components/UI';
import { useHeroItemRows } from '../../hooks/useHeroData';
import { useT } from '../../i18n';
import type { Hero } from '../../lib/types';

export function HeroItems({ hero }: { hero: Hero }) {
  const { t } = useT();
  const { rows, isLoading, error } = useHeroItemRows(hero.id);
  return (
    <div>
      <SectionTitle eyebrow={t('hi.eyebrow', { name: hero.name })} title={t('hi.title')} />
      {error ? <ErrorState error={error} /> : isLoading ? <SkeletonRows rows={10} /> : <ItemTable rows={rows} />}
    </div>
  );
}
