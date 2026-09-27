import { useRef, useCallback } from 'react';
import { sortVideos } from '@/lib/utils/sort';
import { binaryInsertVideos } from '@/lib/utils/sorted-insert';
import { prepareSearchVideos, processSearchStream } from '@/lib/utils/search-stream';
import type { SortOption } from '@/lib/store/settings-store';
import type { SourceBadge, Video } from '@/lib/types';
import { settingsStore } from '@/lib/store/settings-store';
import { useSearchState } from './useSearchState';

type SearchState = ReturnType<typeof useSearchState>;
type SearchSourceConfig = { id: string; baseUrl?: string };
interface MemorySearchCache {
    results: Video[];
    sources: SourceBadge[];
    timestamp: number;
}

interface UseSearchActionProps {
    state: SearchState;
    onCacheUpdate: (query: string, results: any[], sources: any[]) => void;
    onUrlUpdate: (query: string) => void;
}

export function useSearchAction({ state, onCacheUpdate, onUrlUpdate }: UseSearchActionProps) {
    const {
        setLoading,
        setResults,
        setAvailableSources,
        setCompletedSources,
        setTotalSources,
        setTotalVideosFound,
        setCurrentPage,
        setMaxPageCount,
        setLoadingMore,
        currentPage,
        maxPageCount,
        startSearch,
    } = state;

    const abortControllerRef = useRef<AbortController | null>(null);
    // Keep track of the last search params so loadMore can re-use them
    const lastSearchParamsRef = useRef<{ query: string; sources: any[]; sortBy: SortOption } | null>(null);
    const searchMemoryCacheRef = useRef<Map<string, MemorySearchCache>>(new Map());

    const performSearch = useCallback(async (searchQuery: string, sources: any[] = [], sortBy: SortOption = 'default') => {
        if (!searchQuery.trim()) return;

        // Resolve sources if not provided
        let targetSources = sources;
        if (!targetSources || targetSources.length === 0) {
            const settings = settingsStore.getSettings();
            targetSources = [
                ...settings.sources,
                ...settings.subscriptions.filter(s => (s as any).enabled !== false), // Include valid subscriptions
            ].filter(s => (s as any).enabled !== false);
        }

        // Abort any ongoing search
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const sourceKey = targetSources.map((source: SearchSourceConfig) => source.id).sort().join(',');
        const memoryCacheKey = `${searchQuery.trim()}::${sourceKey}`;
        const cachedSearch = searchMemoryCacheRef.current.get(memoryCacheKey);

        // Reset state
        startSearch(searchQuery.trim());

        if (cachedSearch) {
            setResults(cachedSearch.results);
            setAvailableSources(cachedSearch.sources);
            setTotalVideosFound(cachedSearch.results.length);
            setTotalSources(targetSources.length);
            setLoading(false);
        }

        // Save search params for loadMore
        lastSearchParamsRef.current = { query: searchQuery.trim(), sources: targetSources, sortBy };

        // Update URL
        onUrlUpdate(searchQuery);

        const sourceConfigs = new Map<string, SearchSourceConfig>(
            targetSources.map((source: SearchSourceConfig) => [source.id, source])
        );
        const sourcesMap = new Map<string, { count: number; name: string; baseUrl?: string }>();
        if (cachedSearch) {
            for (const source of cachedSearch.sources) {
                if (source?.id) {
                    sourcesMap.set(source.id, {
                        count: source.count || 0,
                        name: source.name || source.id,
                        baseUrl: source.baseUrl,
                    });
                }
            }
        }

        const applyVideos = (newVideos: Video[], sourceId: string) => {
            if (newVideos.length === 0) return;
            setResults((prev) => binaryInsertVideos(prev, newVideos));

            const existing = sourcesMap.get(sourceId);
            if (existing) {
                existing.count += newVideos.length;
            } else {
                sourcesMap.set(sourceId, {
                    count: newVideos.length,
                    name: newVideos[0]?.sourceName || sourceId,
                    baseUrl: sourceConfigs.get(sourceId)?.baseUrl,
                });
            }
        };

        const finalizeSearch = () => {
            setLoading(false);

            const sources = Array.from(sourcesMap.entries()).map(([id, info]) => ({
                id,
                name: info.name,
                count: info.count,
                ...(info.baseUrl ? { baseUrl: info.baseUrl } : {}),
            }));
            setAvailableSources(sources);

            setResults((currentResults) => {
                const sorted = sortVideos(currentResults, sortBy);

                searchMemoryCacheRef.current.set(memoryCacheKey, {
                    results: sorted,
                    sources,
                    timestamp: Date.now(),
                });
                while (searchMemoryCacheRef.current.size > 16) {
                    const oldestKey = searchMemoryCacheRef.current.keys().next().value;
                    if (oldestKey === undefined) break;
                    searchMemoryCacheRef.current.delete(oldestKey);
                }

                setTimeout(() => {
                    onCacheUpdate(searchQuery, sorted, sources);
                }, 100);

                return sorted;
            });
        };

        const runJsonFallback = async () => {
            const fallbackResponse = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery, sources: targetSources, page: 1 }),
                signal: abortControllerRef.current?.signal,
            });
            if (!fallbackResponse.ok) throw new Error('Search failed');

            const payload = await fallbackResponse.json() as {
                videos?: Video[];
                totalSources?: number;
            };
            const videos = prepareSearchVideos(payload.videos || [], searchQuery.trim());
            const grouped = new Map<string, Video[]>();
            for (const video of videos) {
                const group = grouped.get(video.source) || [];
                group.push(video);
                grouped.set(video.source, group);
            }
            for (const [sourceId, sourceVideos] of grouped) {
                applyVideos(sourceVideos, sourceId);
            }
            setTotalSources(payload.totalSources || targetSources.length);
            setCompletedSources(payload.totalSources || targetSources.length);
            setTotalVideosFound(videos.length);
            finalizeSearch();
        };

        try {
            const response = await fetch('/api/search-parallel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery, sources: targetSources, page: 1 }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) throw new Error('Search failed');

            const reader = response.body?.getReader();
            if (!reader) {
                await runJsonFallback();
                return;
            }

            await processSearchStream({
                reader,
                currentQuery: searchQuery.trim(),
                onStart: (total) => setTotalSources(total),
                onVideos: applyVideos,
                onProgress: (completed, found) => {
                    setCompletedSources(completed);
                    setTotalVideosFound(found);
                },
                onPageInfo: (pageCount) => {
                    setMaxPageCount((prev) => Math.max(prev, pageCount));
                },
                onComplete: finalizeSearch,
                onError: (message) => {
                    console.error('Search error:', message);
                    setLoading(false);
                },
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                // Ignore abort errors and DO NOT set loading to false
                // because a new search might have already started
                return;
            } else {
                console.error('Search error:', error);
            }
            setLoading(false);
        }
    }, [startSearch, onUrlUpdate, onCacheUpdate, setTotalSources, setResults, setCompletedSources, setTotalVideosFound, setLoading, setAvailableSources, setMaxPageCount]);

    const loadMore = useCallback(async () => {
        const params = lastSearchParamsRef.current;
        if (!params) return;

        const nextPage = currentPage + 1;
        if (nextPage > maxPageCount) return;

        // Abort any ongoing load-more (but not the main search)
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoadingMore(true);

        try {
            const response = await fetch('/api/search-parallel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: params.query, sources: params.sources, page: nextPage }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) throw new Error('Load more failed');

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response stream');

            await processSearchStream({
                reader,
                currentQuery: params.query,
                onStart: () => { },
                onVideos: (newVideos) => {
                    // Append new videos to existing results
                    setResults((prev) => binaryInsertVideos(prev, newVideos));
                },
                onProgress: (_, found) => {
                    setTotalVideosFound((prev) => prev + found);
                },
                onPageInfo: (pageCount) => {
                    setMaxPageCount((prev) => Math.max(prev, pageCount));
                },
                onComplete: () => {
                    setCurrentPage(nextPage);
                    setLoadingMore(false);
                },
                onError: (message) => {
                    console.error('Load more error:', message);
                    setLoadingMore(false);
                },
            });

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return;
            }
            console.error('Load more error:', error);
            setLoadingMore(false);
        }
    }, [currentPage, maxPageCount, setLoadingMore, setResults, setTotalVideosFound, setCurrentPage, setMaxPageCount]);

    const cancelSearch = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    return { performSearch, loadMore, cancelSearch };
}
