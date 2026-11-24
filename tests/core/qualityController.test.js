import assert from 'node:assert/strict';
import test from 'node:test';
import { adjustTrackingQuality } from '../../src/core/qualityController.js';

function state(overrides = {}) {
  return { average: 0, slowFrames: 0, fastFrames: 0, ...overrides };
}

test('quality controller reduces width after sustained overload before reducing FPS', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 12; frame++) {
    result = adjustTrackingQuality(perf, 100, 20, 320, 24, 480, 24);
    perf = result;
  }
  assert.equal(result.trackingWidth, 240);
  assert.equal(result.targetFps, 24);
});

test('quality controller reduces FPS at minimum width and respects floor', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 12; frame++) {
    result = adjustTrackingQuality(perf, 100, 20, 160, 14, 480, 24);
    perf = result;
  }
  assert.equal(result.trackingWidth, 160);
  assert.equal(result.targetFps, 12);
});

test('quality controller recovers width first and raises FPS only at maximum width', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 180; frame++) {
    result = adjustTrackingQuality(perf, 2, 20, 320, 20, 480, 24);
    perf = result;
  }
  assert.equal(result.trackingWidth, 400);
  assert.equal(result.targetFps, 20);

  perf = state();
  for (let frame = 0; frame < 180; frame++) {
    result = adjustTrackingQuality(perf, 2, 20, 480, 20, 480, 24);
    perf = result;
  }
  assert.equal(result.trackingWidth, 480);
  assert.equal(result.targetFps, 22);
});
