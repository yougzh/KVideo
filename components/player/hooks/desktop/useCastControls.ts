'use client';

import { useCallback, useEffect, useRef, useMemo } from 'react';

interface UseCastControlsProps {
    src: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    setIsCastAvailable: (available: boolean) => void;
    setIsCasting: (casting: boolean) => void;
}

declare global {
    interface Window {
        chrome?: ChromeGlobal;
        cast?: CastGlobal;
        __onGCastApiAvailable?: (isAvailable: boolean) => void;
    }
}

interface ChromeGlobal {
    AutoJoinPolicy?: Record<string, string>;
    cast?: {
        media?: {
            DEFAULT_MEDIA_RECEIVER_APP_ID?: string;
            MediaInfo?: new (contentId: string, contentType: string) => CastMediaInfo;
            LoadRequest?: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
        };
    };
}

interface CastGlobal {
    framework?: {
        CastContext?: { getInstance?: () => CastContextLike };
        CastContextEventType?: Record<string, string>;
        SessionState?: Record<string, string>;
        getCurrentSession?: () => CastSessionLike | null;
    };
}

interface CastMediaInfo {
    contentType?: string;
}

interface CastLoadRequest {
    currentTime?: number;
}

interface CastContextLike {
    getCurrentSession?: () => CastSessionLike | null;
    requestSession?: () => Promise<void> | void;
    setOptions?: (options: Record<string, unknown>) => void;
    addEventListener?: (type: string, listener: (event: CastSessionEvent) => void) => void;
    removeEventListener?: (type: string, listener: (event: CastSessionEvent) => void) => void;
}

interface CastSessionLike {
    loadMedia?: (request: CastLoadRequest) => Promise<unknown>;
    endSession?: (stopCasting?: boolean) => void;
}

interface CastSessionEvent {
    sessionState?: string;
}

export function useCastControls({
    src,
    videoRef,
    setIsCastAvailable,
    setIsCasting
}: UseCastControlsProps) {
    const castContextRef = useRef<CastContextLike | null>(null);
    const loadMediaRef = useRef<() => void>(() => {});
    const previousSrcRef = useRef<string>(src);

    const endCastSession = useCallback(() => {
        if (typeof window === 'undefined') return;
        const castContext = castContextRef.current;
        const castFramework = window.cast?.framework;
        const session = castContext?.getCurrentSession?.() || castFramework?.getCurrentSession?.();
        session?.endSession?.(true);
        setIsCasting(false);
    }, [setIsCasting]);

    useEffect(() => {
        if (previousSrcRef.current === src) return;
        previousSrcRef.current = src;
        endCastSession();
    }, [endCastSession, src]);

    const isCastSdkReady = useCallback(() => {
        if (typeof window === 'undefined') return false;

        return Boolean(
            window.cast?.framework?.CastContext?.getInstance &&
            window.cast?.framework?.CastContextEventType?.SESSION_STATE_CHANGED &&
            window.cast?.framework?.SessionState &&
            window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID &&
            window.chrome?.cast?.media?.MediaInfo &&
            window.chrome?.cast?.media?.LoadRequest &&
            window.chrome?.AutoJoinPolicy?.ORIGIN_SCOPED
        );
    }, []);

    const loadMedia = useCallback(() => {
        const castMedia = window.chrome?.cast?.media;
        const mediaInfoConstructor = castMedia?.MediaInfo;
        const loadRequestConstructor = castMedia?.LoadRequest;
        if (!castContextRef.current || !src || !mediaInfoConstructor || !loadRequestConstructor) return;

        const castContext = castContextRef.current;
        const session = castContext.getCurrentSession?.();
        if (!session) return;

        const isHls = src.toLowerCase().includes('.m3u8');
        const mediaInfo = new mediaInfoConstructor(
            src,
            isHls ? 'application/x-mpegurl' : 'video/mp4'
        );

        const request = new loadRequestConstructor(mediaInfo);

        // Sync current time
        if (videoRef.current) {
            request.currentTime = videoRef.current.currentTime;
        }

        session.loadMedia?.(request).then(
            () => console.log('Cast: Media loaded successfully'),
            (error: unknown) => console.error('Cast: Media load failed', error)
        );
    }, [src, videoRef]);

    useEffect(() => {
        loadMediaRef.current = loadMedia;
    }, [loadMedia]);

    useEffect(() => {
        let sessionStateListener: ((event: CastSessionEvent) => void) | null = null;
        let onGCastApiAvailable: ((isAvailable: boolean) => void) | null = null;

        const markCastUnavailable = () => {
            castContextRef.current = null;
            setIsCastAvailable(false);
            setIsCasting(false);
        };

        // Function to initialize Cast
        const initializeCastApi = () => {
            if (!isCastSdkReady()) {
                markCastUnavailable();
                return;
            }

            try {
                const castContext = window.cast?.framework?.CastContext?.getInstance?.();
                if (!castContext) {
                    markCastUnavailable();
                    return;
                }

                castContextRef.current = castContext;

                castContext.setOptions?.({
                    receiverApplicationId: window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID,
                    autoJoinPolicy: window.chrome?.AutoJoinPolicy?.ORIGIN_SCOPED
                });

                // SDK loaded — show cast button immediately.
                // requestSession() will re-scan and show Chrome's native device picker.
                setIsCastAvailable(true);

                // Monitor session state
                sessionStateListener = (event: CastSessionEvent) => {
                    const sessionState = event.sessionState;
                    const sessionStates = window.cast?.framework?.SessionState;
                    const isSessionActive = sessionState === sessionStates?.SESSION_STARTED ||
                        sessionState === sessionStates?.SESSION_RESUMED;

                    setIsCasting(isSessionActive);

                    if (isSessionActive && videoRef.current) {
                        videoRef.current.pause();
                        loadMediaRef.current();
                    }
                };

                const castEventType = window.cast?.framework?.CastContextEventType?.SESSION_STATE_CHANGED;
                if (!castEventType) {
                    markCastUnavailable();
                    return;
                }

                castContext.addEventListener?.(
                    castEventType,
                    sessionStateListener
                );
            } catch (error) {
                console.warn('Cast SDK is not usable in this browser context.', error);
                markCastUnavailable();
            }
        };

        // If API is already loaded
        if (isCastSdkReady()) {
            initializeCastApi();
        } else {
            // Wait for API to be available
            onGCastApiAvailable = (isAvailable: boolean) => {
                if (isAvailable) {
                    initializeCastApi();
                } else {
                    markCastUnavailable();
                }
            };
            window.__onGCastApiAvailable = onGCastApiAvailable;
        }

        return () => {
            if (onGCastApiAvailable && window.__onGCastApiAvailable === onGCastApiAvailable) {
                delete window.__onGCastApiAvailable;
            }

            const castContext = castContextRef.current;
            if (
                sessionStateListener &&
                castContext?.removeEventListener &&
                window.cast?.framework?.CastContextEventType?.SESSION_STATE_CHANGED
            ) {
                castContext.removeEventListener(
                    window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                    sessionStateListener
                );
            }
        };
    }, [isCastSdkReady, setIsCastAvailable, setIsCasting, videoRef]);

    const showCastMenu = useCallback(() => {
        if (!isCastSdkReady()) return;

        try {
            window.cast?.framework?.CastContext?.getInstance?.().requestSession?.();
        } catch (error) {
            console.warn('Cast session request failed.', error);
            setIsCastAvailable(false);
        }
    }, [isCastSdkReady, setIsCastAvailable]);

    const castActions = useMemo(() => ({
        showCastMenu
    }), [showCastMenu]);

    return castActions;
}
