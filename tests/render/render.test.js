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

test('Pontilhado mantém Janela Viva, aplica o efeito ligado e deixa vídeo cru desligado', () => {
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
  const enhanced = run(true);
  assert.equal(enhanced.images, 1);
  assert.deepEqual(enhanced.filters, ['grayscale(1) contrast(2)']);
  const raw = run(false);
  assert.equal(raw.images, 1);
  assert.deepEqual(raw.filters, []);
});

test('Vídeo original ligado aplica o efeito nos três; desligado devolve vídeo cru', () => {
  const video = { videoWidth: 640, videoHeight: 360 };
  const blobs = [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }];
  function filtrosDe(effect, originalVideoWindows, extra = {}) {
    const state = makeState({
      effect, videoWindows: true, originalVideoWindows,
      invertBlend: false, videoBlend: 0, ...extra,
    });
    const render = createRender({
      state, video,
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
    });
    const vistos = [];
    const c = {
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      translate() {}, scale() {}, drawImage() {},
    };
    Object.defineProperty(c, 'filter', { get() { return 'none'; }, set(value) { vistos.push(value); } });
    render.drawRawVideoWindows(c, blobs, 320, 240, 0, video);
    return vistos;
  }
  assert.deepEqual(filtrosDe('invert', true), ['invert(1)']);
  assert.deepEqual(filtrosDe('invert', false), []);
  assert.deepEqual(filtrosDe('threshold', true), ['grayscale(1) contrast(8)']);
  assert.deepEqual(filtrosDe('threshold', false), []);
  assert.deepEqual(filtrosDe('dither', true), ['grayscale(1) contrast(2)']);
  assert.deepEqual(filtrosDe('dither', false), []);
  assert.deepEqual(filtrosDe('dither', true, { invertBlend: true }), ['grayscale(1) contrast(2) invert(1)']);
  assert.deepEqual(filtrosDe('dither', false, { invertBlend: true }), ['invert(1)']);
  assert.deepEqual(filtrosDe('dither', false, { videoBlend: 0.5 }), ['grayscale(1) contrast(2)']);
});

test('Pontilhado nas janelas reusa a grade sem segundo getImageData', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement() { throw new Error('não deve criar canvas'); } };
  try {
    const state = makeState({ effect: 'dither', videoWindows: true, originalVideoWindows: true, invertBlend: false, videoBlend: 0, timing: {} });
    const render = createRender({
      state,
      video: { videoWidth: 640, videoHeight: 360 },
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
    });
    const width = 60, height = 36;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = col < width / 2 ? 10 + col * 6 : 240;
        const i = (row * width + col) * 4;
        data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
      }
    }
    let arcs = 0, images = 0;
    const c = {
      fillStyle: '', filter: 'none', globalAlpha: 1,
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      translate() {}, scale() {}, drawImage() { images++; },
      moveTo() {}, arc() { arcs++; }, fill() {},
    };

    render.drawStipple(c, { width, height }, 320, 240, 0, false, { data, width, height });
    const dotsNoPalco = arcs;
    assert.ok(dotsNoPalco > 20, `pontos no palco: ${dotsNoPalco}`);
    arcs = 0;
    render.drawRawVideoWindows(c, [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }], 320, 240, 0, { videoWidth: 640, videoHeight: 360 });
    assert.ok(arcs > 0 && arcs < dotsNoPalco, `pontos podados na janela: ${arcs} de ${dotsNoPalco}`);
    assert.equal(images, 1, 'o vídeo continua na janela');
    state.originalVideoWindows = false;
    arcs = 0;
    render.drawRawVideoWindows(c, [{ left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }], 320, 240, 0, { videoWidth: 640, videoHeight: 360 });
    assert.equal(arcs, 0, 'desligado não repinta pontos dentro do blob');
    assert.equal(images, 2, 'desligado ainda desenha o vídeo cru na janela');
  } finally {
    globalThis.document = previousDocument;
  }
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

