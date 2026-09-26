import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldPreferProxiedNativePlayback } from '../../../lib/player/airplay-source-utils';

test('iOS native HLS uses the server proxy so AirPlay receives real segments', () => {
  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    isNativeHlsSupported: true,
  }), true);
  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    isNativeHlsSupported: true,
  }), true);
});

test('AirPlay native HLS preference ignores non-iOS and unsupported sources', () => {
  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: false,
    isNativeHlsSupported: true,
  }), false);

  assert.equal(shouldPreferProxiedNativePlayback({
    isIOS: true,
    isNativeHlsSupported: false,
  }), false);
});
