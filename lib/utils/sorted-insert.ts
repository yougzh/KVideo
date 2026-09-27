/**
 * Binary insert utility for sorted arrays
 */

import type { Video } from '@/lib/types';

/**
 * Insert videos into sorted array using binary search
 * Sorts by: 1) relevance score (DESC), 2) latency (ASC)
 */
export function binaryInsertVideos<T extends Video>(existing: T[], newVideos: T[]): T[] {
    const combined = [...existing];
    const seenKeys = new Set(combined.map(video => `${video.source}:${video.vod_id}`));

    for (const video of newVideos) {
        const videoKey = `${video.source}:${video.vod_id}`;
        if (seenKeys.has(videoKey)) continue;
        seenKeys.add(videoKey);

        const relevanceScore = video.relevanceScore || 0;
        const latency = video.latency || 99999;

        // Find insert position using binary search
        let left = 0;
        let right = combined.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            const midRelevance = combined[mid].relevanceScore || 0;
            const midLatency = combined[mid].latency || 99999;

            if (midRelevance > relevanceScore) {
                left = mid + 1;
            } else if (midRelevance < relevanceScore) {
                right = mid;
            } else {
                // Same relevance, compare by latency
                if (midLatency < latency) {
                    left = mid + 1;
                } else {
                    right = mid;
                }
            }
        }

        combined.splice(left, 0, video);
    }

    return combined;
}