test('Janela viva amostra só o pedaço da origem ocupado pelos blobs', () => {
  const video = { videoWidth: 640, videoHeight: 360 };
  const state = makeState({ effect: 'invert', videoWindows: true, originalVideoWindows: true });
  const render = createRender({ state, video, cropRect: new Float32Array(4), mapPointA: new Float32Array(2), mapPointB: new Float32Array(2) });
  const calls = [];
  const c = {
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    translate() {}, scale() {}, drawImage(...args) { calls.push(args); },
  };
  render.drawRawVideoWindows(c, [{ left: 0.2, top: 0.2, right: 0.4, bottom: 0.4 }], 320, 240, 0, video);
  assert.equal(calls.length, 1);
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = calls[0];
  assert.ok(Math.abs(sx - 128) < 1e-6 && Math.abs(sw - 128) < 1e-6, `recorte em x: ${sx} + ${sw}`);
  assert.ok(Math.abs(sy - 72) < 1e-6 && Math.abs(sh - 72) < 1e-6, `recorte em y: ${sy} + ${sh}`);
  assert.ok(dx >= 0 && dx + dw <= 320 + 1e-6, `destino em x: ${dx} + ${dw}`);
  assert.ok(dy >= 0 && dy + dh <= 240 + 1e-6, `destino em y: ${dy} + ${dh}`);
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

test('fallback do Pontilhado pinta papel branco, sem desenhar o quadro inteiro', () => {
  const state = makeState({ effect: 'dither', timing: {} });
  const fills = [];
  const c = {
    filter: '',
    fillStyle: '',
    save() {}, restore() {},
    fillRect(...args) { fills.push([...args, c.fillStyle]); },
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

  assert.deepEqual(fills, [
    [0, 0, 320, 240, '#fff'],
    [0, 0, 320, 240, '#fff'],
  ]);
  assert.equal(c.filter, 'none');
});

test('Pointillism difunde erro e desenha pontos pretos de tamanhos diferentes', () => {
  const previousDocument = globalThis.document;
  const arcs = [];
  let fills = 0, created = 0, reads = 0;
  const offscreenContext = {
    drawImage() {},
    getImageData(x, y, width, height) {
      reads++;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const value = col < width / 2 ? 240 : 10 + (col - width / 2) * 6;
          const i = (row * width + col) * 4;
          data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
        }
      }
      return { data, width, height };
    },
  };
  const sampleCanvas = { width: 0, height: 0, getContext() { return offscreenContext; } };
  globalThis.document = {
    createElement(tag) { assert.equal(tag, 'canvas'); created++; return sampleCanvas; },
  };
  try {
    const state = makeState({ effect: 'dither', timing: {} });
    const render = createRender({
      state,
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
    });
    const c = {
      fillStyle: '', save() {}, restore() {}, translate() {}, scale() {},
      beginPath() {}, moveTo() {}, fill() { fills++; },
      arc(...args) { arcs.push(args); },
    };

    render.drawStipple(c, { width: 60, height: 36 }, 320, 240, 0, false);
    render.drawStipple(c, { width: 60, height: 36 }, 320, 240, 0, false);

    assert.equal(created, 1);
    assert.equal(reads, 2);
    assert.equal(sampleCanvas.width, 60);
    assert.equal(fills, 2);
    assert.ok(arcs.length > 20, `pontos gerados: ${arcs.length}`);
    assert.ok(arcs.filter(([x]) => x > 150).length > arcs.length * 0.7);
    assert.ok(new Set(arcs.map(([, , radius]) => radius.toFixed(2))).size >= 3);
    assert.ok(arcs.every(([, , radius]) => radius > 0 && radius < 11));
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Pointillism no Gear VR respeita o contain e espelha o segundo olho', () => {
  const previousDocument = globalThis.document;
  const arcs = [], transforms = [];
  const offscreenContext = {
    drawImage() {},
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const value = col < width / 2 ? 20 : 230;
          const i = (row * width + col) * 4;
          data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
        }
      }
      return { data, width, height };
    },
  };
  globalThis.document = {
    createElement() { return { width: 0, height: 0, getContext() { return offscreenContext; } }; },
  };
  try {
    const state = makeState({ effect: 'dither', gearVr: true, timing: {} });
    const render = createRender({
      state,
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
    });
    const c = {
      fillStyle: '',
      save() {}, restore() {}, beginPath() {}, moveTo() {}, fill() {},
      translate(...args) { transforms.push(['translate', ...args]); },
      scale(...args) { transforms.push(['scale', ...args]); },
      arc(...args) { arcs.push(args); },
    };

    render.drawStipple(c, { width: 60, height: 36 }, 160, 240, 0, false);
    render.drawStipple(c, { width: 60, height: 36 }, 160, 240, 160, true);

    assert.ok(arcs.length > 20, `pontos gerados: ${arcs.length}`);
    // 60×36 dentro de 160×240: contain dá faixa 160×96 centrada em y=72..168.
    assert.ok(arcs.every(([, y]) => y > 70 && y < 170), 'pontos fora da faixa contain');
    assert.ok(arcs.every(([x]) => x > 0 && x < 160), 'pontos fora da largura do olho');
    assert.ok(transforms.some(([kind, x]) => kind === 'translate' && x === 0));
    assert.ok(transforms.some(([kind, x]) => kind === 'translate' && x === 320));
    assert.ok(transforms.some(([kind, sx]) => kind === 'scale' && sx === -1));
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Pointillism reaproveita os pixels do tracker sem segundo getImageData', () => {
  const previousDocument = globalThis.document;
  const arcs = [];
  let created = 0;
  globalThis.document = {
    createElement() { created++; throw new Error('não deve criar canvas'); },
  };
  try {
    const state = makeState({ effect: 'dither', timing: {} });
    const render = createRender({
      state,
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
    });
    const width = 60, height = 36;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = col < width / 2 ? 240 : 10 + (col - width / 2) * 6;
        const i = (row * width + col) * 4;
        data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
      }
    }
    const c = {
      fillStyle: '', save() {}, restore() {}, beginPath() {}, moveTo() {}, fill() {},
      translate() {}, scale() {}, arc(...args) { arcs.push(args); },
    };

    render.drawStipple(c, { width, height }, 320, 240, 0, false, { data, width, height });

    assert.equal(created, 0);
    assert.ok(arcs.length > 20, `pontos gerados: ${arcs.length}`);
    assert.ok(arcs.filter(([x]) => x > 150).length > arcs.length * 0.7);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('binarizada só publica no canvas quando a máscara muda', () => {
  const width = 8, height = 4;
  const mask = new Uint8Array(width * height);
  let puts = 0;
  const maskCanvas = { width: 0, height: 0 };
  const maskContext = {
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData() { puts++; },
  };
  const state = makeState({ showMask: true, effect: 'threshold', timing: {} });
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
  const source = { videoWidth: 640, videoHeight: 360 };
  const result = { blobs: [], width, height, mask };

  render.drawMaskOverlay(result, source, {});
  assert.equal(puts, 1, 'primeira publicação');
  render.drawMaskOverlay(result, source, {});
  assert.equal(puts, 1, 'máscara igual não repinta');
  mask[0] = 1;
  render.drawMaskOverlay(result, source, {});
  assert.equal(puts, 2, 'máscara diferente repinta');
  render.drawMaskOverlay(result, source, {});
  assert.equal(puts, 2, 'nova máscara igual não repinta');
});

test('WebGL mantém uEffect 2 para o papel branco do Pontilhado', () => {
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
    texSubImage2D(...args) { calls.push(['texSubImage2D', ...args]); },
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
  assert.equal(calls.filter(([name]) => name === 'texImage2D').length, 1);
  assert.ok(calls.some(([name, value]) => name === 'uEffect' && value === 2));
  assert.ok(calls.some(([name]) => name === 'drawArrays'));

  render.renderFrame({ threshold: 0.1 }, video);
  assert.equal(calls.filter(([name]) => name === 'texImage2D').length, 1, 'textura não é realocada');
  assert.ok(calls.some(([name, , , , , , , source]) => name === 'texSubImage2D' && source === video));
});

test('WebGL liga Inverter e Preto e branco no quadro todo', () => {
  const uniforms = Object.fromEntries([
    'uTexture', 'uEffect', 'uThreshold', 'uBias', 'uExposure', 'uGrowth', 'uSpeed', 'uTime',
    'uImageAspect', 'uViewportAspect', 'uMirror', 'uFlip', 'uFit',
  ].map(name => [name, name]));
  const program = {}, texture = {};
  const video = { videoWidth: 640, videoHeight: 360 };
  for (const [effect, expected] of [['invert', 0], ['threshold', 1], ['dither', 2], ['plain', 3]]) {
    const calls = [];
    const gl = {
      TEXTURE_2D: 1, RGBA: 2, UNSIGNED_BYTE: 3, TRIANGLE_STRIP: 4,
      useProgram() {}, bindTexture() {}, texImage2D() {}, texSubImage2D() {},
      uniform1i(name, value) { calls.push([name, value]); },
      uniform1f() {}, viewport() {}, drawArrays() {},
    };
    const render = createRender({
      state: makeState({ effect, timing: {} }), video, gl,
      glState: { program, texture, uniforms },
      canvas: { width: 320, height: 240 },
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
      gridPoint: new Float32Array(2),
    });
    render.renderFrame({}, video);
    assert.ok(calls.some(([name, value]) => name === 'uEffect' && value === expected), effect);
  }
});

test('Fallback 2D aplica Inverter e Preto e branco no quadro todo', () => {
  const video = { videoWidth: 640, videoHeight: 360 };
  for (const [effect, expected] of [['invert', 'invert(1)'], ['threshold', 'grayscale(1) contrast(8)']]) {
    const filters = [];
    const c = {
      filter: '', fillStyle: '',
      save() {}, restore() {}, fillRect() {}, drawImage() {},
      beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
    };
    Object.defineProperty(c, 'filter', { get() { return ''; }, set(value) { filters.push(value); } });
    const render = createRender({
      state: makeState({ effect, timing: {} }), video, fallbackContext: c,
      canvas: { width: 320, height: 240 },
      cropRect: new Float32Array(4),
      mapPointA: new Float32Array(2),
      mapPointB: new Float32Array(2),
      gridPoint: new Float32Array(2),
    });
    render.renderFrame({}, video);
    assert.ok(filters.includes(expected), effect);
  }
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
