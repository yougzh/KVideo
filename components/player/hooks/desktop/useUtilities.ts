import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseUtilitiesProps {
    src: string;
    videoTitle?: string;
    episodeName?: string;
    mediaProxyEnabled?: boolean;
    setToastMessage: (message: string | null) => void;
    setShowToast: (show: boolean) => void;
    toastTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

interface ParsedMediaPlaylist {
    initUrl: string | null;
    segments: string[];
    encrypted: boolean;
}

export type DownloadStatus =
    | 'idle'
    | 'preparing'
    | 'downloading'
    | 'paused'
    | 'native'
    | 'completed'
    | 'cancelled'
    | 'error';

export interface DownloadState {
    status: DownloadStatus;
    progress: number;
    currentSegment: number;
    totalSegments: number;
    bytesReceived: number;
    fileName?: string;
    message?: string;
    mode?: 'native' | 'stream' | 'browser';
}

interface WritableFileStreamLike {
    write(data: BlobPart): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
}

interface FileSystemFileHandleLike {
    createWritable(): Promise<WritableFileStreamLike>;
}

declare global {
    interface Window {
        showSaveFilePicker?: (options?: {
            suggestedName?: string;
            types?: Array<{
                description?: string;
                accept: Record<string, string[]>;
            }>;
        }) => Promise<FileSystemFileHandleLike>;
    }
}

const INITIAL_DOWNLOAD_STATE: DownloadState = {
    status: 'idle',
    progress: 0,
    currentSegment: 0,
    totalSegments: 0,
    bytesReceived: 0,
};

function resolveUrl(baseUrl: string, target: string): string {
    try {
        return new URL(target, baseUrl).toString();
    } catch {
        return target;
    }
}

function parseMediaPlaylist(text: string, baseUrl: string): ParsedMediaPlaylist {
    const lines = text.split(/\r?\n/);
    const segments: string[] = [];
    let initUrl: string | null = null;
    let encrypted = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('#EXT-X-MAP:')) {
            const match = /URI="([^"]+)"/.exec(line);
            if (match) initUrl = resolveUrl(baseUrl, match[1]);
            continue;
        }

        if (line.startsWith('#EXT-X-KEY:')) {
            if (!/METHOD=NONE/.test(line)) encrypted = true;
            continue;
        }

        if (line.startsWith('#')) continue;
        segments.push(resolveUrl(baseUrl, line));
    }

    return { initUrl, segments, encrypted };
}

function getVariantPlaylistUrl(text: string, baseUrl: string): string | null {
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].trim().startsWith('#EXT-X-STREAM-INF')) continue;
        for (let next = index + 1; next < lines.length; next += 1) {
            const candidate = lines[next].trim();
            if (!candidate || candidate.startsWith('#')) continue;
            return resolveUrl(baseUrl, candidate);
        }
    }
    return null;
}

