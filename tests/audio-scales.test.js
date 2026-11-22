import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScaleMessage, degreesForZones, frequency, frequencies, resolveScaleMessage } from '../src/audio/scales.js';

test('live degrees are the existing six-zone pentatonic minor table', () => {
  assert.deepEqual(degreesForZones('live'), [0, 3, 7, 12, 15, 19]);
  assert.deepEqual(degreesForZones('unknown'), [0, 3, 7, 12, 15, 19]);
});

test('the base frequency remains 130.8128 Hz at key zero, root degree', () => {
  assert.equal(frequency(0, 0), 130.8128);
});

test('seven-note scales map six zones from first through last degree', () => {
  assert.deepEqual(degreesForZones('minor'), [0, 2, 3, 7, 8, 10]);
  assert.deepEqual(degreesForZones('strange'), [0, 2, 3, 7, 9, 10]);
  assert.deepEqual(degreesForZones('tense'), [0, 2, 3, 7, 8, 11]);
});

test('invalid scale messages resolve to live while valid six-degree data is copied', () => {
  assert.deepEqual(resolveScaleMessage({ id: 'invalid', degrees: [0, 2, 3, 7, 8, 10] }), { id: 'live', degrees: [0, 3, 7, 12, 15, 19] });
  assert.deepEqual(resolveScaleMessage({ id: 'minor', degrees: [0, 2, 3, 7, 8, 10] }), { id: 'minor', degrees: [0, 2, 3, 7, 8, 10] });
  assert.equal(frequencies(0, 'live')[0], 130.8128);
});
test('scale-message application is pure and returns live frequencies for invalid input', () => {
  const live = applyScaleMessage({ id: 'live', degrees: [0, 2, 3, 7, 8, 10] }, 0);
  assert.deepEqual(live.frequencies, [0, 3, 7, 12, 15, 19].map(degree => 130.8128 * 2 ** (degree / 12)));
  const minor = applyScaleMessage({ id: 'minor', degrees: [0, 2, 3, 7, 8, 10] }, 2);
  assert.deepEqual(minor.degrees, [0, 2, 3, 7, 8, 10]);
  assert.equal(minor.frequencies[0], 130.8128 * 2 ** (2 / 12));
  assert.deepEqual(applyScaleMessage({ id: 'tense', degrees: [0, 2] }, 0).degrees, [0, 3, 7, 12, 15, 19]);
});