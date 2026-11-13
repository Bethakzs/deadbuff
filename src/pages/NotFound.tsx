import { Link } from 'react-router-dom';
import { Page } from '../components/UI';
import { useT } from '../i18n';
import { useDocumentMeta } from '../lib/seo';

export function NotFound() {
  const { t } = useT();
  useDocumentMeta(t('meta.title'), t('meta.desc.home'));
  return (
    <Page>
      <div className="container not-found">
        <span className="display not-found__code">404</span>
        <h1 className="display">{t('nf.title')}</h1>
        <p className="muted">{t('nf.text')}</p>
        <Link to="/" className="btn btn--brass">
          {t('nf.back')}
        </Link>
      </div>
    </Page>
  );
}
