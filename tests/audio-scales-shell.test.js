import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('service worker v71 precaches all runtime modules', () => {
  const cache = sw.match(/const CACHE = '([^']+)';/);
  assert.equal(cache?.[1], 'blobtrack-celular-00-v78');
  const shell = sw.match(/const SHELL = \[(.*?)\];/s)?.[1] || '';
  for (const path of ['./src/audio/scales.js', './src/audio/scale-router.js', './src/ui/scales-ui.js']) {
    assert.match(shell, new RegExp(`['"]${path.replaceAll('.', '\\.')}['"]`));
  }
  assert.match(shell, /['"]\.\/src\/core\/roiMask\.js['"]?/);
  assert.ok(!shell.includes('src/audio/scales.js,') || shell.includes("'./src/audio/scales.js'"));
});
