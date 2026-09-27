import { NextRequest, NextResponse } from 'next/server';
import { searchVideos } from '@/lib/api/client';
import { getSourceName } from '@/lib/utils/source-names';
import { traditionalToSimplified } from '@/lib/utils/chinese-convert';
import type { VideoItem, VideoSource } from '@/lib/types';

export const runtime = 'edge';

const MAX_PAGES_PER_SOURCE = 3;
const PER_SOURCE_TIMEOUT_MS = 12000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const sources = Array.isArray(body.sources) ? body.sources : [];

    if (!query || sources.length === 0) {
      return NextResponse.json({ error: 'Invalid search request' }, { status: 400 });
    }

    const normalizedQuery = traditionalToSimplified(query);

    const sourceResults = await Promise.all(sources.map(async (source: VideoSource) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PER_SOURCE_TIMEOUT_MS);
      const startedAt = performance.now();

      try {
        const firstPage = await searchVideos(normalizedQuery, [source], 1, controller.signal);
        const firstVideos = firstPage[0]?.results || [];
        const pageCount = Math.min(firstPage[0]?.pagecount ?? 1, MAX_PAGES_PER_SOURCE);
        const remainingPages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2);
        const remainingResults = await Promise.all(remainingPages.map(async (page) => {
          try {
            const result = await searchVideos(normalizedQuery, [source], page, controller.signal);
            return result[0]?.results || [];
          } catch {
            return [];
          }
        }));

        const videos = [firstVideos, ...remainingResults].flat();
        const latency = Math.round(performance.now() - startedAt);
        return {
          source: source.id,
          videos: videos.map((video: VideoItem) => ({
            ...video,
            sourceDisplayName: getSourceName(source.id),
            latency,
          })),
        };
      } catch {
        return { source: source.id, videos: [] };
      } finally {
        clearTimeout(timeout);
      }
    }));

    const videos = sourceResults.flatMap(result => result.videos);

    return NextResponse.json({
      videos,
      totalSources: sources.length,
      totalVideosFound: videos.length,
      maxPageCount: MAX_PAGES_PER_SOURCE,
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
