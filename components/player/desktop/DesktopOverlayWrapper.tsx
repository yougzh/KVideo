import React from 'react';
import { DesktopOverlay } from './DesktopOverlay';
import { useDesktopPlayerState } from '../hooks/useDesktopPlayerState';

interface DesktopOverlayWrapperProps {
    data: ReturnType<typeof useDesktopPlayerState>['data'];
    actions: ReturnType<typeof useDesktopPlayerState>['actions'];
    showControls: boolean;
    isRotated?: boolean;
    onTogglePlay: () => void;
    onSkipForward: () => void;
    onSkipBackward: () => void;
    isTransitioningToNextEpisode?: boolean;
    showMoreMenu: boolean;
    isProxied: boolean;
    onToggleMoreMenu: () => void;
    onMoreMenuMouseEnter: () => void;
    onMoreMenuMouseLeave: () => void;
    onCopyLink: (type?: 'original' | 'proxy') => void;
    // Speed Menu Props
    playbackRate: number;
    showSpeedMenu: boolean;
    speeds: number[];
    onToggleSpeedMenu: () => void;
    onSpeedChange: (speed: number) => void;
    onSpeedMenuMouseEnter: () => void;
    onSpeedMenuMouseLeave: () => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export function DesktopOverlayWrapper({
    data,
    actions,
    showControls,
    isRotated = false,
    onTogglePlay,
    onSkipForward,
    onSkipBackward,
    isTransitioningToNextEpisode = false,
    showMoreMenu,
    isProxied,
    onToggleMoreMenu,
    onMoreMenuMouseEnter,
    onMoreMenuMouseLeave,
    onCopyLink,
    playbackRate,
    showSpeedMenu,
    speeds,
    onToggleSpeedMenu,
    onSpeedChange,
    onSpeedMenuMouseEnter,
    onSpeedMenuMouseLeave,
    containerRef,
}: DesktopOverlayWrapperProps) {
    const {
        isLoading,
        isPlaying,
        showSkipForwardIndicator,
        showSkipBackwardIndicator,
        skipForwardAmount,
        skipBackwardAmount,
        isSkipForwardAnimatingOut,
        isSkipBackwardAnimatingOut,
        showToast,
        toastMessage,
    } = data;

    return (
        <DesktopOverlay
            isLoading={isLoading}
            isTransitioningToNextEpisode={isTransitioningToNextEpisode}
            isPlaying={isPlaying}
            showSkipForwardIndicator={showSkipForwardIndicator}
            showSkipBackwardIndicator={showSkipBackwardIndicator}
            skipForwardAmount={skipForwardAmount}
            skipBackwardAmount={skipBackwardAmount}
            isSkipForwardAnimatingOut={isSkipForwardAnimatingOut}
            isSkipBackwardAnimatingOut={isSkipBackwardAnimatingOut}
            showToast={showToast}
            toastMessage={toastMessage}
            showControls={showControls}
            onTogglePlay={onTogglePlay}
            onSkipForward={onSkipForward}
            onSkipBackward={onSkipBackward}
            showMoreMenu={showMoreMenu}
            isProxied={isProxied}
            onToggleMoreMenu={onToggleMoreMenu}
            onMoreMenuMouseEnter={onMoreMenuMouseEnter}
            onMoreMenuMouseLeave={onMoreMenuMouseLeave}
            onCopyLink={onCopyLink}
            playbackRate={playbackRate}
            showSpeedMenu={showSpeedMenu}
            speeds={speeds}
            onToggleSpeedMenu={onToggleSpeedMenu}
            onSpeedChange={onSpeedChange}
            onSpeedMenuMouseEnter={onSpeedMenuMouseEnter}
            onSpeedMenuMouseLeave={onSpeedMenuMouseLeave}
            containerRef={containerRef}
            isRotated={isRotated}
        />
    );
}
