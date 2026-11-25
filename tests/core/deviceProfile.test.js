import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceProfile } from '../../src/core/deviceProfile.js';

test('deviceProfile returns leve profile for low memory or cores', (t) => {
  const profile = deviceProfile({ deviceMemory: 2, hardwareConcurrency: 2 });
  assert.deepEqual(profile, { name: 'leve', maxWidth: 320, startWidth: 240, fps: 20, captureWidth: 640, pixelRatio: 1, recordingBitrate: 2_000_000, defaultEffects: false });
});

test('deviceProfile returns leve profile for low memory even with high cores', (t) => {
  const profile = deviceProfile({ deviceMemory: 2, hardwareConcurrency: 16 });
  assert.equal(profile.name, 'leve');
});

test('deviceProfile returns leve profile for low cores even with high memory', (t) => {
  const profile = deviceProfile({ deviceMemory: 16, hardwareConcurrency: 2 });
  assert.equal(profile.name, 'leve');
});

test('deviceProfile returns equilibrado profile for medium memory and cores', (t) => {
  const profile = deviceProfile({ deviceMemory: 5, hardwareConcurrency: 6 });
  assert.deepEqual(profile, { name: 'equilibrado', maxWidth: 480, startWidth: 320, fps: 24, captureWidth: 960, pixelRatio: 1.5, recordingBitrate: 3_000_000, defaultEffects: true });
});

test('deviceProfile returns alto profile for high memory and cores', (t) => {
  const profile = deviceProfile({ deviceMemory: 8, hardwareConcurrency: 8 });
  assert.deepEqual(profile, { name: 'alto', maxWidth: 640, startWidth: 480, fps: 30, captureWidth: 960, pixelRatio: 2, recordingBitrate: 4_500_000, defaultEffects: true });
});

test('deviceProfile with memory=4 defaults to equilibrado when cores=8', (t) => {
  const profile = deviceProfile({ deviceMemory: 4, hardwareConcurrency: 8 });
  assert.equal(profile.name, 'equilibrado');
});

test('deviceProfile with memory=4 and cores=4 returns leve', (t) => {
  const profile = deviceProfile({ deviceMemory: 4, hardwareConcurrency: 4 });
  assert.equal(profile.name, 'leve');
});

test('deviceProfile profile has all required fields', (t) => {
  const profile = deviceProfile({ deviceMemory: 8, hardwareConcurrency: 8 });
  assert.ok(typeof profile.name === 'string');
  assert.ok(Number.isInteger(profile.maxWidth));
  assert.ok(Number.isInteger(profile.startWidth));
  assert.ok(Number.isInteger(profile.fps));
  assert.ok(Number.isInteger(profile.captureWidth));
  assert.ok(typeof profile.pixelRatio === 'number');
  assert.ok(Number.isInteger(profile.recordingBitrate));
  assert.ok(typeof profile.defaultEffects === 'boolean');
  assert.ok(profile.startWidth <= profile.maxWidth);
});

test('deviceProfile with empty object returns leve (defaults apply)', (t) => {
  const profile = deviceProfile({});
  assert.equal(profile.name, 'leve');
});
