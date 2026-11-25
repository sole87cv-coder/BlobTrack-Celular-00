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

test('Pontilhado mantém Janela Viva, Vídeo original e o filtro das janelas', () => {
  const video = { videoWidth: 640, videoHeight: 360 };
  const blobs = [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }];
  function run(originalVideoWindows) {
    const state = makeState({ effect: 'dither', videoWindows: true, originalVideoWindows, invertBlend: false, videoBlend: 0 });
    const render = createRender({
      state, video,
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
    });
    let images = 0;
    const filters = [];
    const c = {
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      translate() {}, scale() {}, drawImage() { images++; },
    };
    Object.defineProperty(c, 'filter', { get() { return 'none'; }, set(value) { filters.push(value); } });
    render.drawRawVideoWindows(c, blobs, 320, 240, 0, video);
    return { images, filters };
  }
  const raw = run(true);
  assert.equal(raw.images, 1);
  assert.deepEqual(raw.filters, []);
  const filtered = run(false);
  assert.equal(filtered.images, 1);
  assert.ok(filtered.filters.includes('grayscale(1) contrast(2)'));
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

test('fallback do Pontilhado pinta base preta, sem halftone no quadro inteiro', () => {
  const state = makeState({ effect: 'dither', timing: {} });
  const fills = [];
  const c = {
    filter: '',
    fillStyle: '',
    save() {}, restore() {},
    fillRect(...args) { fills.push(args); },
    drawImage() { throw new Error('base do Pontilhado não deve desenhar o quadro inteiro'); },
    beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
  };
  const render = createRender({
    state,
    video: { videoWidth: 640, videoHeight: 360 },
    canvas: { width: 320, height: 240 },
    fallbackContext: c,
    cropRect: new Float32Array(4),
    mapPointA: new Float32Array(2),
    mapPointB: new Float32Array(2),
    gridPoint: new Float32Array(2),
  });

  render.renderFrame({}, { videoWidth: 640, videoHeight: 360 });
  render.renderFrame({}, { videoWidth: 640, videoHeight: 360 });

  assert.deepEqual(fills, [[0, 0, 320, 240], [0, 0, 320, 240]]);
  assert.equal(c.filter, 'none');
});

test('Pontilhado desenha pontos somente dentro da máscara dos blobs', () => {
  const width = 40, height = 24;
  const mask = new Uint8Array(width * height);
  for (let y = 10; y < 12; y++) {
    for (let x = 10; x < 12; x++) mask[y * width + x] = 1;
  }
  let image = null;
  let puts = 0;
  const maskCanvas = { width: 0, height: 0 };
  const maskContext = {
    createImageData(w, h) {
      image = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      return image;
    },
    putImageData() { puts++; },
  };
  const state = makeState({ effect: 'dither', timing: {} });
  const render = createRender({
    state,
    overlayContext: {
      clearRect() {}, save() {}, restore() {}, scale() {}, beginPath() {},
      rect() {}, clip() {}, translate() {}, drawImage() {}, globalAlpha: 1,
    },
    overlayCanvas: { width: 320, height: 240 },
    stageViewport: { width: 320, height: 240 },
    video: { videoWidth: 640, videoHeight: 360 },
    maskCanvas, maskContext, maskImage: null, maskView: null,
    cropRect: new Float32Array(4),
    mapPointA: new Float32Array(2),
    mapPointB: new Float32Array(2),
  });

  render.drawMaskOverlay({ blobs: [], width, height, mask }, { videoWidth: 640, videoHeight: 360 }, {});

  assert.equal(maskCanvas.width, width);
  assert.equal(puts, 1);
  const packed = new Uint32Array(image.data.buffer);
  let inside = 0, outside = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = packed[y * width + x];
      if (mask[y * width + x]) {
        if (value === 0xFFFFFFFF) inside++;
      } else if (value !== 0) {
        outside++;
      }
    }
  }
  assert.ok(inside > 0 && inside <= 4, `pontos dentro do blob: ${inside}`);
  assert.equal(outside, 0);
});

test('WebGL mantém uEffect 2 para a base limpa do Pontilhado', () => {
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

test('malha desenha todas as linhas com um único stroke', () => {
  const state = makeState({ meshEffect: true, timing: {} });
  const blobViewPoints = new Float32Array(24);
  blobViewPoints[0] = 0.5;
  blobViewPoints[1] = 0.5;
  let paths = 0, strokes = 0;
  const moves = [], lines = [];
  const c = {
    globalAlpha: 1, strokeStyle: '', lineWidth: 1,
    beginPath() { paths++; },
    moveTo(...args) { moves.push(args); },
    lineTo(...args) { lines.push(args); },
    stroke() { strokes++; },
  };
  const render = createRender({ state, gridPoint: new Float32Array(2), blobViewPoints });
  render.drawMesh(c, [{ speed: 0 }], 320, 240, 0, 1);
  assert.equal(paths, 1);
  assert.equal(strokes, 1);
  assert.ok(moves.length >= 2);
  assert.ok(lines.length > moves.length);
});

test('vértices da rede são preenchidos em um único caminho sem linhas entre círculos', () => {
  const state = makeState({ timing: {} });
  const blobViewPoints = new Float32Array(24);
  blobViewPoints.set([0.2, 0.3, 0.5, 0.6, 0.8, 0.25]);
  const arcs = [], moves = [];
  let fills = 0;
  const c = {
    save() {}, restore() {},
    globalAlpha: 1, strokeStyle: '', lineWidth: 1, fillStyle: '',
    beginPath() {}, moveTo(...args) { moves.push(args); }, lineTo() {}, stroke() {},
    arc(...args) { arcs.push(args); }, fill() { fills++; },
  };
  const render = createRender({ state, blobViewPoints });
  render.drawBlobNetwork(c, [{ speed: 0 }, { speed: 0 }, { speed: 0 }], 320, 240, 0, 3);
  assert.equal(fills, 1);
  assert.equal(arcs.length, 3);
  assert.equal(moves.length, 3);
  arcs.forEach(([x, y, radius], i) => {
    assert.equal(radius, 3.2);
    assert.ok(Math.abs(moves[i][0] - (x + radius)) < 1e-6);
    assert.equal(moves[i][1], y);
  });
});

test('overlay ocioso não repete clearRect e limpa uma vez ao desligar o último efeito', () => {
  const state = makeState({ overlay: true, timing: {} });
  const clears = [];
  const c = {
    clearRect(...args) { clears.push(args); },
    save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {},
    stroke() {}, strokeRect() {}, fillText() {},
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, font: '',
  };
  const render = createRender({
    state,
    overlayContext: c,
    overlayCanvas: { width: 320, height: 240 },
    stageViewport: { width: 320, height: 240 },
  });
  const result = { blobs: [], width: 320, height: 180 };
  const source = { videoWidth: 640, videoHeight: 360 };
  render.drawMaskOverlay(result, source, {});
  assert.equal(clears.length, 1);
  state.overlay = false;
  render.drawMaskOverlay(result, source, {});
  assert.equal(clears.length, 2);
  render.drawMaskOverlay(result, source, {});
  assert.equal(clears.length, 2);
  assert.ok(Number.isFinite(state.timing.composition));
});
