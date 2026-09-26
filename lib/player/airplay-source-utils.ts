export interface NativeAirPlaySourceOptions {
    isIOS: boolean;
    mediaProxyEnabled: boolean;
    isNativeHlsSupported: boolean;
    src: string;
}

/**
 * iOS AirPlay works best with Safari's native HLS stack. Locally generated
 * blob playlists are readable by the sender page but not by the TV receiver,
 * which commonly degrades AirPlay to audio-only playback.
 */
export function shouldPreferProxiedNativePlayback({
    isIOS,
    mediaProxyEnabled,
    isNativeHlsSupported,
    src,
}: NativeAirPlaySourceOptions): boolean {
    if (!isIOS || !mediaProxyEnabled || !isNativeHlsSupported) {
        return false;
    }

    return !src.includes('/api/proxy');
}
