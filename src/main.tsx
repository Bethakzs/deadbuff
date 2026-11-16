import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { I18nProvider, useT } from './i18n';
import { FilterProvider } from './lib/filters';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/features.css';
import './styles/draft.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 6000),
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * The language prefix ("" or "/uk") is the router basename, so every in-app link stays
 * "/heroes/haze" and automatically resolves to "/uk/heroes/haze" in Ukrainian.
 * Switching language rewrites the URL and remounts the router (data caches live above it).
 */
function Routed() {
  const { lang, meta } = useT();
  return (
    <BrowserRouter key={lang} basename={meta.prefix || undefined} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <FilterProvider>
          <Routed />
        </FilterProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
