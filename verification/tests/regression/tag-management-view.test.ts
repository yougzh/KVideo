import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

// GH-ISSUE: 26,205

test('popular features do not render the hardcoded quick search groups', () => {
  const source = readFileSync(
    join(projectRoot, 'components/home/PopularFeatures.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /CategoryQuickSearch/);
});

test('popular tag management mode stays out of discovery grids', () => {
  const source = readFileSync(
    join(projectRoot, 'components/home/PopularFeatures.tsx'),
    'utf8',
  );

  assert.match(source, /const isTagManagementMode = showTagManager;/);
  assert.match(source, /!\s*isTagManagementMode && !effectiveRecommendSelected/);
  assert.match(source, /!\s*isTagManagementMode && \(/);
});

test('tag management list uses wrapping chips with search and expand controls', () => {
  const source = readFileSync(
    join(projectRoot, 'components/home/TagList.tsx'),
    'utf8',
  );

  assert.match(source, /rectSortingStrategy/);
  assert.match(source, /mb-8 flex flex-wrap items-center gap-3/);
  assert.match(source, /aria-label="搜索标签"/);
  assert.match(source, /VISIBLE_TAG_LIMIT = 24/);
  assert.match(source, /显示全部 \(\$\{filteredTags\.length\}\)/);
  assert.match(source, /收起标签/);
});
