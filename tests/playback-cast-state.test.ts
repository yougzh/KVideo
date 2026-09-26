import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

test('starting a new playback clears any existing cast state', () => {
  const source = readSource('components/player/hooks/desktop/useCastControls.ts');

  assert.match(source, /previousSrcRef\s*=\s*useRef<string>\(src\)/);
  assert.match(source, /previousSrcRef\.current === src/);
  assert.match(source, /previousSrcRef\.current = src/);
  assert.match(source, /endCastSession\(\)/);
  assert.match(source, /setIsCasting\(false\)/);
});

test('actual playback start hides the loading overlay', () => {
  const controls = readSource('components/player/hooks/desktop/usePlaybackControls.ts');
  const player = readSource('components/player/DesktopVideoPlayer.tsx');

  assert.match(controls, /handlePlaybackStarted\s*=\s*useCallback/);
  assert.match(controls, /HAVE_FUTURE_DATA/);
  assert.match(player, /onLoadedData=\{handlePlaybackStarted\}/);
  assert.match(player, /onPlaying=\{handlePlaybackStarted\}/);
});
