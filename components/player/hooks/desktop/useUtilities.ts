import { useCallback, useMemo, useState } from 'react';

interface UseUtilitiesProps {
    src: string;
    videoTitle?: string;
    episodeName?: string;
    setToastMessage: (message: string | null) => void;
    setShowToast: (show: boolean) => void;
    toastTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

interface ParsedMediaPlaylist {
    initUrl: string | null;
    segments: string[];
    encrypted: boolean;
}

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

function extensionFromResource(resource: string, contentType: string | null): string {
    const type = contentType || '';
    if (type.includes('video/webm')) return 'webm';
    if (type.includes('video/ogg')) return 'ogv';
    if (type.includes('video/quicktime')) return 'mov';
    if (type.includes('video/x-matroska')) return 'mkv';
    const match = /\.(\w{2,5})(?:[?#]|$)/.exec(resource.split(/[?#]/)[0]);
    return match?.[1] || 'mp4';
}

function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useUtilities({
    src,
    videoTitle,
    episodeName,
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
        try {
            await navigator.clipboard.writeText(url || src);
            showToastNotification('链接已复制到剪贴板');
        } catch (error) {
            console.error('Copy failed:', error);
            showToastNotification('复制失败，请重试');
        }
    }, [src, showToastNotification]);

    const fetchDownloadResource = useCallback(async (resource: string): Promise<Response> => {
        try {
            const response = await fetch(resource);
            if (response.ok) return response;
        } catch (error) {
            if (resource.startsWith('/api/proxy')) throw error;
        }

        if (resource.startsWith('/api/proxy')) {
            throw new Error('download request failed');
        }
        return fetch(`/api/proxy?url=${encodeURIComponent(resource)}`);
    }, []);

    const downloadHls = useCallback(async (filename: string) => {
        let playlistUrl = src;
        let media: ParsedMediaPlaylist | null = null;

        for (let depth = 0; depth < 3 && !media; depth += 1) {
            const response = await fetchDownloadResource(playlistUrl);
            if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
            const text = await response.text();

            if (text.includes('#EXT-X-STREAM-INF')) {
                const variantUrl = getVariantPlaylistUrl(text, playlistUrl);
                if (!variantUrl) throw new Error('未找到可下载的视频流');
                playlistUrl = variantUrl;
                continue;
            }

            media = parseMediaPlaylist(text, playlistUrl);
        }

        if (!media) throw new Error('无法解析视频播放列表');
        if (media.encrypted) throw new Error('该视频流已加密，暂不支持下载');
        if (media.segments.length === 0) throw new Error('播放列表中没有视频分片');

        const parts: BlobPart[] = [];
        if (media.initUrl) {
            const initResponse = await fetchDownloadResource(media.initUrl);
            if (!initResponse.ok) throw new Error(`下载失败：HTTP ${initResponse.status}`);
            parts.push(await initResponse.arrayBuffer());
        }

        for (let index = 0; index < media.segments.length; index += 1) {
            showToastNotification(`正在下载视频分片 ${index + 1}/${media.segments.length}`);
            const segmentResponse = await fetchDownloadResource(media.segments[index]);
            if (!segmentResponse.ok) throw new Error(`下载失败：HTTP ${segmentResponse.status}`);
            parts.push(await segmentResponse.arrayBuffer());
        }

        saveBlob(new Blob(parts, { type: 'video/mp2t' }), `${filename}.ts`);
    }, [fetchDownloadResource, showToastNotification, src]);

    const handleDownload = useCallback(async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        const filename = sanitizeFileName(videoTitle, episodeName);

        try {
            if (src.toLowerCase().includes('.m3u8')) {
                showToastNotification('正在准备视频下载');
                await downloadHls(filename);
            } else {
                showToastNotification('正在下载视频');
                const response = await fetchDownloadResource(src);
                if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
                const blob = await response.blob();
                const extension = extensionFromResource(src, blob.type);
                saveBlob(blob, `${filename}.${extension}`);
            }
            showToastNotification('视频已保存到本地');
        } catch (error) {
            console.error('Download failed:', error);
            showToastNotification(error instanceof Error ? error.message : '下载失败，请重试');
        } finally {
            setIsDownloading(false);
        }
    }, [downloadHls, episodeName, fetchDownloadResource, isDownloading, showToastNotification, src, videoTitle]);

    const utilityActions = useMemo(() => ({
        showToastNotification,
        handleCopyLink,
        handleDownload,
        isDownloading
    }), [showToastNotification, handleCopyLink, handleDownload, isDownloading]);

    return utilityActions;
}
