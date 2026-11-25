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

test('dither não desenha janelas que cubram o dither do quadro inteiro', () => {
  const state = makeState({ effect: 'dither' });
  const render = createRender({ state, video: { videoWidth: 640, videoHeight: 360 } });
  const calls = [];
  const c = {
    save() { calls.push('save'); },
    restore() {}, beginPath() {}, rect() {}, clip() {},
    translate() {}, scale() {}, drawImage() {}, fillRect() {},
  };
  render.drawRawVideoWindows(c, [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }], 320, 240, 0, state.video);
  assert.equal(calls.length, 0);
});

test('janelas com videoBlend zero desenham o filtro uma única vez', () => {
  const blobs = [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }];
  const video = { videoWidth: 640, videoHeight: 360 };
  function drawImageCalls(videoBlend) {
    const state = makeState({ effect: 'invert', originalVideoWindows: false, videoBlend });
    const render = createRender({ state, video, cropRect: new Float32Array(4), mapPointA: new Float32Array(2), mapPointB: new Float32Array(2) });
    let images = 0;
    const c = {
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      translate() {}, scale() {}, drawImage() { images++; },
    };
    render.drawRawVideoWindows(c, blobs, 320, 240, 0, video);
    return images;
  }
  assert.equal(drawImageCalls(0), 1);
  assert.equal(drawImageCalls(0.5), 2);
});

test('ondas reaproveitam os pontos de view já calculados para o olho', () => {
  const points = new Float32Array(24);
  points[0] = 0.25; points[1] = 0.5;
  points[2] = 0.75; points[3] = 0.5;
  const state = makeState({ waveEffect: true, timing: {} });
  const arcs = [];
  const c = {
    globalAlpha: 1, strokeStyle: '', lineWidth: 1,
    beginPath() {}, arc(...args) { arcs.push(args); }, stroke() {},
  };
  const render = createRender({
    state,
    video: { videoWidth: 640, videoHeight: 360 },
    blobViewPoints: points,
    TRAIL_SLOTS: 12,
    cropRect: new Float32Array(4),
    mapPointA: new Float32Array(2),
    mapPointB: new Float32Array(2),
    gridPoint: new Float32Array(2),
  });

  render.drawWaves(c, [{ x: .9, y: .9, speed: 0 }, { x: .1, y: .1, speed: 0 }], 320, 240, 0, 1000, 1);

  assert.equal(arcs.length, 3);
  assert.ok(arcs.every(([x, y]) => Math.abs(x - 80) < 1e-6 && Math.abs(y - 120) < 1e-6));
});

test('fallback de dither desenha círculos de halftone e reaproveita o canvas', () => {
  const previousDocument = globalThis.document;
  let canvasesCreated = 0;
  const arcs = [];
  let fills = 0;
  const offscreenContext = {
    fillStyle: '',
    drawImage(...args) { this.lastDraw = args; },
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4).fill(200);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      return { data, width, height };
    },
    fillRect(...args) { this.lastFillRect = args; },
    beginPath() {},
    arc(...args) { arcs.push(args); },
    fill() { fills++; },
    putImageData() { throw new Error('halftone não deve usar putImageData'); },
  };
  const halftoneCanvas = { width: 0, height: 0, getContext() { return offscreenContext; } };
  globalThis.document = {
    createElement(tag) { assert.equal(tag, 'canvas'); canvasesCreated++; return halftoneCanvas; },
  };
  try {
    const state = makeState({ effect: 'dither', timing: {} });
    const video = { videoWidth: 640, videoHeight: 360 };
    const draws = [];
    const c = {
      filter: '',
      save() {}, restore() {},
      beginPath() {}, rect() {}, clip() {},
      translate() {}, scale() {},
      drawImage(...args) { draws.push(args); },
    };
    const render = createRender({
      state, video,
      canvas: { width: 320, height: 240 },
      fallbackContext: c,
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
      gridPoint: new Float32Array(2),
    });

    render.renderFrame({ dither: 0.1 }, video);
    render.renderFrame({ dither: 0.1 }, video);

    assert.equal(canvasesCreated, 1);
    assert.equal(halftoneCanvas.width, 320);
    assert.equal(halftoneCanvas.height, 180);
    assert.deepEqual(offscreenContext.lastDraw, [video, 0, 0, 640, 360, 0, 0, 320, 180]);
    assert.deepEqual(offscreenContext.lastFillRect, [0, 0, 320, 180]);
    assert.equal(arcs.length, 2 * 32 * 18);
    assert.equal(fills, arcs.length);
    assert.ok(arcs.every(([, , radius]) => radius > 0 && radius <= 6.2));
    assert.equal(draws.length, 2);
    assert.deepEqual(draws[0], [halftoneCanvas, 40, 0, 240, 180, 0, 0, 320, 240]);
    assert.deepEqual(draws[1], draws[0]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('WebGL usa o shader de halftone com o programa e textura compartilhados', () => {
  const uniforms = Object.fromEntries([
    'uTexture', 'uEffect', 'uThreshold', 'uBias', 'uExposure', 'uGrowth', 'uSpeed', 'uTime',
    'uImageAspect', 'uViewportAspect', 'uMirror', 'uFlip', 'uFit',
  ].map(name => [name, name]));
  const program = {}, texture = {};
  const calls = [];
  const gl = {
    TEXTURE_2D: 1, RGBA: 2, UNSIGNED_BYTE: 3, TRIANGLE_STRIP: 4,
    useProgram(value) { calls.push(['useProgram', value]); },
    bindTexture(target, value) { calls.push(['bindTexture', target, value]); },
    texImage2D(...args) { calls.push(['texImage2D', ...args]); },
    uniform1i(name, value) { calls.push([name, value]); },
    uniform1f(name, value) { calls.push([name, value]); },
    viewport() {},
    drawArrays() { calls.push(['drawArrays']); },
  };
  const state = makeState({ effect: 'dither', timing: {} });
  const video = { videoWidth: 640, videoHeight: 360 };
  const render = createRender({
    state, video, gl,
    glState: { program, texture, uniforms },
    canvas: { width: 320, height: 240 },
    cropRect: new Float32Array(4),
    mapPointA: new Float32Array(2),
    mapPointB: new Float32Array(2),
    gridPoint: new Float32Array(2),
  });

  render.renderFrame({ threshold: 0.1 }, video);

  assert.ok(calls.some(([name, value]) => name === 'useProgram' && value === program));
  assert.ok(calls.some(([name, target, value]) => name === 'bindTexture' && target === gl.TEXTURE_2D && value === texture));
  assert.ok(calls.some(([name, , , , , , source]) => name === 'texImage2D' && source === video));
  assert.ok(calls.some(([name, value]) => name === 'uEffect' && value === 2));
  assert.ok(calls.some(([name]) => name === 'drawArrays'));
});
