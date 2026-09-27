export interface HlsSegmentChunk {
    data: Uint8Array;
    index: number;
    total: number;
    isInit: boolean;
}

interface KeyInfo {
    method: 'AES-128';
    uri: string;
    iv?: Uint8Array;
}

interface MediaSegment {
    url: string;
    key: KeyInfo | null;
    sequence: number;
}

interface ParsedPlaylist {
    initUrl: string | null;
    initKey: KeyInfo | null;
    segments: MediaSegment[];
}

interface IterateOptions {
    src: string;
    mediaProxyEnabled: boolean;
    signal: AbortSignal;
    waitIfPaused: () => Promise<void>;
    isCancelled: () => boolean;
}

const MAX_PLAYLIST_DEPTH = 3;
const keyCache = new Map<string, Promise<Uint8Array>>();

function resolveUrl(baseUrl: string, target: string): string {
    try {
        return new URL(target, baseUrl).toString();
    } catch {
        return target;
    }
}

function parseIv(value: string | undefined): Uint8Array | undefined {
    if (!value) return undefined;
    const normalized = value.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{32}$/i.test(normalized)) return undefined;
    const bytes = new Uint8Array(16);
    for (let index = 0; index < 16; index += 1) {
        bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function parseAttributeList(value: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
        attributes[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '');
    }
    return attributes;
}

function sequenceIv(sequence: number): Uint8Array {
    const iv = new Uint8Array(16);
    const view = new DataView(iv.buffer);
    view.setUint32(8, Math.floor(sequence / 0x100000000), false);
    view.setUint32(12, sequence >>> 0, false);
    return iv;
}

function parsePlaylist(text: string, baseUrl: string): ParsedPlaylist | { variantUrl: string } {
    const lines = text.split(/\r?\n/);
    let mediaSequence = 0;
    let currentKey: KeyInfo | null = null;
    let initUrl: string | null = null;
    let initKey: KeyInfo | null = null;
    const segments: MediaSegment[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;

        if (line.startsWith('#EXT-X-STREAM-INF')) {
            for (let next = index + 1; next < lines.length; next += 1) {
                const candidate = lines[next].trim();
                if (!candidate || candidate.startsWith('#')) continue;
                return { variantUrl: resolveUrl(baseUrl, candidate) };
            }
            continue;
        }

        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
            mediaSequence = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length)) || 0;
            continue;
        }

        if (line.startsWith('#EXT-X-KEY:')) {
            const attributes = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
            const method = (attributes.METHOD || '').toUpperCase();
            if (method === 'NONE') {
                currentKey = null;
                continue;
            }
            if (method !== 'AES-128') {
                throw new Error(`当前视频使用 ${method || '未知'} 加密，网页下载暂不支持`);
            }
            if (!attributes.URI) throw new Error('加密播放列表缺少密钥地址');
            currentKey = {
                method: 'AES-128',
                uri: resolveUrl(baseUrl, attributes.URI),
                iv: parseIv(attributes.IV),
            };
            continue;
        }

        if (line.startsWith('#EXT-X-MAP:')) {
            const attributes = parseAttributeList(line.slice('#EXT-X-MAP:'.length));
            if (attributes.URI) {
                initUrl = resolveUrl(baseUrl, attributes.URI);
                initKey = currentKey;
            }
            continue;
        }

        if (line.startsWith('#')) continue;
        segments.push({
            url: resolveUrl(baseUrl, line),
            key: currentKey,
            sequence: mediaSequence + segments.length,
        });
    }

    if (segments.length === 0) {
        throw new Error('播放列表中没有可下载的视频分片');
    }

    return { initUrl, initKey, segments };
}

async function fetchResource(url: string, mediaProxyEnabled: boolean, signal: AbortSignal): Promise<Response> {
    const direct = await fetch(url, { signal });
    if (direct.ok || url.startsWith('/api/proxy') || !mediaProxyEnabled) {
        return direct;
    }
    return fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal });
}

async function parsePlaylistFromUrl(
    url: string,
    mediaProxyEnabled: boolean,
    signal: AbortSignal,
    depth = 0
): Promise<ParsedPlaylist> {
    if (depth > MAX_PLAYLIST_DEPTH) throw new Error('播放列表层级过深');
    const response = await fetchResource(url, mediaProxyEnabled, signal);
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
    const parsed = parsePlaylist(await response.text(), url);
    if ('variantUrl' in parsed) {
        return parsePlaylistFromUrl(parsed.variantUrl, mediaProxyEnabled, signal, depth + 1);
    }
    return parsed;
}

async function getKey(key: KeyInfo, mediaProxyEnabled: boolean, signal: AbortSignal): Promise<Uint8Array> {
    const cached = keyCache.get(key.uri);
    if (cached) return cached;
    const request = fetchResource(key.uri, mediaProxyEnabled, signal)
        .then(response => {
            if (!response.ok) throw new Error(`密钥下载失败：HTTP ${response.status}`);
            return response.arrayBuffer();
        })
        .then(buffer => new Uint8Array(buffer));
    keyCache.set(key.uri, request);
    try {
        return await request;
    } catch (error) {
        keyCache.delete(key.uri);
        throw error;
    }
}

async function decryptSegment(
    data: ArrayBuffer,
    keyInfo: KeyInfo,
    sequence: number,
    mediaProxyEnabled: boolean,
    signal: AbortSignal
): Promise<ArrayBuffer> {
    const key = await getKey(keyInfo, mediaProxyEnabled, signal);
    const keyBytes = new Uint8Array(key).slice().buffer;
    const iv = new Uint8Array(keyInfo.iv || sequenceIv(sequence)).slice();
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
    return crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
}

async function loadSegment(
    segment: MediaSegment,
    mediaProxyEnabled: boolean,
    signal: AbortSignal
): Promise<Uint8Array> {
    const response = await fetchResource(segment.url, mediaProxyEnabled, signal);
    if (!response.ok) throw new Error(`分片下载失败：HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    const decrypted = segment.key
        ? await decryptSegment(data, segment.key, segment.sequence, mediaProxyEnabled, signal)
        : data;
    return new Uint8Array(decrypted);
}

export async function* iterateHlsSegments({
    src,
    mediaProxyEnabled,
    signal,
    waitIfPaused,
    isCancelled,
}: IterateOptions): AsyncGenerator<HlsSegmentChunk> {
    const playlist = await parsePlaylistFromUrl(src, mediaProxyEnabled, signal);
    const total = playlist.segments.length + (playlist.initUrl ? 1 : 0);
    let index = 0;

    if (playlist.initUrl) {
        await waitIfPaused();
        if (isCancelled()) throw new DOMException('下载已取消', 'AbortError');
        const response = await fetchResource(playlist.initUrl, mediaProxyEnabled, signal);
        if (!response.ok) throw new Error(`初始化分片下载失败：HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        const decrypted = playlist.initKey
            ? await decryptSegment(data, playlist.initKey, 0, mediaProxyEnabled, signal)
            : data;
        index += 1;
        yield { data: new Uint8Array(decrypted), index, total, isInit: true };
    }

    for (const segment of playlist.segments) {
        await waitIfPaused();
        if (isCancelled()) throw new DOMException('下载已取消', 'AbortError');
        const data = await loadSegment(segment, mediaProxyEnabled, signal);
        index += 1;
        yield { data, index, total, isInit: false };
    }
}
