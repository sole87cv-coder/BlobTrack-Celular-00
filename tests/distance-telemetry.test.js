import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRender, placeOverlayLabel } from '../src/render/render.js';

function context() {
  const calls = { lines: [], labels: 0, rectangles: 0, labelPositions: [] };
  let point = null;
  return {
    calls,
    save() {}, restore() {}, beginPath() {}, stroke() {},
    moveTo(x, y) { point = [x, y]; },
    lineTo(x, y) { calls.lines.push([point, [x, y]]); },
    measureText(text) { return { width: text.length * 6 }; },
    fillRect() { calls.rectangles++; },
    fillText(text, x, y) { calls.labels++; calls.labelPositions.push([text, x, y]); },
  };
}

function renderer(state = {}) {
  return createRender({
    state: { camera: 'environment', flip: false, gearVr: false, distanceTelemetry: true,
      maxConnectionDistance: 0.22, ...state },
    video: { videoWidth: 640, videoHeight: 480 },
    cropRect: new Float32Array(4),
    mapPointA: new Float32Array(2), mapPointB: new Float32Array(2),
    blobViewPoints: new Float32Array(24), TRAIL_SLOTS: 12,
  });
}

test('par próximo desenha uma aresta e uma etiqueta de distância', () => {
  const c = context();
  const drawn = renderer().drawDistanceTelemetry(c, [{ x: 0.35, y: 0.5 }, { x: 0.45, y: 0.5 }], 320, 240);
  assert.equal(drawn, 1);
  assert.equal(c.calls.lines.length, 1);
  assert.equal(c.calls.labels, 1);
});

test('blobs fora do alcance não são conectados', () => {
  const c = context();
  const drawn = renderer().drawDistanceTelemetry(c, [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.8 }], 320, 240);
  assert.equal(drawn, 0);
  assert.equal(c.calls.labels, 0);
});

test('cada blob recebe no máximo três vizinhos e pares não duplicam', () => {
  const c = context();
  const blobs = [
    { x: .50, y: .50 }, { x: .36, y: .50 }, { x: .64, y: .50 },
    { x: .50, y: .32 }, { x: .50, y: .68 },
  ];
  const drawn = renderer().drawDistanceTelemetry(c, blobs, 320, 240);
  const keys = c.calls.lines.map(([a, b]) => `${a.join(',')}|${b.join(',')}`);
  assert.equal(new Set(keys).size, drawn);
  const degree = new Map();
  for (const [a, b] of c.calls.lines) {
    degree.set(a.join(','), (degree.get(a.join(',')) || 0) + 1);
    degree.set(b.join(','), (degree.get(b.join(',')) || 0) + 1);
  }
  assert.ok([...degree.values()].every(value => value <= 3));
  assert.equal(degree.get(`${160},${120}`), 3);
  assert.equal(drawn, 3);
});

test('telemetria não desenha quando desligada', () => {
  const c = context();
  assert.equal(renderer({ distanceTelemetry: false }).drawDistanceTelemetry(c, [{ x: .4, y: .5 }, { x: .5, y: .5 }], 320, 240), 0);
  assert.equal(c.calls.lines.length, 0);
});

test('acomoda rótulos no primeiro canto livre e registra a caixa usada', () => {
  const c = context();
  const occupied = [{ left: 90, top: 90, right: 110, bottom: 110 }];
  const placed = placeOverlayLabel(c, '12px', [[100, 100], [200, 100]], occupied);
  assert.equal(placed.x, 200, 'o primeiro canto estava tomado');
  assert.equal(occupied.length, 2);
  assert.ok(placed.box.left >= 184 && placed.box.right <= 216);
});

test('etiqueta de distância muda de lado quando o canto já está ocupado', () => {
  const blobs = [{ x: .35, y: .5 }, { x: .45, y: .5 }];
  const clean = context();
  renderer().drawDistanceTelemetry(clean, blobs, 320, 240, 0, undefined, []);
  assert.equal(clean.calls.labelPositions[0][2], 128);

  const busy = context();
  const occupied = [{ left: 120, top: 120, right: 136, bottom: 136 }];
  renderer().drawDistanceTelemetry(busy, blobs, 320, 240, 0, undefined, occupied);
  assert.notEqual(busy.calls.labelPositions[0][2], 128, 'a etiqueta foi para o outro lado da linha');
  assert.equal(occupied.length, 2, 'a lista compartilhada ganhou a caixa da etiqueta');
});

test('drawMaskOverlay não contém mais a mira central do teclado', async () => {
  const source = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  const drawMaskOverlay = source.slice(source.indexOf('function drawMaskOverlay('), source.indexOf('function drawRecordingComposite('));
  assert.doesNotMatch(drawMaskOverlay, /arc\(x,\s*y,\s*9/);
});
