import React from 'react';
import { Icons } from '@/components/ui/Icon';



interface DesktopRightControlsProps {
    isNativeFullscreen: boolean;
    isWebFullscreen: boolean;
    isPiPSupported: boolean;
    isAirPlaySupported: boolean;
    isCastAvailable: boolean;
    onToggleNativeFullscreen: () => void;
    onToggleWebFullscreen: () => void;
    onTogglePictureInPicture: () => void;
    onShowAirPlayMenu: () => void;
    onShowCastMenu: () => void;
    onDownload: () => void;
    isDownloading: boolean;
}

export function DesktopRightControls({
    isNativeFullscreen,
    isWebFullscreen,
    isPiPSupported,
    isAirPlaySupported,
    isCastAvailable,
    onToggleNativeFullscreen,
    onToggleWebFullscreen,
    onTogglePictureInPicture,
    onShowAirPlayMenu,
    onShowCastMenu,
    onDownload,
    isDownloading
}: DesktopRightControlsProps) {
    return (
        <div className="player-controls-right relative z-50 flex shrink-0 items-center gap-3">
            {/* Picture-in-Picture */}
            {
                isPiPSupported && (
                    <button
                        onClick={onTogglePictureInPicture}
                        className="btn-icon shrink-0"
                        aria-label="画中画"
                        title="画中画"
                    >
                        <Icons.PictureInPicture size={20} />
                    </button>
                )
            }

            {/* Download */}
            <button
                onClick={onDownload}
                disabled={isDownloading}
                className="btn-icon shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={isDownloading ? '正在下载' : '下载视频'}
                title={isDownloading ? '正在下载' : '下载视频'}
            >
                {isDownloading
                    ? <Icons.RefreshCw size={20} className="animate-spin" />
                    : <Icons.Download size={20} />}
            </button>

            {/* AirPlay */}
            {
                isAirPlaySupported && (
                    <button
                        onClick={onShowAirPlayMenu}
                        className="btn-icon shrink-0"
                        aria-label="隔空播放"
                        title="隔空播放"
                    >
                        <Icons.Airplay size={20} />
                    </button>
                )
            }

            {/* Google Cast */}
            {
                isCastAvailable && (
                    <button
                        onClick={onShowCastMenu}
                        className="btn-icon shrink-0"
                        aria-label="投屏"
                        title="投屏"
                    >
                        <Icons.Cast size={20} />
                    </button>
                )
            }

            {/* Web Fullscreen */}
            <button
                onClick={onToggleWebFullscreen}
                className="btn-icon shrink-0"
                aria-label={isWebFullscreen ? '退出网页全屏' : '网页全屏'}
                title={isWebFullscreen ? '退出网页全屏 (W)' : '网页全屏 (W)'}
            >
                {isWebFullscreen
                    ? <Icons.WebFullscreenExit size={20} className="text-[var(--accent-color)]" />
                    : <Icons.WebFullscreen size={20} />}
            </button>

            {/* Native Fullscreen */}
            <button
                onClick={onToggleNativeFullscreen}
                className="btn-icon shrink-0"
                aria-label={isNativeFullscreen ? '退出系统全屏' : '系统全屏'}
                title={isNativeFullscreen ? '退出系统全屏 (F)' : '系统全屏 (F)'}
            >
                {isNativeFullscreen ? <Icons.Minimize size={20} /> : <Icons.Maximize size={20} />}
            </button>
        </div >
    );
}
