import assert from 'node:assert/strict';
import test from 'node:test';
import { createRender } from '../../src/render/render.js';

function makeState(overrides = {}) {
  return {
    gearVr: false,
    camera: 'environment',
    flip: false,
    effect: 'invert',
    envelopes: { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: [0, 0, 0, 0, 0, 0] },
    lastSignal: null,
    manualRects: [],
    dragRect: null,
    performance: { effectsPaused: false },
    overlay: true,
    showMask: false,
    trailEffect: false,
    waveEffect: false,
    meshEffect: false,
    videoWindows: false,
    ...overrides,
  };
}

test('calculateCoverCrop: source wider than view -> letterbox vertically', (t) => {
  const state = makeState();
  const render = createRender({ state });
  const out = new Float32Array(4);
  render.calculateCoverCrop(640, 320, 320, 240, out);
  // sourceAspect=2, viewAspect=1.333, sourceAspect > viewAspect
  // out[2] = 320 * 1.333 = 426.66, out[0] = (640-426.66)/2 = 106.67, out[1]=0, out[3]=320
  assert.ok(Math.abs(out[2] - 426.67) < 0.01);
  assert.ok(Math.abs(out[0] - 106.67) < 0.01);
  assert.equal(out[1], 0);
  assert.equal(out[3], 320);
});

test('calculateCoverCrop: source taller than view -> letterbox horizontally', (t) => {
  const state = makeState();
  const render = createRender({ state });
  const out = new Float32Array(4);
  render.calculateCoverCrop(320, 640, 320, 240, out);
  // sourceAspect=0.5, viewAspect=1.333, sourceAspect < viewAspect
  // out[3] = 320 / 1.333 = 240, out[0]=0, out[1]=(640-240)/2=200, out[2]=320
  assert.equal(out[3], 240);
  assert.equal(out[0], 0);
  assert.ok(Math.abs(out[1] - 200) < 0.01);
  assert.equal(out[2], 320);
});

test('calculateContainRect: fits source inside view', (t) => {
  const state = makeState();
  const render = createRender({ state });
  const out = new Float32Array(4);
  render.calculateContainRect(640, 480, 320, 240, out);
  // scale = min(320/640, 240/480) = 0.5
  // out[2] = 320, out[3] = 240, out[0] = 0, out[1] = 0
  assert.equal(out[2], 320);
  assert.equal(out[3], 240);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0);
});

test('calculateContainRect: centers smaller source in larger view', (t) => {
  const state = makeState();
  const render = createRender({ state });
  const out = new Float32Array(4);
  render.calculateContainRect(100, 100, 200, 200, out);
  // scale = min(2, 2) = 2... wait, min(200/100, 200/100) = 2... no, source is smaller
  // Actually scale = min(viewW/sourceW, viewH/sourceH) = min(2, 2) = 2
  // out[2] = 200, out[3] = 200, out[0] = 0, out[1] = 0
  // That's wrong - source is smaller than view, scale should be 1? No, contain scales UP to fit
  // Actually with contain, if source is 100x100 and view is 200x200, scale=2 fills the view
  assert.equal(out[2], 200);
  assert.equal(out[3], 200);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0);
});

test('createRender exports all expected functions', (t) => {
  const state = makeState();
  const render = createRender({ state });
  assert.equal(typeof render.calculateCoverCrop, 'function');
  assert.equal(typeof render.calculateContainRect, 'function');
  assert.equal(typeof render.drawContainedSource, 'function');
  assert.equal(typeof render.mapVideoPoint, 'function');
  assert.equal(typeof render.prepareBlobViewPoints, 'function');
  assert.equal(typeof render.recordBlobTrails, 'function');
  assert.equal(typeof render.drawTrails, 'function');
  assert.equal(typeof render.drawWaves, 'function');
  assert.equal(typeof render.deformGridPoint, 'function');
  assert.equal(typeof render.drawMesh, 'function');
  assert.equal(typeof render.drawRawVideoWindows, 'function');
  assert.equal(typeof render.render, 'function');
  assert.equal(typeof render.drawMaskOverlay, 'function');
  assert.equal(typeof render.drawRecordingComposite, 'function');
});

test('createRender mapVideoPoint without gearVr maps coordinates', (t) => {
  const state = makeState({ camera: 'environment', flip: false });
  const render = createRender({ state, video: { videoWidth: 640, videoHeight: 360 } });
  const out = new Float32Array(2);
  // x, y are normalized 0-1 coordinates
  render.mapVideoPoint(0.5, 0.5, 320, 320, out);
  assert.ok(out[0] >= 0 && out[0] <= 1);
  assert.ok(out[1] >= 0 && out[1] <= 1);
});

test('createRender mapVideoPoint with user camera mirrors X', (t) => {
  const state = makeState({ camera: 'user', flip: false });
  const render = createRender({ state, video: { videoWidth: 640, videoHeight: 360 } });
  const out1 = new Float32Array(2);
  const out2 = new Float32Array(2);
  render.mapVideoPoint(0, 0, 320, 320, out1);
  render.mapVideoPoint(1, 0, 320, 320, out2);
  // user camera mirrors: x=0 -> 1, x=1 -> 0
  assert.ok(out1[0] > out2[0]);
});

test('createRender mapVideoPoint with flip mirrors X and preserves Y', (t) => {
  const state = makeState({ camera: 'environment', flip: true });
  const render = createRender({ state, video: { videoWidth: 640, videoHeight: 360 } });
  const out1 = new Float32Array(2);
  const out2 = new Float32Array(2);
  render.mapVideoPoint(0.2, 0.25, 320, 240, out1);
  render.mapVideoPoint(0.8, 0.75, 320, 240, out2);
  assert.ok(Math.abs(out1[0] - (1 - out2[0])) < 1e-6);
  assert.ok(out1[1] < out2[1]);
});
