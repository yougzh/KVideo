import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';
import { settingsStore } from '@/lib/store/settings-store';
import {
    createContentCacheKey,
    readContentSnapshot,
    writeContentSnapshot,
} from '@/lib/utils/content-snapshot-cache';

interface PremiumVideo {
    vod_id: string | number;
    vod_name: string;
    vod_pic?: string;
    vod_remarks?: string;
    type_name?: string;
    source: string;
}

const PAGE_LIMIT = 20;

export function usePremiumContent(
    categoryValue: string,
    selectedTag = categoryValue,
    refreshKey = 0
) {
    const [videos, setVideos] = useState<PremiumVideo[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const videosRef = useRef<PremiumVideo[]>([]);
    const requestIdRef = useRef(0);
    const inFlightRequestRef = useRef<number | null>(null);
    const consumedRefreshKeyRef = useRef(refreshKey);
    const [cacheEnabled, setCacheEnabled] = useState(true);
    const contentCacheKey = createContentCacheKey(
        'premium',
        `${selectedTag}:${categoryValue}`
    );
    const cachedSnapshot = useMemo(
        () => readContentSnapshot<PremiumVideo>(contentCacheKey),
        [contentCacheKey]
    );

    // Track source count to detect meaningful updates
    const sourceCountRef = useRef(0);

    const loadVideos = useCallback(async (
        pageNum: number,
        append = false,
        requestId = requestIdRef.current
    ) => {
        if (inFlightRequestRef.current === requestId) return;

        inFlightRequestRef.current = requestId;
        setLoading(true);
        try {
            // Get sources from settings
            const settings = settingsStore.getSettings();
            // Resolve all relevant sources (premium sources + subscriptions that might be premium)
            // For simplicity, we send all enabled premium sources.
            const premiumSources = [
                ...settings.premiumSources,
                // Check if any subscription sources are marked as premium
                ...settings.subscriptions.filter(s => (s as any).group === 'premium')
            ].filter(s => (s as any).enabled !== false);

            if (premiumSources.length === 0) {
                setLoading(false);
                return;
            }

            // Should we include normal subscriptions too if categoryValue requests them?
            // The API handles filtering by categoryValue map.
            // If categoryValue is empty (Recommend), we use all enabled premium sources.

            const response = await fetch('/api/premium/category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: premiumSources,
                    category: categoryValue,
                    page: pageNum.toString(),
                    limit: PAGE_LIMIT.toString()
                })
            });

            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            const newVideos = data.videos || [];

            if (requestId !== requestIdRef.current) return;

            const nextVideos = append
                ? [...videosRef.current, ...newVideos]
                : newVideos;
            const nextHasMore = newVideos.length === PAGE_LIMIT;

            videosRef.current = nextVideos;
            setVideos(nextVideos);
            setHasMore(nextHasMore);
            writeContentSnapshot(contentCacheKey, {
                items: nextVideos,
                page: pageNum,
                hasMore: nextHasMore,
            });
        } catch (error) {
            console.error('Failed to load videos:', error);
            if (requestId === requestIdRef.current) {
                setHasMore(false);
            }
        } finally {
            if (requestId === requestIdRef.current) {
                inFlightRequestRef.current = null;
                setLoading(false);
            }
        }
    }, [categoryValue, contentCacheKey]);

    // Initial load and category change
    useEffect(() => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        inFlightRequestRef.current = null;
        const bypassCache = consumedRefreshKeyRef.current !== refreshKey;
        consumedRefreshKeyRef.current = refreshKey;
        setCacheEnabled(!bypassCache);

        if (cachedSnapshot && !bypassCache) {
            videosRef.current = cachedSnapshot.items;
            setVideos(cachedSnapshot.items);
            setPage(cachedSnapshot.page);
            setHasMore(cachedSnapshot.hasMore);
            setLoading(false);
            return;
        }

        videosRef.current = [];
        setPage(1);
        setVideos([]);
        setHasMore(true);

        // Initial check for sources
        const settings = settingsStore.getSettings();
        const sourcesCount = settings.premiumSources.length + settings.subscriptions.length;
        sourceCountRef.current = sourcesCount;

        loadVideos(1, false, requestId);
    }, [categoryValue, cachedSnapshot, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Subscribe to settings changes to handle async source loading
    useEffect(() => {
        const handleSettingsUpdate = () => {
            const settings = settingsStore.getSettings();
            const premiumSources = [
                ...settings.premiumSources,
                ...settings.subscriptions.filter(s => (s as any).group === 'premium')
            ].filter(s => (s as any).enabled !== false);

            const currentSourceCount = premiumSources.length;

            // If we have 0 videos and suddenly gain sources, we should retry loading
            // OR if the number of sources significantly changed (e.g. from 0 to N)
            if (videos.length === 0 && currentSourceCount > 0 && !loading) {
                // Determine if we should reload. 
                // Mostly needed when initial load failed due to no sources.
                loadVideos(1, false, requestIdRef.current);
            }
        };

        const unsubscribe = settingsStore.subscribe(handleSettingsUpdate);
        return () => unsubscribe();
    }, [loadVideos, videos.length, loading]);

    const { prefetchRef, loadMoreRef } = useInfiniteScroll({
        hasMore,
        loading,
        page,
        onLoadMore: (nextPage) => {
            setPage(nextPage);
            loadVideos(nextPage, true, requestIdRef.current);
        },
    });

    return {
        videos: cacheEnabled && videos.length === 0
            ? cachedSnapshot?.items || videos
            : videos,
        loading,
        hasMore,
        prefetchRef,
        loadMoreRef,
    };
}
