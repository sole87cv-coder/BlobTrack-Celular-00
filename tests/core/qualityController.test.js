import assert from 'node:assert/strict';
import test from 'node:test';
import { updateQualityBudgets } from '../../src/core/qualityController.js';

function state(overrides = {}) {
  return { analysisAverage: 0, renderAverage: 0, slowFrames: 0, fastFrames: 0, renderSlowFrames: 0, ...overrides };
}

test('quality controller reduces width after 12 analysis frames above half interval', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 12; frame++) {
    result = updateQualityBudgets(perf, 30, 2, 40, 320, 480);
    perf = result;
  }
  assert.equal(result.trackingWidth, 240);
});

test('quality controller recovers width after 180 frames under 29.4 percent interval', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 180; frame++) {
    result = updateQualityBudgets(perf, 2, 2, 40, 320, 480);
    perf = result;
  }
  assert.equal(result.trackingWidth, 400);
});

test('render budget requests effects pause after eight frames above 40 percent interval', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 8; frame++) {
    result = updateQualityBudgets(perf, 2, 20, 40, 320, 480);
    perf = result;
  }
  assert.equal(result.renderPause, true);
});
