import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');

test('Vercel deployment excludes non-runtime directories and stale APK', () => {
  for (const path of ['android/', 'dist/', 'docs/', 'tests/']) assert.match(ignore, new RegExp(`^${path.replace('/', '\\/')}$`, 'm'));
  for (const runtimePath of ['index.html', 'manifest.webmanifest', 'sw.js', 'src/', 'icons/', 'teste.html', 'teste.js']) {
    assert.doesNotMatch(ignore, new RegExp(`^${runtimePath.replace('/', '\\/')}$`, 'm'));
  }
});