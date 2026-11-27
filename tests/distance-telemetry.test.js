import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRender } from '../src/render/render.js';

function context() {
  const calls = { lines: [], labels: 0, rectangles: 0 };
  let point = null;
  return {
    calls,
    save() {}, restore() {}, beginPath() {}, stroke() {},
    moveTo(x, y) { point = [x, y]; },
    lineTo(x, y) { calls.lines.push([point, [x, y]]); },
    measureText(text) { return { width: text.length * 6 }; },
    fillRect() { calls.rectangles++; },
    fillText() { calls.labels++; },
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

test('drawMaskOverlay não contém mais a mira central do teclado', async () => {
  const source = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  const drawMaskOverlay = source.slice(source.indexOf('function drawMaskOverlay('), source.indexOf('function drawRecordingComposite('));
  assert.doesNotMatch(drawMaskOverlay, /arc\(x,\s*y,\s*9/);
});
