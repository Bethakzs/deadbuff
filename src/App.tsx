import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BuildsPage } from './pages/Builds';
import { HeroPage } from './pages/hero/HeroPage';
import { HeroesPage } from './pages/Heroes';
import { HomePage } from './pages/Home';
import { ItemPage } from './pages/Item';
import { ItemsPage } from './pages/Items';
import { LeaderboardPage } from './pages/Leaderboard';
import { MatchPage } from './pages/Match';
import { MatchesPage } from './pages/Matches';
import { NotFound } from './pages/NotFound';
import { PatchesPage } from './pages/Patches';
import { MeRedirect, PlayerPage } from './pages/Player';
import { PlayersPage } from './pages/Players';
import { TierListPage } from './pages/TierList';

/** Top-level section of the path — switching hero tabs shouldn't replay the page transition. */
const sectionKey = (path: string) => path.split('/').slice(0, 3).join('/');

export default function App() {
  const location = useLocation();
  const key = sectionKey(location.pathname);
  const first = useRef(true);

  // Scroll to top on navigation — but not on mount, so switching language (which remounts the
  // router) keeps the reader where they were.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [key]);

  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={key}>
          <Route path="/" element={<HomePage />} />
          <Route path="/heroes" element={<HeroesPage />} />
          <Route path="/tier-list" element={<TierListPage />} />
          <Route path="/heroes/:slug/:tab?" element={<HeroPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/items/:slug" element={<ItemPage />} />
          <Route path="/builds" element={<BuildsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:accountId" element={<PlayerPage />} />
          <Route path="/me" element={<MeRedirect />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/matches/:matchId" element={<MatchPage />} />
          <Route path="/patches" element={<PatchesPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}
