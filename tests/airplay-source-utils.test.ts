import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldPreferProxiedNativePlayback } from '../lib/player/airplay-source-utils';

test('iOS native HLS uses the server proxy so AirPlay receives real segments', () => {
  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    mediaProxyEnabled: true,
    isNativeHlsSupported: true,
    src: 'https://example.com/video/play?episode=1',
  }), true);
});

test('AirPlay proxy preference ignores non-iOS, proxied, and unsupported sources', () => {
  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: false,
    mediaProxyEnabled: true,
    isNativeHlsSupported: true,
    src: 'https://example.com/video/play?episode=1',
  }), false);

  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    mediaProxyEnabled: true,
    isNativeHlsSupported: true,
    src: '/api/proxy?url=https%3A%2F%2Fexample.com%2Fvideo%2Findex.m3u8',
  }), false);

  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    mediaProxyEnabled: true,
    isNativeHlsSupported: false,
    src: 'https://example.com/video/play?episode=1',
  }), false);

  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    mediaProxyEnabled: false,
    isNativeHlsSupported: true,
    src: 'https://example.com/video/play?episode=1',
  }), false);
});
