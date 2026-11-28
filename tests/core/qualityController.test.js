import assert from 'node:assert/strict';
import test from 'node:test';
import { updateQualityBudgets } from '../../src/core/qualityController.js';

function state(overrides = {}) {
  return { analysisAverage: 0, renderAverage: 0, slowFrames: 0, fastFrames: 0, ...overrides };
}

test('quality controller reduces width after 8 frames above total budget', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 8; frame++) {
    result = updateQualityBudgets(perf, 30, 2, 40, 320, 480);
    perf = result;
  }
  assert.equal(result.trackingWidth, 280);
});

test('quality controller recovers width after 300 stable frames below budget', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 300; frame++) {
    result = updateQualityBudgets(perf, 2, 2, 40, 320, 480);
    perf = result;
  }
  assert.equal(result.trackingWidth, 360);
});

test('quality controller does not recover while deviceLimit is active', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 300; frame++) {
    result = updateQualityBudgets(perf, 2, 2, 40, 320, 480, true);
    perf = result;
  }
  assert.equal(result.trackingWidth, 320);
});

test('render cost never pauses reactive effects', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 8; frame++) {
    result = updateQualityBudgets(perf, 2, 20, 40, 320, 480);
    perf = result;
  }
  assert.equal(result.renderPause, undefined);
  assert.equal(result.renderSlowFrames, undefined);
  assert.ok(result.renderAverage > 15, 'm?dia de render continua medida');
  assert.equal(result.trackingWidth, 320, 'render caro sozinho n?o reduz rastreio');
});

test('quality controller allows extreme low floor at 80px', () => {
  let perf = state();
  let result;
  for (let frame = 0; frame < 60; frame++) {
    result = updateQualityBudgets(perf, 30, 10, 40, result?.trackingWidth ?? 320, 480);
    perf = result;
  }
  assert.equal(result.trackingWidth, 80);
});
