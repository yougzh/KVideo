import { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSearchCache } from '@/lib/hooks/useSearchCache';
import { useParallelSearch } from '@/lib/hooks/useParallelSearch';
import { useSubscriptionSync } from '@/lib/hooks/useSubscriptionSync';
import { settingsStore, type SortOption } from '@/lib/store/settings-store';
import { VideoSource } from '@/lib/types';
import { isVideoSourceEnabled } from '@/lib/utils/video-source';

export function usePremiumHomePage() {
    const { syncState } = useSubscriptionSync();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { saveToCache } = useSearchCache();
    const hasLoadedCache = useRef(false);
    const hasSearchedWithSourcesRef = useRef(false);
    const urlQuery = searchParams.get('q')?.trim() || '';

    const query = urlQuery;
    const hasSearched = urlQuery.length > 0;
    const currentSortBy: SortOption = 'default';
    const [sourceState, setSourceState] = useState<'loading' | 'ready' | 'empty'>('loading');

    const getConfiguredSources = useCallback(() => {
        const settings = settingsStore.getSettings();
        return {
            sources: settings.premiumSources.filter(isVideoSourceEnabled),
            hasPendingSubscriptions: settings.subscriptions.some(
                subscription => subscription.autoRefresh !== false
            ),
        };
    }, []);

    const onUrlUpdate = useCallback((q: string) => {
        if (q.trim() === urlQuery) return;
        router.push(`/premium?q=${encodeURIComponent(q)}`, { scroll: false });
    }, [router, urlQuery]);

    // Search stream hook
    const {
        loading,
        results,
        availableSources,
        completedSources,
        totalSources,
        performSearch,
        resetSearch,
        cancelSearch,
        applySorting,
        loadMore,
        hasMore,
        loadingMore,
    } = useParallelSearch(
        saveToCache,
        onUrlUpdate
    );

    // Core search execution function - extracted to eliminate duplication
    const executeSearch = useCallback((searchQuery: string, sources: VideoSource[]) => {
        if (!searchQuery.trim()) return false;

        if (sources.length === 0) {
            return false;
        }

        performSearch(searchQuery, sources, currentSortBy);
        hasSearchedWithSourcesRef.current = true;
        return true;
    }, [performSearch, currentSortBy]);

    const handleSearch = useCallback((searchQuery: string) => {
        const normalizedQuery = searchQuery.trim();
        if (!normalizedQuery) return;

        if (normalizedQuery !== urlQuery) {
            router.push(`/premium?q=${encodeURIComponent(normalizedQuery)}`, { scroll: false });
            return;
        }

        executeSearch(
            normalizedQuery,
            getConfiguredSources().sources
        );
    }, [executeSearch, getConfiguredSources, router, urlQuery]);

    // Run the search for this URL on mount. The page is keyed by URL query,
    // so back/forward navigation starts the destination search again.
    useEffect(() => {
        if (hasLoadedCache.current) return;
        hasLoadedCache.current = true;

        if (!urlQuery) return;

        const currentSources = getConfiguredSources().sources;
        if (currentSources.length > 0) {
            handleSearch(urlQuery);
        }
    }, [getConfiguredSources, handleSearch, urlQuery]);

    // Re-sort results when sort preference changes
    useEffect(() => {
        if (hasSearched && results.length > 0) {
            applySorting(currentSortBy);
        }
    }, [currentSortBy, applySorting, hasSearched, results.length]);

    // Load sources and subscribe to changes
    useEffect(() => {
        const updateSettings = () => {
            const { sources: newPremiumSources, hasPendingSubscriptions } = getConfiguredSources();

            // Check if we need to re-trigger search due to new sources being loaded
            const hasSources = newPremiumSources.length > 0;

            setSourceState(
                hasSources
                    ? 'ready'
                    : hasPendingSubscriptions && syncState !== 'done'
                        ? 'loading'
                        : 'empty'
            );

            // If we have a query, and we haven't searched with sources yet,
            // and we suddenly have sources, trigger the search.
            if (query && hasSources && !hasSearchedWithSourcesRef.current && !loading) {
                executeSearch(query, newPremiumSources);
            }
        };

        // Initial load
        updateSettings();

        // Subscribe to changes
        const unsubscribe = settingsStore.subscribe(updateSettings);
        return () => unsubscribe();
    }, [query, loading, executeSearch, getConfiguredSources, syncState]);

    const handleReset = () => {
        hasSearchedWithSourcesRef.current = false;
        resetSearch();
        router.replace('/premium', { scroll: false });
    };

    return {
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
        handleCancelSearch: cancelSearch,
        loadMore,
        hasMore,
        loadingMore,
    };
}
