import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';
import {
    createContentCacheKey,
    readContentSnapshot,
    writeContentSnapshot,
} from '@/lib/utils/content-snapshot-cache';
import { DEFAULT_POPULAR_TAG_ID } from '@/lib/utils/tag-navigation';

interface DoubanMovie {
    id: string;
    title: string;
    cover: string;
    rate: string;
    url: string;
}

const PAGE_LIMIT = 20;

export function usePopularMovies(
    selectedTag: string,
    tags: any[],
    contentType: 'movie' | 'tv' = 'movie',
    refreshKey = 0
) {
    const [movies, setMovies] = useState<DoubanMovie[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const moviesRef = useRef<DoubanMovie[]>([]);
    const requestIdRef = useRef(0);
    const inFlightRequestRef = useRef<number | null>(null);
    const consumedRefreshKeyRef = useRef(refreshKey);
    const [cacheEnabled, setCacheEnabled] = useState(true);
    const contentCacheKey = createContentCacheKey(
        'popular',
        `${contentType}:${selectedTag}`
    );
    const cachedSnapshot = useMemo(
        () => readContentSnapshot<DoubanMovie>(contentCacheKey),
        [contentCacheKey]
    );
    const hasResolvedTag = selectedTag === DEFAULT_POPULAR_TAG_ID
        || tags.some((tag) => tag.id === selectedTag);

    const loadMovies = useCallback(async (
        tag: string,
        pageStart: number,
        append = false,
        requestId = requestIdRef.current
    ) => {
        if (inFlightRequestRef.current === requestId) return;

        inFlightRequestRef.current = requestId;
        setLoading(true);
        try {
            const tagValue = tags.find(t => t.id === tag)?.value || '热门';
            const response = await fetch(
                `/api/douban/recommend?type=${contentType}&tag=${encodeURIComponent(tagValue)}&page_limit=${PAGE_LIMIT}&page_start=${pageStart}`
            );

            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            const newMovies = data.subjects || [];

            if (requestId !== requestIdRef.current) return;

            const nextMovies = append
                ? [...moviesRef.current, ...newMovies]
                : newMovies;
            const nextHasMore = newMovies.length === PAGE_LIMIT;

            moviesRef.current = nextMovies;
            setMovies(nextMovies);
            setHasMore(nextHasMore);
            writeContentSnapshot(contentCacheKey, {
                items: nextMovies,
                page: append ? Math.floor(pageStart / PAGE_LIMIT) : 0,
                hasMore: nextHasMore,
            });
        } catch (error) {
            console.error('Failed to load movies:', error);
            if (requestId === requestIdRef.current) {
                setHasMore(false);
            }
        } finally {
            if (requestId === requestIdRef.current) {
                inFlightRequestRef.current = null;
                setLoading(false);
            }
        }
    }, [tags, contentType, contentCacheKey]);

    useEffect(() => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        inFlightRequestRef.current = null;
        const bypassCache = consumedRefreshKeyRef.current !== refreshKey;
        consumedRefreshKeyRef.current = refreshKey;
        setCacheEnabled(!bypassCache);

        if (!hasResolvedTag) {
            moviesRef.current = [];
            setMovies([]);
            setHasMore(false);
            setLoading(false);
            return;
        }

        if (cachedSnapshot && !bypassCache) {
            moviesRef.current = cachedSnapshot.items;
            setMovies(cachedSnapshot.items);
            setPage(cachedSnapshot.page);
            setHasMore(cachedSnapshot.hasMore);
            setLoading(false);
            return;
        }

        moviesRef.current = [];
        setPage(0);
        setMovies([]);
        setHasMore(true);
        loadMovies(selectedTag, 0, false, requestId);
    }, [selectedTag, contentType, hasResolvedTag, cachedSnapshot, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const { prefetchRef, loadMoreRef } = useInfiniteScroll({
        hasMore,
        loading,
        page,
        onLoadMore: (nextPage) => {
            setPage(nextPage);
            loadMovies(selectedTag, nextPage * PAGE_LIMIT, true, requestIdRef.current);
        },
    });

    return {
        movies: cacheEnabled && movies.length === 0
            ? cachedSnapshot?.items || movies
            : movies,
        loading,
        hasMore,
        prefetchRef,
        loadMoreRef,
    };
}
