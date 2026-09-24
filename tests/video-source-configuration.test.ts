import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isVideoSourceEnabled,
  normalizeVideoSource,
} from '../lib/utils/video-source';

const projectRoot = process.cwd();
const readProjectFile = (path: string) => readFileSync(join(projectRoot, path), 'utf8');

test('video sources without an enabled flag remain enabled', () => {
  const source = {
    id: 'legacy-source',
    name: 'Legacy Source',
    baseUrl: 'https://example.com/api.php/provide/vod',
  };

  assert.equal(isVideoSourceEnabled(source), true);
  assert.deepEqual(normalizeVideoSource(source), {
    ...source,
    searchPath: '',
    detailPath: '',
    enabled: true,
  });
});

test('video sources with enabled false stay disabled', () => {
  const source = {
    id: 'disabled-source',
    name: 'Disabled Source',
    baseUrl: 'https://example.com/api.php/provide/vod',
    searchPath: '/provide/vod',
    detailPath: '/provide/vod',
    enabled: false,
  };

  assert.equal(isVideoSourceEnabled(source), false);
  assert.deepEqual(normalizeVideoSource(source), source);
});

test('stored sources are normalized and searches honor default-enabled semantics', () => {
  const settingsStore = readProjectFile('lib/store/settings-store.ts');
  assert.match(settingsStore, /\.map\(normalizeVideoSource\)/);

  for (const path of [
    'lib/hooks/useHomePage.ts',
    'lib/hooks/usePremiumHomePage.ts',
    'lib/hooks/usePremiumTagManager.ts',
    'app/api/premium/types/route.ts',
    'app/api/premium/category/route.ts',
  ]) {
    const source = readProjectFile(path);
    assert.doesNotMatch(source, /filter\(s => s\.enabled\)/);
    assert.match(source, /isVideoSourceEnabled|enabled !== false/);
  }
});

test('home and premium pages distinguish missing sources from empty search results', () => {
  for (const path of ['app/page.tsx', 'app/premium/page.tsx']) {
    const source = readProjectFile(path);
    assert.match(source, /sourceState === 'empty'/);
    assert.match(source, /<SourceSetupEmptyState/);
    assert.match(source, /sourceState === 'ready' && results\.length === 0/);
  }

  const emptyState = readProjectFile('components/home/SourceSetupEmptyState.tsx');
  assert.match(emptyState, /尚未配置视频源/);
  assert.match(emptyState, /前往设置/);
  assert.match(emptyState, /\/settings#personal-sources/);
  assert.match(emptyState, /\/premium\/settings#premium-sources/);
});
