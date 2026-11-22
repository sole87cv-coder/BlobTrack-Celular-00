import test from 'node:test';
import assert from 'node:assert/strict';
import { createScaleRouter, SCALE_STORAGE_KEY } from '../src/audio/scale-router.js';
import { frequencies as scaleFrequencies } from '../src/audio/scales.js';

function makeStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[SCALE_STORAGE_KEY, initial]]);
  const writes = [];
  return { values, writes, getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => { writes.push([key, value]); values.set(key, value); } };
}

test('router defaults to live without writing when no scale preference exists', () => {
  const storage = makeStorage();
  const router = createScaleRouter({ storage });
  assert.equal(router.getId(), 'live');
  assert.equal(router.hasStoredChoice(), false);
  assert.deepEqual(storage.writes, []);
});

test('router stores a selected scale under its separate key', () => {
  const storage = makeStorage();
  const router = createScaleRouter({ storage });
  assert.equal(router.setScale('tense'), true);
  assert.deepEqual(storage.writes, [[SCALE_STORAGE_KEY, 'tense']]);
  assert.equal(router.getId(), 'tense');
  assert.equal(router.setScale('unknown'), false);
  assert.equal(storage.writes.length, 1);
});

test('router reads only a valid saved id and invalid storage falls back without writing', () => {
  const validStorage = makeStorage('strange');
  assert.equal(createScaleRouter({ storage: validStorage }).getId(), 'strange');
  const invalidStorage = makeStorage('not-a-scale');
  const invalidRouter = createScaleRouter({ storage: invalidStorage });
  assert.equal(invalidRouter.getId(), 'live');
  assert.equal(invalidRouter.hasStoredChoice(), false);
  assert.deepEqual(invalidStorage.writes, []);
});

test('router live frequencies match the original six-zone key formula', () => {
  const router = createScaleRouter({ storage: makeStorage() });
  for (const key of [0, 2, 7, 11]) assert.deepEqual(router.frequencies(key), scaleFrequencies(key, 'live'));
});