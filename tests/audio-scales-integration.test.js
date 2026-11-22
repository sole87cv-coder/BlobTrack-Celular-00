import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createScaleRouter } from '../src/audio/scale-router.js';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('without a stored choice the app keeps live and does not post a scale on initialization', () => {
  const writes = [];
  const router = createScaleRouter({ storage: { getItem: () => null, setItem: (...args) => writes.push(args) } });
  assert.equal(router.getId(), 'live');
  assert.equal(router.hasStoredChoice(), false);
  assert.deepEqual(writes, []);
  assert.match(app, /if\(!debounce && audioScaleRouter\.hasStoredChoice\(\)\) postAudioScale/);
  assert.ok(app.includes("root:$(\'audioScales\')"));
  assert.match(app, /onSelect:postAudioScale/);
});

test('scale strings stay in the secondary visual label and are not sent as status text', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const audioPanel = html.match(/id="audioScales"[\s\S]*?<\/div>/)?.[0] || '';
  for (const jargon of ['pentatônica menor', 'menor natural', 'dórico', 'menor harmônica']) assert.match(audioPanel, new RegExp(`<small>${jargon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/small>`));
  assert.doesNotMatch(app, /showToast\([^\n]*(pentatônica|dórico|harmônica)/i);
  assert.doesNotMatch(app, /announceStatus\([^\n]*(pentatônica|dórico|harmônica)/i);
});