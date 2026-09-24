import type { VideoSource } from '@/lib/types';

export function isVideoSourceEnabled(source: unknown): boolean {
  if (!source || typeof source !== 'object') return true;
  return (source as { enabled?: unknown }).enabled !== false;
}

export function normalizeVideoSource(source: unknown): VideoSource | null {
  if (!source || typeof source !== 'object') return null;

  const candidate = source as Partial<VideoSource>;
  if (
    typeof candidate.id !== 'string' ||
    !candidate.id ||
    typeof candidate.name !== 'string' ||
    !candidate.name ||
    typeof candidate.baseUrl !== 'string' ||
    !candidate.baseUrl
  ) {
    return null;
  }

  return {
    ...candidate,
    id: candidate.id,
    name: candidate.name,
    baseUrl: candidate.baseUrl,
    searchPath: typeof candidate.searchPath === 'string' ? candidate.searchPath : '',
    detailPath: typeof candidate.detailPath === 'string' ? candidate.detailPath : '',
    enabled: isVideoSourceEnabled(candidate),
  };
}
