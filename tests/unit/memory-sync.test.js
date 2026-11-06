import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMissing } from '../../scripts/check-memory-sync.js';

test('findMissing: returns paths not present in AGENTS.md content', () => {
  const content = '## Files\n- src/server.js\n- frontend/src/views/dashboard-view.tsx\n';
  const paths = ['src/server.js', 'src/missing.js', 'frontend/src/views/dashboard-view.tsx'];
  assert.deepEqual(findMissing(paths, content), ['src/missing.js']);
});

test('findMissing: returns empty array when all paths are documented', () => {
  const content = 'src/server.js src/config.js';
  const paths = ['src/server.js', 'src/config.js'];
  assert.deepEqual(findMissing(paths, content), []);
});
