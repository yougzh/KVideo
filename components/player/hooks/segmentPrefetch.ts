interface PrefetchEntry {
    controller: AbortController;
    promise: Promise<ArrayBuffer | null>;
}

export interface SegmentPrefetchOptions {
    maxConcurrent?: number;
    maxSegments?: number;
}

interface PrefetchEntry {
    controller: AbortController;
    promise: Promise<ArrayBuffer | null>;
}

export class SegmentPrefetch {
    private cache = new Map<string, ArrayBuffer>();
    private inflight = new Map<string, PrefetchEntry>();
    private queue: string[] = [];
    private activeCount = 0;
    private readonly maxConcurrent: number;
    private readonly maxSegments: number;

    constructor({ maxConcurrent = 2, maxSegments = 8 }: SegmentPrefetchOptions = {}) {
        this.maxConcurrent = Math.max(1, maxConcurrent);
        this.maxSegments = Math.max(1, maxSegments);
    }

    getCached(url: string): ArrayBuffer | null {
        return this.cache.get(url) ?? null;
    }

    getEntry(url: string): PrefetchEntry | null {
        return this.inflight.get(url) ?? null;
    }

    clear() {
        this.queue = [];
        for (const entry of this.inflight.values()) {
            entry.controller.abort();
        }
        this.inflight.clear();
        this.cache.clear();
    }

    schedule(urls: string[]) {
        for (const url of urls) {
            if (this.cache.has(url) || this.inflight.has(url) || this.queue.includes(url)) {
                continue;
            }
            this.queue.push(url);
        }
        this.trimQueue();
        this.pump();
    }

    private trimQueue() {
        if (this.queue.length > this.maxSegments) {
            this.queue = this.queue.slice(-this.maxSegments);
        }
    }

    private pump() {
        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const url = this.queue.shift();
            if (!url || this.cache.has(url) || this.inflight.has(url)) {
                continue;
            }
            this.startLoad(url);
        }
    }

    private startLoad(url: string) {
        const controller = new AbortController();
        this.activeCount += 1;

        const promise = fetch(url, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) return null;
                return response.arrayBuffer();
            })
            .then((data) => {
                if (data) {
                    this.cache.set(url, data);
                    this.trimCache();
                }
                return data;
            })
            .catch(() => null)
            .finally(() => {
                this.inflight.delete(url);
                this.activeCount -= 1;
                this.pump();
            });

        this.inflight.set(url, { controller, promise });
    }

    private trimCache() {
        while (this.cache.size > this.maxSegments) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
    }
}
