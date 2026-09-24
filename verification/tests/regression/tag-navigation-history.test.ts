import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTagUrl,
  getTagIdFromSearchParams,
  RECOMMEND_TAG_ID,
} from '../../../lib/utils/tag-navigation';
import {
  createContentCacheKey,
  readContentSnapshot,
  writeContentSnapshot,
} from '../../../lib/utils/content-snapshot-cache';

const projectRoot = process.cwd();

const readProjectFile = (path: string) => readFileSync(join(projectRoot, path), 'utf8');

test('tag URLs preserve existing query parameters and encode tag ids', () => {
  assert.equal(
    buildTagUrl('/', 'q=test', 'tag_喜剧'),
    '/?q=test&tag=tag_%E5%96%9C%E5%89%A7'
  );
  assert.equal(buildTagUrl('/premium', '', RECOMMEND_TAG_ID), '/premium?tag=recommend');
});

test('tag ids are restored from URL parameters with a safe fallback', () => {
  assert.equal(
    getTagIdFromSearchParams(new URLSearchParams('tag=custom_123'), 'popular'),
    'custom_123'
  );
  assert.equal(
    getTagIdFromSearchParams(new URLSearchParams('tag=%20%20'), 'popular'),
    'popular'
  );
});

test('home and premium tag selection are backed by browser history', () => {
  const homeManager = readProjectFile('components/home/hooks/useTagManager.ts');
  const premiumManager = readProjectFile('lib/hooks/usePremiumTagManager.ts');
  const popularFeatures = readProjectFile('components/home/PopularFeatures.tsx');
  const premiumContent = readProjectFile('components/premium/PremiumContent.tsx');

  for (const source of [homeManager, premiumManager]) {
    assert.match(source, /useSearchParams/);
    assert.match(source, /getTagIdFromSearchParams/);
    assert.match(source, /buildTagUrl/);
    assert.match(source, /router\.push\(nextUrl, \{ scroll: false \}\)/);
    assert.match(source, /router\.replace\(nextUrl, \{ scroll: false \}\)/);
  }

  assert.match(popularFeatures, /selectedTag === RECOMMEND_TAG_ID/);
  assert.match(premiumContent, /selectedTag === RECOMMEND_TAG_ID/);
});

test('home content waits until an asynchronous tag value is available', () => {
  const source = readProjectFile('components/home/hooks/usePopularMovies.ts');

  assert.match(source, /const hasResolvedTag =/);
  assert.match(source, /if \(!hasResolvedTag\) \{/);
  assert.match(
    source,
    /\[selectedTag, contentType, hasResolvedTag, cachedSnapshot, refreshKey\]/
  );
});

test('manual tag selection bypasses snapshots while history restoration uses them', () => {
  const homeManager = readProjectFile('components/home/hooks/useTagManager.ts');
  const premiumManager = readProjectFile('lib/hooks/usePremiumTagManager.ts');
  const popularSource = readProjectFile('components/home/hooks/usePopularMovies.ts');
  const premiumSource = readProjectFile('lib/hooks/usePremiumContent.ts');

  for (const source of [homeManager, premiumManager]) {
    assert.match(source, /setTagRefreshKey\(\(current\) => current \+ 1\)/);

    const historyRestoreEffect = source.match(
      /useEffect\(\(\) => \{\s+const nextTag = getTagIdFromSearchParams\([\s\S]*?setSelectedTagState\(nextTag\);\s+\}, \[searchParamsString\]\);/
    );
    assert.ok(historyRestoreEffect, 'history restoration effect should update only the URL tag');
    assert.doesNotMatch(historyRestoreEffect[0], /setTagRefreshKey/);
  }

  for (const source of [popularSource, premiumSource]) {
    assert.match(
      source,
      /const bypassCache = consumedRefreshKeyRef\.current !== refreshKey/
    );
    assert.match(source, /setCacheEnabled\(!bypassCache\)/);
    assert.match(source, /if \(cachedSnapshot && !bypassCache\)/);
  }

  assert.match(
    popularSource,
    /\[selectedTag, contentType, hasResolvedTag, cachedSnapshot, refreshKey\]/
  );
  assert.match(premiumSource, /\[categoryValue, cachedSnapshot, refreshKey\]/);
});

test('content snapshots are restored instantly and isolated by cache key', () => {
  const cacheKey = createContentCacheKey('test', `popular:${Date.now()}`);
  const otherCacheKey = createContentCacheKey('test', `premium:${Date.now()}`);
  const items = [{ id: 'movie-1', title: 'Movie' }];

  writeContentSnapshot(cacheKey, {
    items,
    page: 2,
    hasMore: true,
  });

  const restored = readContentSnapshot<{ id: string; title: string }>(cacheKey);
  assert.deepEqual(restored?.items, items);
  assert.equal(restored?.page, 2);
  assert.equal(restored?.hasMore, true);
  assert.equal(readContentSnapshot(otherCacheKey), null);
});

test('expired content snapshots are discarded', async () => {
  const cacheKey = createContentCacheKey('test', `expired:${Date.now()}`);
  writeContentSnapshot(cacheKey, {
    items: [{ id: 'movie-1' }],
    page: 0,
    hasMore: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(readContentSnapshot(cacheKey, 1), null);
});

test('content hooks prefer snapshots and discard stale responses', () => {
  const popularSource = readProjectFile('components/home/hooks/usePopularMovies.ts');
  const premiumSource = readProjectFile('lib/hooks/usePremiumContent.ts');

  for (const source of [popularSource, premiumSource]) {
    assert.match(source, /readContentSnapshot/);
    assert.match(source, /writeContentSnapshot/);
    assert.match(source, /requestIdRef/);
    assert.match(source, /inFlightRequestRef/);
    assert.match(source, /requestId !== requestIdRef\.current/);
    assert.doesNotMatch(source, /if \(loading\) return;/);
  }

  assert.match(
    popularSource,
    /\[selectedTag, contentType, hasResolvedTag, cachedSnapshot, refreshKey\]/
  );
  assert.match(premiumSource, /\[categoryValue, cachedSnapshot, refreshKey\]/);
});

test('first-screen images load eagerly while later images stay lazy', () => {
  const movieCard = readProjectFile('components/home/MovieCard.tsx');
  const movieGrid = readProjectFile('components/home/MovieGrid.tsx');
  const premiumGrid = readProjectFile('components/premium/PremiumContentGrid.tsx');

  assert.match(movieCard, /loading=\{priority \? 'eager' : 'lazy'\}/);
  assert.match(movieCard, /fetchPriority=\{priority \? 'high' : 'auto'\}/);
  assert.match(movieGrid, /priority=\{index < 4\}/);
  assert.match(premiumGrid, /loading=\{index < 4 \? 'eager' : 'lazy'\}/);
  assert.match(premiumGrid, /fetchPriority=\{index < 4 \? 'high' : 'auto'\}/);
});

test('public discovery APIs expose CDN cache policies', () => {
  const recommendRoute = readProjectFile('app/api/douban/recommend/route.ts');
  const tagsRoute = readProjectFile('app/api/douban/tags/route.ts');
  const premiumTypesRoute = readProjectFile('app/api/premium/types/route.ts');
  const imageRoute = readProjectFile('app/api/douban/image/route.ts');

  for (const source of [recommendRoute, tagsRoute, premiumTypesRoute]) {
    assert.match(source, /s-maxage=/);
    assert.match(source, /stale-while-revalidate=/);
    assert.match(source, /Cloudflare-CDN-Cache-Control/);
  }

  assert.match(imageRoute, /Cloudflare-CDN-Cache-Control/);
});
