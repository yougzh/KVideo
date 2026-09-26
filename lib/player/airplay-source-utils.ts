export interface NativeAirPlaySourceOptions {
    isIOS: boolean;
    isNativeHlsSupported: boolean;
}

/**
 * iOS AirPlay works best with Safari's native HLS stack. Locally generated
 * blob playlists are readable by the sender page but not by the TV receiver,
 * which commonly degrades AirPlay to audio-only playback.
 */
export function shouldPreferProxiedNativePlayback({
    isIOS,
    isNativeHlsSupported,
}: NativeAirPlaySourceOptions): boolean {
    if (!isIOS || !isNativeHlsSupported) {
        return false;
    }

    // The caller may already provide a proxied source. Native HLS still has to
    // win; otherwise hls.js/ManagedMSE turns the stream into an MSE composition
    // that AirPlay receivers commonly play as audio-only.
    return true;
}
