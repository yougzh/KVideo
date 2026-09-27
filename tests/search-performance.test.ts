import test from 'node:test';
import assert from 'node:assert/strict';

import { binaryInsertVideos } from '@/lib/utils/sorted-insert';
import type { Video } from '@/lib/types';

function video(id: number, source: string, score = 0): Video {
  return {
    vod_id: id,
    vod_name: `Video ${id}`,
    source,
    relevanceScore: score,
  };
}

test('binaryInsertVideos drops duplicate source/id pairs', () => {
  const existing = [video(1, 'a', 10)];
  const incoming = [video(1, 'a', 10), video(2, 'a', 20), video(1, 'b', 20)];

  const merged = binaryInsertVideos(existing, incoming);

  assert.deepEqual(
    merged.map((item) => `${item.source}:${item.vod_id}`),
    ['b:1', 'a:2', 'a:1']
  );
});

test('binaryInsertVideos keeps fast latency first for equal relevance', () => {
  const existing = [{ ...video(1, 'a', 10), latency: 120 }];
  const incoming = [{ ...video(2, 'a', 10), latency: 40 }];

  const merged = binaryInsertVideos(existing, incoming);

  assert.deepEqual(merged.map((item) => item.vod_id), [2, 1]);
});
