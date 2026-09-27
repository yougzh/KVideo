'use client';

import { useEffect, useState } from 'react';
import { Icons } from '@/components/ui/Icon';
import type { DownloadState } from '../hooks/desktop/useUtilities';

interface DownloadManagerProps {
    state: DownloadState;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
    onDismiss: () => void;
}

export function DownloadManager({ state, onPause, onResume, onCancel, onDismiss }: DownloadManagerProps) {
    const [expanded, setExpanded] = useState(false);
    const isActive = state.status === 'preparing' || state.status === 'downloading' || state.status === 'paused';

    useEffect(() => {
        if (isActive) return;
        const timeout = window.setTimeout(() => setExpanded(false), 4000);
        return () => window.clearTimeout(timeout);
    }, [isActive, state.status]);

    if (state.status === 'idle') return null;

    if (!expanded) {
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                className="absolute right-3 top-3 z-[70] flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-xl"
                aria-label="打开下载管理"
            >
                <Icons.Download size={14} className="text-[var(--accent-color)]" />
                <span>{state.status === 'paused' ? '已暂停' : isActive ? '下载中' : state.status === 'completed' ? '已完成' : '下载'}</span>
                {isActive && <span className="text-white/70">{state.progress}%</span>}
            </button>
        );
    }

    return (
        <div className="absolute right-3 top-3 z-[70] w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-white/15 bg-black/85 p-3 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-2">
                <Icons.Download size={18} className="mt-0.5 shrink-0 text-[var(--accent-color)]" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{state.fileName || '视频下载'}</div>
                    <div className="mt-1 text-xs text-white/70">{state.message}</div>
                </div>
                <button
                    type="button"
                    onClick={() => isActive ? setExpanded(false) : onDismiss()}
                    className="btn-icon h-7 w-7 shrink-0"
                    aria-label="收起下载面板"
                >
                    <Icons.X size={16} />
                </button>
            </div>
            {isActive && (
                <>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full rounded-full bg-[var(--accent-color)]" style={{ width: `${Math.max(2, state.progress)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-white/60">
                        <span>{state.totalSegments > 0 ? `${state.currentSegment}/${state.totalSegments} 段` : '准备中'}</span>
                        <span>{state.bytesReceived > 0 ? `${(state.bytesReceived / 1024 / 1024).toFixed(1)} MB` : ''}</span>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={state.status === 'paused' ? onResume : onPause}
                            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20"
                        >
                            {state.status === 'paused' ? <Icons.Play size={14} /> : <Icons.Pause size={14} />}
                            {state.status === 'paused' ? '继续' : '暂停'}
                        </button>
                        <button type="button" onClick={onCancel} className="rounded-md bg-red-500/20 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/30">
                            取消
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
