export interface ContentSnapshot<T> {
  items: T[];
  page: number;
  hasMore: boolean;
  timestamp: number;
}

const STORAGE_PREFIX = 'kvideo_content_snapshot_v1:';
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 24;
const memoryCache = new Map<string, ContentSnapshot<unknown>>();

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getStorageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey}`;
}

function isFresh(snapshot: ContentSnapshot<unknown>, maxAgeMs: number): boolean {
  return Date.now() - snapshot.timestamp <= maxAgeMs;
}

function pruneStoredEntries(maxEntries = MAX_ENTRIES): void {
  if (!canUseLocalStorage()) return;

  try {
    const entries: Array<{ key: string; timestamp: number }> = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;

      const value = localStorage.getItem(key);
      if (!value) continue;

      try {
        const snapshot = JSON.parse(value) as ContentSnapshot<unknown>;
        entries.push({ key, timestamp: snapshot.timestamp || 0 });
      } catch {
        localStorage.removeItem(key);
      }
    }

    if (entries.length <= maxEntries) return;

    entries
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(0, entries.length - maxEntries)
      .forEach(({ key }) => localStorage.removeItem(key));
  } catch {
    // Storage cleanup is best-effort and must never block rendering.
  }
}

export function createContentCacheKey(namespace: string, value: string): string {
  return `${namespace}:${value}`;
}

export function readContentSnapshot<T>(
  cacheKey: string,
  maxAgeMs = MAX_AGE_MS
): ContentSnapshot<T> | null {
  const memorySnapshot = memoryCache.get(cacheKey) as ContentSnapshot<T> | undefined;
  if (memorySnapshot && isFresh(memorySnapshot, maxAgeMs)) {
    return memorySnapshot;
  }

  if (memorySnapshot) {
    memoryCache.delete(cacheKey);
  }

  if (!canUseLocalStorage()) return null;

  try {
    const stored = localStorage.getItem(getStorageKey(cacheKey));
    if (!stored) return null;

    const snapshot = JSON.parse(stored) as ContentSnapshot<T>;
    if (!isFresh(snapshot, maxAgeMs)) {
      localStorage.removeItem(getStorageKey(cacheKey));
      return null;
    }

    memoryCache.set(cacheKey, snapshot as ContentSnapshot<unknown>);
    return snapshot;
  } catch {
    return null;
  }
}

export function writeContentSnapshot<T>(
  cacheKey: string,
  snapshot: Omit<ContentSnapshot<T>, 'timestamp'>
): void {
  const entry: ContentSnapshot<T> = {
    ...snapshot,
    timestamp: Date.now(),
  };

  memoryCache.set(cacheKey, entry as ContentSnapshot<unknown>);

  if (!canUseLocalStorage()) return;

  const storageKey = getStorageKey(cacheKey);
  try {
    localStorage.setItem(storageKey, JSON.stringify(entry));
    pruneStoredEntries();
  } catch {
    pruneStoredEntries(Math.floor(MAX_ENTRIES / 2));
    try {
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch {
      // The in-memory snapshot still keeps the current session fast.
    }
  }
}
