import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './layout/AppShell';
import { NotFound, RouteError } from './layout/RouteError';
import { Skeleton } from './components/common';

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

const page = (C: LazyExoticComponent<ComponentType>) => (
  <Suspense fallback={<PageFallback />}>
    <C />
  </Suspense>
);

const named = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(async () => ({ default: (await loader())[name] }));

const Home = named(() => import('./routes/Home'), 'Home');
const SearchPage = named(() => import('./routes/Search'), 'SearchPage');
const Browse = named(() => import('./routes/Browse'), 'Browse');
const CollectionPage = named(() => import('./routes/Collection'), 'CollectionPage');
const ArtistPage = named(() => import('./routes/Artist'), 'ArtistPage');
const AlbumPage = named(() => import('./routes/Album'), 'AlbumPage');
const Library = named(() => import('./routes/Library'), 'Library');
const LikedPage = named(() => import('./routes/Liked'), 'LikedPage');
const PlaylistPage = named(() => import('./routes/Playlist'), 'PlaylistPage');
const SmartPlaylistPage = named(() => import('./routes/SmartPlaylist'), 'SmartPlaylistPage');
const SoundLab = named(() => import('./routes/SoundLab'), 'SoundLab');
const LyricsPage = named(() => import('./routes/LyricsPage'), 'LyricsPage');
const Friends = named(() => import('./routes/Friends'), 'Friends');
const Party = named(() => import('./routes/Party'), 'Party');
const Stats = named(() => import('./routes/Stats'), 'Stats');
const Wrapped = named(() => import('./routes/Wrapped'), 'Wrapped');
const ImportPage = named(() => import('./routes/Import'), 'ImportPage');
const SharePage = named(() => import('./routes/Share'), 'SharePage');
const Settings = named(() => import('./routes/settings/Settings'), 'Settings');
const Onboarding = named(() => import('./routes/Onboarding'), 'Onboarding');
const Boost = named(() => import('./routes/Boost'), 'Boost');
const AuthCallback = named(() => import('./routes/AuthCallback'), 'AuthCallback');

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(Home), errorElement: <RouteError /> },
      { path: 'search', element: page(SearchPage), errorElement: <RouteError /> },
      { path: 'browse', element: page(Browse), errorElement: <RouteError /> },
      { path: 'collection/:id', element: page(CollectionPage), errorElement: <RouteError /> },
      { path: 'artist/:source/:id', element: page(ArtistPage), errorElement: <RouteError /> },
      { path: 'album/:source/:id', element: page(AlbumPage), errorElement: <RouteError /> },
      { path: 'library', element: page(Library), errorElement: <RouteError /> },
      { path: 'library/liked', element: page(LikedPage), errorElement: <RouteError /> },
      { path: 'playlist/:id', element: page(PlaylistPage), errorElement: <RouteError /> },
      { path: 'smart/:id', element: page(SmartPlaylistPage), errorElement: <RouteError /> },
      { path: 'lab', element: page(SoundLab), errorElement: <RouteError /> },
      { path: 'lyrics', element: page(LyricsPage), errorElement: <RouteError /> },
      { path: 'friends', element: page(Friends), errorElement: <RouteError /> },
      { path: 'party/:code?', element: page(Party), errorElement: <RouteError /> },
      { path: 'stats', element: page(Stats), errorElement: <RouteError /> },
      { path: 'wrapped', element: page(Wrapped), errorElement: <RouteError /> },
      { path: 'import', element: page(ImportPage), errorElement: <RouteError /> },
      { path: 's/:code', element: page(SharePage), errorElement: <RouteError /> },
      { path: 'settings/:section?', element: page(Settings), errorElement: <RouteError /> },
      { path: 'onboarding', element: page(Onboarding), errorElement: <RouteError /> },
      { path: 'boost', element: page(Boost), errorElement: <RouteError /> },
      { path: 'auth/callback', element: page(AuthCallback), errorElement: <RouteError /> },
      {
        path: '*',
        element: <NotFound />,
        errorElement: <RouteError />,
      },
    ],
  },
];

export function makeRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  return createBrowserRouter(routes, { basename });
}
