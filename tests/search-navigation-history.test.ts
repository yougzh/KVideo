import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

const readProjectFile = (path: string) => readFileSync(join(projectRoot, path), 'utf8');

test('search pages create history entries and remount for the URL query', () => {
  const homePage = readProjectFile('app/page.tsx');
  const premiumPage = readProjectFile('app/premium/page.tsx');
  const homeHook = readProjectFile('lib/hooks/useHomePage.ts');
  const premiumHook = readProjectFile('lib/hooks/usePremiumHomePage.ts');

  assert.match(homePage, /<HomePage key=\{query\} \/>/);
  assert.match(premiumPage, /<PremiumHomePage key=\{query\} \/>/);
  assert.match(homeHook, /router\.push\(`\/\?q=\$\{encodeURIComponent/);
  assert.match(premiumHook, /router\.push\(`\/premium\?q=\$\{encodeURIComponent/);
  assert.doesNotMatch(homeHook, /router\.replace\(`\/\?q=/);
  assert.doesNotMatch(premiumHook, /router\.replace\(`\/premium\?q=/);
});

test('mobile search cards use link navigation instead of a full page reload', () => {
  const source = readProjectFile('components/search/VideoGrid.tsx');

  assert.match(source, /if \(activeCardId !== videoId\)/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*videoUrl/);
});

test('history and favorite entries use client-side navigation', () => {
  for (const path of [
    'components/history/HistoryItem.tsx',
    'components/favorites/FavoritesItem.tsx',
  ]) {
    const source = readProjectFile(path);

    assert.match(source, /router\.push\(getVideoUrl\(\)\)/);
    assert.doesNotMatch(source, /window\.location\.href\s*=\s*getVideoUrl\(\)/);
  }
});
