import { useCallback, useMemo, useRef, useState } from 'react';
import { iterateHlsSegments } from '@/lib/player/client-hls-download';

interface UseUtilitiesProps {
    src: string;
    videoTitle?: string;
    episodeName?: string;
    mediaProxyEnabled?: boolean;
    setToastMessage: (message: string | null) => void;
    setShowToast: (show: boolean) => void;
    toastTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export type DownloadStatus = 'idle' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface DownloadState {
    status: DownloadStatus;
    progress: number;
    currentSegment: number;
    totalSegments: number;
    bytesReceived: number;
    fileName?: string;
    message?: string;
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
            types?: Array<{ description?: string; accept: Record<string, string[]> }>;
        }) => Promise<FileSystemFileHandleLike>;
    }
}

const INITIAL_STATE: DownloadState = {
    status: 'idle',
    progress: 0,
    currentSegment: 0,
    totalSegments: 0,
    bytesReceived: 0,
};

function sanitizeFileName(...parts: Array<string | undefined>): string {
    const name = parts.filter(part => part?.trim()).join('-').trim() || 'video';
    return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function extensionFromResource(resource: string): string {
    const match = /\.(\w{2,5})(?:[?#]|$)/.exec(resource.split(/[?#]/)[0]);
    return match?.[1] || 'mp4';
}

function unwrapProxyUrl(resource: string): string {
    if (!resource.startsWith('/api/proxy?url=')) return resource;
    try {
        return new URL(resource, window.location.origin).searchParams.get('url') || resource;
    } catch {
        return resource;
    }
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

function fallbackCopyText(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
        return document.execCommand('copy');
    } finally {
        textarea.remove();
    }
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
    const [downloadState, setDownloadState] = useState<DownloadState>(INITIAL_STATE);
    const pausedRef = useRef(false);
    const cancelledRef = useRef(false);
    const pauseResolverRef = useRef<(() => void) | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const writableRef = useRef<WritableFileStreamLike | null>(null);

    const showToastNotification = useCallback((message: string) => {
        setToastMessage(message);
        setShowToast(true);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => {
            setShowToast(false);
            setTimeout(() => setToastMessage(null), 300);
        }, 3000);
    }, [setToastMessage, setShowToast, toastTimeoutRef]);

    const handleCopyLink = useCallback(async (url?: string) => {
        const text = url || src;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else if (!fallbackCopyText(text)) {
                throw new Error('Clipboard API unavailable');
            }
            showToastNotification('链接已复制到剪贴板');
        } catch (error) {
            if (fallbackCopyText(text)) {
                showToastNotification('链接已复制到剪贴板');
                return;
            }
            console.error('Copy failed:', error);
            showToastNotification('复制失败，请重试');
        }
    }, [src, showToastNotification]);

    const waitIfPaused = useCallback(async () => {
        if (!pausedRef.current) return;
        setDownloadState(previous => ({ ...previous, status: 'paused', message: '下载已暂停' }));
        await new Promise<void>(resolve => {
            pauseResolverRef.current = resolve;
        });
    }, []);

    const downloadHls = useCallback(async (fileName: string) => {
        const controller = new AbortController();
        abortRef.current = controller;
        setDownloadState({
            status: 'preparing',
            progress: 0,
            currentSegment: 0,
            totalSegments: 0,
            bytesReceived: 0,
            fileName,
            message: '正在解析视频流',
        });

        let writable: WritableFileStreamLike | null = null;
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'MPEG-TS 视频', accept: { 'video/mp2t': ['.ts'] } }],
                });
                writable = await handle.createWritable();
                writableRef.current = writable;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    setDownloadState(INITIAL_STATE);
                    return;
                }
                console.warn('Save picker unavailable, using browser blob download:', error);
            }
        }

        const parts: BlobPart[] = [];
        let bytesReceived = 0;

        for await (const chunk of iterateHlsSegments({
            src,
            mediaProxyEnabled,
            signal: controller.signal,
            waitIfPaused,
            isCancelled: () => cancelledRef.current,
        })) {
            if (cancelledRef.current) throw new DOMException('下载已取消', 'AbortError');
            const chunkData = chunk.data.slice().buffer;
            if (writable) {
                await writable.write(chunkData);
            } else {
                parts.push(chunkData);
            }
            bytesReceived += chunk.data.byteLength;
            setDownloadState({
                status: 'downloading',
                progress: Math.round((chunk.index / chunk.total) * 100),
                currentSegment: chunk.index,
                totalSegments: chunk.total,
                bytesReceived,
                fileName,
                message: `正在下载 ${chunk.index}/${chunk.total} 个分片`,
            });
        }

        if (writable) {
            await writable.close();
            writableRef.current = null;
            setDownloadState(previous => ({ ...previous, status: 'completed', progress: 100, message: '已保存到所选位置' }));
            showToastNotification('视频已保存到所选位置');
        } else {
            const blob = new Blob(parts, { type: 'video/mp2t' });
            const objectUrl = URL.createObjectURL(blob);
            startNativeDownload(objectUrl, fileName);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
            setDownloadState(previous => ({ ...previous, status: 'completed', progress: 100, message: '下载完成，已交给浏览器保存' }));
            showToastNotification('下载完成，已交给浏览器保存');
        }
    }, [mediaProxyEnabled, showToastNotification, src, waitIfPaused]);

    const handleDownload = useCallback(async () => {
        if (isDownloading) return;
        cancelledRef.current = false;
        pausedRef.current = false;
        setIsDownloading(true);
        const filename = sanitizeFileName(videoTitle, episodeName);

        try {
            const sourceUrl = unwrapProxyUrl(src);
            const isHls = sourceUrl.toLowerCase().includes('.m3u8');

            if (isHls) {
                await downloadHls(`${filename}.ts`);
            } else {
                const downloadUrl = src.startsWith('/api/proxy') || !mediaProxyEnabled
                    ? src
                    : `/api/proxy?url=${encodeURIComponent(src)}`;
                const downloadName = `${filename}.${extensionFromResource(src)}`;
                startNativeDownload(downloadUrl, downloadName);
                showToastNotification('已开始浏览器下载，可离开当前页面');
            }
        } catch (error) {
            if (cancelledRef.current || (error instanceof DOMException && error.name === 'AbortError')) {
                setDownloadState(previous => ({ ...previous, status: 'cancelled', message: '下载已取消' }));
            } else {
                console.error('Download failed:', error);
                const message = error instanceof Error ? error.message : '下载失败，请重试';
                setDownloadState(previous => ({ ...previous, status: 'error', message }));
                showToastNotification(message);
            }
        } finally {
            abortRef.current = null;
            setIsDownloading(false);
        }
    }, [downloadHls, episodeName, isDownloading, mediaProxyEnabled, showToastNotification, src, videoTitle]);

    const pauseDownload = useCallback(() => {
        if (!isDownloading || pausedRef.current) return;
        pausedRef.current = true;
        setDownloadState(previous => ({ ...previous, status: 'paused', message: '下载已暂停' }));
    }, [isDownloading]);

    const resumeDownload = useCallback(() => {
        if (!pausedRef.current) return;
        pausedRef.current = false;
        pauseResolverRef.current?.();
        pauseResolverRef.current = null;
        setDownloadState(previous => ({ ...previous, status: 'downloading', message: '继续下载' }));
    }, []);

    const cancelDownload = useCallback(() => {
        if (!isDownloading) return;
        cancelledRef.current = true;
        pausedRef.current = false;
        pauseResolverRef.current?.();
        pauseResolverRef.current = null;
        abortRef.current?.abort();
        void writableRef.current?.abort?.();
        writableRef.current = null;
        setDownloadState(previous => ({ ...previous, status: 'cancelled', message: '下载已取消' }));
        setIsDownloading(false);
        showToastNotification('下载已取消');
    }, [isDownloading, showToastNotification]);

    const dismissDownload = useCallback(() => {
        if (isDownloading) return;
        setDownloadState(INITIAL_STATE);
    }, [isDownloading]);

    return useMemo(() => ({
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
}
