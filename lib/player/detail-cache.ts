import type { VideoDetail, VideoSource } from '@/lib/types';

const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_MAX_ENTRIES = 40;

interface CachedDetail {
    detail: VideoDetail;
    expiresAt: number;
}

const detailCache = new Map<string, CachedDetail>();
const inflightPrefetches = new Map<string, Promise<VideoDetail | null>>();

function cacheKey(videoId: string | number, source: string): string {
    return `${source}:${videoId}`;
}

export function getCachedVideoDetail(videoId: string | number, source: string): VideoDetail | null {
    const key = cacheKey(videoId, source);
    const cached = detailCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        detailCache.delete(key);
        return null;
    }
    return cached.detail;
}

export function setCachedVideoDetail(detail: VideoDetail): void {
    if (!detail?.source || detail.vod_id === undefined || detail.vod_id === null) return;
    detailCache.set(cacheKey(detail.vod_id, detail.source), {
        detail,
        expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
    });
    while (detailCache.size > DETAIL_CACHE_MAX_ENTRIES) {
        const oldestKey = detailCache.keys().next().value;
        if (oldestKey === undefined) break;
        detailCache.delete(oldestKey);
    }
}

export function prefetchVideoDetail(
    videoId: string | number,
    source: string,
    sourceConfig?: VideoSource
): Promise<VideoDetail | null> {
    const key = cacheKey(videoId, source);
    const cached = getCachedVideoDetail(videoId, source);
    if (cached) return Promise.resolve(cached);

    const existing = inflightPrefetches.get(key);
    if (existing) return existing;

    const request = (async () => {
        try {
            const response = sourceConfig
                ? await fetch('/api/detail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: videoId, source: sourceConfig }),
                })
                : await fetch(`/api/detail?id=${encodeURIComponent(String(videoId))}&source=${encodeURIComponent(source)}`);

            if (!response.ok) return null;
            const data = await response.json();
            if (!data?.success || !data?.data) return null;
            setCachedVideoDetail(data.data);
            return data.data as VideoDetail;
        } catch {
            return null;
        } finally {
            inflightPrefetches.delete(key);
        }
    })();

    inflightPrefetches.set(key, request);
    return request;
}
