import { useCallback, useMemo, useState } from 'react';

interface UseUtilitiesProps {
    src: string;
    videoTitle?: string;
    episodeName?: string;
    mediaProxyEnabled?: boolean;
    setToastMessage: (message: string | null) => void;
    setShowToast: (show: boolean) => void;
    toastTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

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
        const parsed = new URL(resource, window.location.origin);
        return parsed.searchParams.get('url') || resource;
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
    textarea.style.top = '0';
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

    const handleDownload = useCallback(async () => {
        if (isDownloading) return;
        setIsDownloading(true);

        try {
            const filename = sanitizeFileName(videoTitle, episodeName);
            const sourceUrl = unwrapProxyUrl(src);
            const isHls = sourceUrl.toLowerCase().includes('.m3u8');

            if (isHls) {
                const downloadName = `${filename}.ts`;
                const downloadUrl = `/api/download?url=${encodeURIComponent(sourceUrl)}&filename=${encodeURIComponent(downloadName)}`;

                const probeResponse = await fetch(`${downloadUrl}&probe=1`, { cache: 'no-store' });
                if (!probeResponse.ok) {
                    const errorBody = await probeResponse.json().catch(() => null) as { error?: string } | null;
                    throw new Error(errorBody?.error || `下载准备失败：HTTP ${probeResponse.status}`);
                }

                startNativeDownload(downloadUrl, downloadName);
                showToastNotification('已交给浏览器下载，可离开当前页面；暂停或取消请在浏览器下载管理中操作');
                return;
            }

            const downloadUrl = src.startsWith('/api/proxy') || !mediaProxyEnabled
                ? src
                : `/api/proxy?url=${encodeURIComponent(src)}`;
            const downloadName = `${filename}.${extensionFromResource(src)}`;
            startNativeDownload(downloadUrl, downloadName);
            showToastNotification('已开始浏览器下载，可离开当前页面');
        } catch (error) {
            console.error('Download failed:', error);
            showToastNotification(error instanceof Error ? error.message : '下载失败，请重试');
        } finally {
            setIsDownloading(false);
        }
    }, [episodeName, isDownloading, mediaProxyEnabled, showToastNotification, src, videoTitle]);

    return useMemo(() => ({
        showToastNotification,
        handleCopyLink,
        handleDownload,
        isDownloading,
    }), [showToastNotification, handleCopyLink, handleDownload, isDownloading]);
}