function sanitizeFileName(...parts: Array<string | undefined>): string {
    const name = parts.filter(part => part?.trim()).join('-').trim() || 'video';
    return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function extensionFromResource(resource: string, contentType?: string | null): string {
    const type = contentType || '';
    if (type.includes('video/webm')) return 'webm';
    if (type.includes('video/ogg')) return 'ogv';
    if (type.includes('video/quicktime')) return 'mov';
    if (type.includes('video/x-matroska')) return 'mkv';
    const match = /\.(\w{2,5})(?:[?#]|$)/.exec(resource.split(/[?#]/)[0]);
    return match?.[1] || 'mp4';
}

function startNativeDownload(url: string, filename: string) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    startNativeDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useUtilities({
    src,
    videoTitle,
    episodeName,
    mediaProxyEnabled = true,
    setToastMessage,
    setShowToast,
    toastTimeoutRef
}: UseUtilitiesProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadState, setDownloadState] = useState<DownloadState>(INITIAL_DOWNLOAD_STATE);
    const pausedRef = useRef(false);
    const cancelledRef = useRef(false);
    const resumeRef = useRef<(() => void) | null>(null);
    const activeRequestRef = useRef<AbortController | null>(null);
    const writableRef = useRef<WritableFileStreamLike | null>(null);

    const showToastNotification = useCallback((message: string) => {
        setToastMessage(message);
        setShowToast(true);

        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }

        toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
            setTimeout(() => setToastMessage(null), 300);
        }, 3000);
    }, [setToastMessage, setShowToast, toastTimeoutRef]);

    const updateDownloadState = useCallback((patch: Partial<DownloadState>) => {
        setDownloadState(previous => ({ ...previous, ...patch }));
    }, []);

    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            activeRequestRef.current?.abort();
            void writableRef.current?.abort?.();
        };
    }, []);

    const handleCopyLink = useCallback(async (url?: string) => {
        try {
            await navigator.clipboard.writeText(url || src);
            showToastNotification('链接已复制到剪贴板');
        } catch (error) {
            console.error('Copy failed:', error);
            showToastNotification('复制失败，请重试');
        }
    }, [src, showToastNotification]);

    const fetchDownloadResource = useCallback(async (resource: string, signal?: AbortSignal): Promise<Response> => {
        const directResponse = await fetch(resource, { signal });
        if (directResponse.ok || resource.startsWith('/api/proxy') || !mediaProxyEnabled) {
            return directResponse;
        }
        return fetch(`/api/proxy?url=${encodeURIComponent(resource)}`, { signal });
    }, [mediaProxyEnabled]);

    const waitWhilePaused = useCallback(async () => {
        if (!pausedRef.current) return;
        updateDownloadState({ status: 'paused', message: '下载已暂停' });
        await new Promise<void>((resolve) => {
            resumeRef.current = resolve;
        });
    }, [updateDownloadState]);

    const resolvePlaylist = useCallback(async (): Promise<ParsedMediaPlaylist> => {
        let playlistUrl = src;

        for (let depth = 0; depth < 3; depth += 1) {
            const response = await fetchDownloadResource(playlistUrl);
            if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
            const text = await response.text();

            if (text.includes('#EXT-X-STREAM-INF')) {
                const variantUrl = getVariantPlaylistUrl(text, playlistUrl);
                if (!variantUrl) throw new Error('未找到可下载的视频流');
                playlistUrl = variantUrl;
                continue;
            }

            const media = parseMediaPlaylist(text, playlistUrl);
            if (media.encrypted) throw new Error('该视频流已加密，暂不支持下载');
            if (media.segments.length === 0) throw new Error('播放列表中没有视频分片');
            return media;
        }

        throw new Error('无法解析视频播放列表');
    }, [fetchDownloadResource, src]);

    const downloadHls = useCallback(async (filename: string) => {
        updateDownloadState({
            status: 'preparing',
            progress: 0,
            message: '正在解析视频流',
            fileName: `${filename}.ts`,
            mode: 'stream',
        });

        const media = await resolvePlaylist();

        let writable: WritableFileStreamLike | null = null;
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: `${filename}.ts`,
                    types: [{
                        description: 'MPEG-TS 视频',
                        accept: { 'video/mp2t': ['.ts'] },
                    }],
                });
                writable = await handle.createWritable();
                writableRef.current = writable;
                updateDownloadState({ message: '已选择保存位置，开始下载', mode: 'stream' });
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    setDownloadState(INITIAL_DOWNLOAD_STATE);
                    setIsDownloading(false);
                    return;
                }
                console.warn('Save picker unavailable, falling back to browser download:', error);
            }
        }

        const parts: BlobPart[] = [];
        const totalSegments = media.segments.length;
        let bytesReceived = 0;

        const writeChunk = async (chunk: ArrayBuffer) => {
            bytesReceived += chunk.byteLength;
            if (writable) {
                await writable.write(chunk);
            } else {
                parts.push(chunk);
            }
        };

        if (media.initUrl) {
            await waitWhilePaused();
            const initResponse = await fetchDownloadResource(media.initUrl);
            if (!initResponse.ok) throw new Error(`下载失败：HTTP ${initResponse.status}`);
            await writeChunk(await initResponse.arrayBuffer());
        }

        let index = 0;
        while (index < media.segments.length) {
            await waitWhilePaused();
            if (cancelledRef.current) throw new DOMException('下载已取消', 'AbortError');

            const controller = new AbortController();
            activeRequestRef.current = controller;
            try {
                const segmentResponse = await fetchDownloadResource(media.segments[index], controller.signal);
                if (!segmentResponse.ok) throw new Error(`下载失败：HTTP ${segmentResponse.status}`);
                await writeChunk(await segmentResponse.arrayBuffer());
                index += 1;
                updateDownloadState({
                    status: 'downloading',
                    currentSegment: index,
                    totalSegments,
                    bytesReceived,
                    progress: Math.round((index / totalSegments) * 100),
                    message: `正在下载 ${index}/${totalSegments} 个分片`,
                });
            } catch (error) {
                if (pausedRef.current && error instanceof DOMException && error.name === 'AbortError') {
                    continue;
                }
                throw error;
            } finally {
                activeRequestRef.current = null;
            }
        }

        if (writable) {
            await writable.close();
            writableRef.current = null;
            updateDownloadState({
                status: 'completed',
                progress: 100,
                message: '已保存到所选位置',
            });
            showToastNotification('视频已保存到所选位置');
        } else {
            saveBlob(new Blob(parts, { type: 'video/mp2t' }), `${filename}.ts`);
            updateDownloadState({
                status: 'native',
                mode: 'browser',
                progress: 100,
                message: '已交给浏览器下载管理器',
            });
            showToastNotification('已交给浏览器下载，可在下载管理中查看或取消');
        }
    }, [fetchDownloadResource, resolvePlaylist, showToastNotification, updateDownloadState, waitWhilePaused]);

    const handleDownload = useCallback(async () => {
        if (isDownloading) return;
        cancelledRef.current = false;
        pausedRef.current = false;
        setIsDownloading(true);
        const filename = sanitizeFileName(videoTitle, episodeName);

        try {
            if (src.toLowerCase().includes('.m3u8')) {
                await downloadHls(filename);
            } else {
                const downloadUrl = src.startsWith('/api/proxy') || !mediaProxyEnabled
                    ? src
                    : `/api/proxy?url=${encodeURIComponent(src)}`;
                const downloadName = `${filename}.${extensionFromResource(src)}`;
                startNativeDownload(downloadUrl, downloadName);
                updateDownloadState({
                    status: 'native',
                    mode: 'native',
                    progress: 100,
                    fileName: downloadName,
                    message: '已交给浏览器下载管理器，可在浏览器中暂停、继续或取消',
                });
                showToastNotification('已开始浏览器下载，可在浏览器下载管理中查看');
            }
        } catch (error) {
            if (cancelledRef.current || (error instanceof DOMException && error.name === 'AbortError')) {
                setDownloadState(previous => ({
                    ...previous,
                    status: 'cancelled',
                    message: '下载已取消',
                }));
            } else {
                console.error('Download failed:', error);
                const message = error instanceof Error ? error.message : '下载失败，请重试';
                setDownloadState(previous => ({ ...previous, status: 'error', message }));
                showToastNotification(message);
            }
        } finally {
            setIsDownloading(false);
        }
    }, [downloadHls, episodeName, isDownloading, mediaProxyEnabled, showToastNotification, src, updateDownloadState, videoTitle]);

    const pauseDownload = useCallback(() => {
        if (!isDownloading || pausedRef.current) return;
        pausedRef.current = true;
        activeRequestRef.current?.abort();
        updateDownloadState({ status: 'paused', message: '下载已暂停' });
    }, [isDownloading, updateDownloadState]);

    const resumeDownload = useCallback(() => {
        if (!pausedRef.current) return;
        pausedRef.current = false;
        resumeRef.current?.();
        resumeRef.current = null;
        updateDownloadState({ status: 'downloading', message: '继续下载' });
    }, [updateDownloadState]);

    const cancelDownload = useCallback(() => {
        if (!isDownloading) return;
        cancelledRef.current = true;
        pausedRef.current = false;
        resumeRef.current?.();
        resumeRef.current = null;
        activeRequestRef.current?.abort();
        void writableRef.current?.abort?.();
        writableRef.current = null;
        setDownloadState(previous => ({
            ...previous,
            status: 'cancelled',
            message: '下载已取消',
        }));
        setIsDownloading(false);
        showToastNotification('下载已取消');
    }, [isDownloading, showToastNotification]);

    const dismissDownload = useCallback(() => {
        if (isDownloading) return;
        setDownloadState(INITIAL_DOWNLOAD_STATE);
    }, [isDownloading]);

    const utilityActions = useMemo(() => ({
        showToastNotification,
        handleCopyLink,
        handleDownload,
        pauseDownload,
        resumeDownload,
        cancelDownload,
        dismissDownload,
        downloadState,
        isDownloading,
    }), [
        showToastNotification,
        handleCopyLink,
        handleDownload,
        pauseDownload,
        resumeDownload,
        cancelDownload,
        dismissDownload,
        downloadState,
        isDownloading,
    ]);

    return utilityActions;
}
