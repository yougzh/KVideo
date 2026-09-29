'use client';

import { Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { SearchForm } from '@/components/search/SearchForm';
import { NoResults } from '@/components/search/NoResults';
import { Navbar } from '@/components/layout/Navbar';
import { SourceSetupEmptyState } from '@/components/home/SourceSetupEmptyState';
import { useHomePage } from '@/lib/hooks/useHomePage';
import { useLatencyPing } from '@/lib/hooks/useLatencyPing';

const PopularFeatures = dynamic(
  () => import('@/components/home/PopularFeatures').then(module => module.PopularFeatures),
  { ssr: false }
);

const SearchResults = dynamic(
  () => import('@/components/home/SearchResults').then(module => module.SearchResults),
  { ssr: false }
);

const FavoritesSidebar = dynamic(
  () => import('@/components/favorites/FavoritesSidebar').then(module => module.FavoritesSidebar),
  { ssr: false }
);

interface HomePageClientProps {
  initialQuery: string;
}

export function HomePageClient({ initialQuery }: HomePageClientProps) {
  const {
    query,
    hasSearched,
    sourceState,
    loading,
    results,
    availableSources,
    completedSources,
    totalSources,
    handleSearch,
    handleReset,
    handleCancelSearch,
  } = useHomePage(initialQuery);

  // Real-time latency pinging
  const sourceUrls = useMemo(() =>
    availableSources.flatMap((source) =>
      source.baseUrl ? [{ id: source.id, baseUrl: source.baseUrl }] : []
    ),
    [availableSources]
  );

  const { latencies } = useLatencyPing({
    sourceUrls,
    enabled: hasSearched && results.length > 0,
  });

  return (
    <div className="min-h-screen">
      {/* Glass Navbar */}
      <Navbar onReset={handleReset} />

      {/* Search Form - Separate from navbar */}
      <div className="max-w-7xl mx-auto px-4 mt-6 mb-8 relative" style={{
        transform: 'translate3d(0, 0, 0)',
        zIndex: 1000
      }}>
        <SearchForm
          onSearch={handleSearch}
          onClear={handleReset}
          onCancelSearch={handleCancelSearch}
          isLoading={loading}
          initialQuery={query}
          currentSource=""
          checkedSources={completedSources}
          totalSources={totalSources}
        />
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Results Section */}
        {(results.length >= 1 || (!loading && results.length > 0)) && (
          <Suspense fallback={null}>
            <SearchResults
              results={results}
              availableSources={availableSources}
              loading={loading}
              latencies={latencies}
            />
          </Suspense>
        )}

        {/* Popular Features - Homepage */}
        {!loading && !hasSearched && sourceState === 'ready' && (
          <Suspense fallback={null}>
            <PopularFeatures onSearch={handleSearch} />
          </Suspense>
        )}

        {/* No configured sources */}
        {!loading && sourceState === 'empty' && (
          <SourceSetupEmptyState />
        )}

        {/* No Results */}
        {!loading && hasSearched && sourceState === 'ready' && results.length === 0 && (
          <NoResults onReset={handleReset} />
        )}
      </main>

      {/* Favorites Sidebar - Left */}
      <Suspense fallback={null}>
        <FavoritesSidebar />
      </Suspense>
    </div>
  );
}
