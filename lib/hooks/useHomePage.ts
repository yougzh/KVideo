import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSearchCache } from '@/lib/hooks/useSearchCache';
import { useParallelSearch } from '@/lib/hooks/useParallelSearch';
import { useSubscriptionSync } from '@/lib/hooks/useSubscriptionSync';
import { settingsStore, type SortOption } from '@/lib/store/settings-store';
import { userSourcesStore } from '@/lib/store/user-sources-store';
import { isVideoSourceEnabled } from '@/lib/utils/video-source';

export function useHomePage() {
    const { syncState } = useSubscriptionSync();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { loadFromCache, saveToCache } = useSearchCache();
    const hasLoadedCache = useRef(false);
    const hasSearchedWithSourcesRef = useRef(false);
    const isInitialCacheLoad = useRef(false);

    const urlQuery = searchParams.get('q')?.trim() || '';
    const query = urlQuery;
    const hasSearched = urlQuery.length > 0;
    const [currentSortBy, setCurrentSortBy] = useState<SortOption>('default');
    const [sourceState, setSourceState] = useState<'loading' | 'ready' | 'empty'>('loading');

    const getConfiguredSources = useCallback(() => {
        const settings = settingsStore.getSettings();
        const allSources = [
            ...settings.sources.filter(isVideoSourceEnabled),
            ...userSourcesStore.getSources().filter(isVideoSourceEnabled),
        ];
        const uniqueSources = allSources.filter(
            (source, index) => allSources.findIndex(candidate => candidate.id === source.id) === index
        );

        return {
            sources: uniqueSources,
            hasPendingSubscriptions: settings.subscriptions.some(
                subscription => subscription.autoRefresh !== false
            ),
        };
    }, []);

    const onUrlUpdate = useCallback((q: string) => {
        if (q.trim() === urlQuery) return;
        router.push(`/?q=${encodeURIComponent(q)}`, { scroll: false });
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
        loadCachedResults,
        applySorting,
        loadMore,
        hasMore,
        loadingMore,
    } = useParallelSearch(
        saveToCache,
        onUrlUpdate
    );

    // Core search execution function - extracted to eliminate duplication
    const executeSearch = useCallback((searchQuery: string) => {
        if (!searchQuery.trim()) return false;

        const settings = settingsStore.getSettings();
        const { sources: allSources } = getConfiguredSources();

        if (allSources.length === 0) {
            return false;
        }

        performSearch(searchQuery, allSources, settings.sortBy);
        hasSearchedWithSourcesRef.current = true;
        return true;
    }, [getConfiguredSources, performSearch]);

    const handleSearch = useCallback((searchQuery: string) => {
        const normalizedQuery = searchQuery.trim();
        if (!normalizedQuery) return;

        // Clear scroll position for this search query to ensure we start at the top on a fresh search
        const scrollKey = `scroll-pos:/?q=${encodeURIComponent(normalizedQuery)}`;
        sessionStorage.removeItem(scrollKey);

        // Reset cache load flag for new search
        isInitialCacheLoad.current = false;

        if (normalizedQuery !== urlQuery) {
            router.push(`/?q=${encodeURIComponent(normalizedQuery)}`, { scroll: false });
            return;
        }

        executeSearch(normalizedQuery);
    }, [executeSearch, router, urlQuery]);

    // Load cached results on mount. The page is keyed by URL query, so browser
    // back/forward navigation re-runs this for the destination query.
    useEffect(() => {
        if (hasLoadedCache.current) return;
        hasLoadedCache.current = true;

        if (!urlQuery) return;

        const cached = loadFromCache();
        if (cached && cached.query === urlQuery && cached.results.length > 0) {
            isInitialCacheLoad.current = true;
            loadCachedResults(cached.results, cached.availableSources);
            hasSearchedWithSourcesRef.current = true;
            return;
        }

        handleSearch(urlQuery);
    }, [urlQuery, loadFromCache, loadCachedResults, handleSearch]);

    // Re-sort results when sort preference changes
    useEffect(() => {
        // Skip re-sorting if this is a load from cache, to preserve the "remembered" position
        // Only re-sort if the user explicitly changes the sortBy option later
        if (hasSearched && results.length > 0 && !isInitialCacheLoad.current) {
            applySorting(currentSortBy);
        }
    }, [currentSortBy, applySorting, hasSearched, results.length]);

    // Load sort preference on mount and subscribe to changes
    useEffect(() => {
        const updateSettings = () => {
            const settings = settingsStore.getSettings();

            // Update sort preference
            if (settings.sortBy !== currentSortBy) {
                setCurrentSortBy(settings.sortBy);
            }

            // Check if we need to re-trigger search due to new sources being loaded
            // This fixes the issue where initial visit has 0 sources, then sources are loaded async
            // but the search (or lack thereof) is already stuck with empty sources.
            const { sources: configuredSources, hasPendingSubscriptions } = getConfiguredSources();
            const hasSources = configuredSources.length > 0;

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
                executeSearch(query);
            }
        };

        // Initial load
        updateSettings();

        // Subscribe to changes
        const unsubscribeSettings = settingsStore.subscribe(updateSettings);
        const unsubscribeUserSources = userSourcesStore.subscribe(updateSettings);
        return () => {
            unsubscribeSettings();
            unsubscribeUserSources();
        };
    }, [query, loading, executeSearch, currentSortBy, getConfiguredSources, syncState]);

    const handleCancelSearch = useCallback(() => {
        cancelSearch();
    }, [cancelSearch]);

    const handleReset = useCallback(() => {
        hasSearchedWithSourcesRef.current = false;
        resetSearch();
        router.replace('/', { scroll: false });
    }, [resetSearch, router]);

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
        handleCancelSearch,
        loadMore,
        hasMore,
        loadingMore,
    };
}
