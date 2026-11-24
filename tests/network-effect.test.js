import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRender } from '../src/render/render.js';

function renderer(state = {}) {
  const pointBuffer = new Float32Array(12 * 2);
  return createRender({
    state: { camera: 'environment', flip: false, gearVr: false, ...state },
    video: { videoWidth: 640, videoHeight: 480 },
    cropRect: new Float32Array(4),
    mapPointA: new Float32Array(2),
    blobViewPoints: pointBuffer,
    TRAIL_SLOTS: 12,
  });
}

function context() {
  const calls = { lines: 0, nodes: 0 };
  return {
    calls,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, stroke() {}, fill() {},
    lineTo() { calls.lines++; },
    arc() { calls.nodes++; },
  };
}

test('rede conecta centros próximos e desenha um vértice por blob', () => {
  const render = renderer();
  const canvas = context();
  render.drawBlobNetwork(canvas, [
    { x: 0.35, y: 0.5 },
    { x: 0.55, y: 0.5 },
    { x: 0.95, y: 0.5 },
  ], 320, 240, 0);
  assert.equal(canvas.calls.lines, 1);
  assert.equal(canvas.calls.nodes, 3);
});

test('rede não conecta vértices além do raio de proximidade', () => {
  const render = renderer();
  const canvas = context();
  render.drawBlobNetwork(canvas, [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.8 },
  ], 320, 240, 0);
  assert.equal(canvas.calls.lines, 0);
  assert.equal(canvas.calls.nodes, 2);
});

test('botão da rede alterna e persiste o efeito e o renderer respeita pausa', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.match(html, /id="blobNetworkButton"[^>]*aria-pressed="false"[^>]*>Rede de blobs/);
  assert.ok(app.includes('networkEffect: false'));
  assert.ok(app.includes('saved.networkEffect'));
  assert.ok(app.includes('networkEffect:state.networkEffect'));
  assert.ok(app.includes("bindReactiveToggle('blobNetworkButton', 'networkEffect')"));
  assert.match(render, /if \(state\.networkEffect && !state\.performance\.effectsPaused\)\s*\{\s*drawBlobNetwork/);
});

test('janelas aparecem antes dos efeitos reativos e da rede', async () => {
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  const overlay = render.slice(render.indexOf('function drawMaskOverlay('));
  const windows = overlay.indexOf('drawRawVideoWindows(c,');
  const trails = overlay.indexOf('drawTrails(c,');
  const waves = overlay.indexOf('drawWaves(c,');
  const mesh = overlay.indexOf('drawMesh(c,');
  const network = overlay.indexOf('drawBlobNetwork(c,');
  assert.ok(windows >= 0 && windows < trails);
  assert.ok(trails < waves && waves < mesh && mesh < network);
});

test('pausa por FPS tem badge visível no palco e mantém descrição detalhada', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="effectsPausedBadge"[^>]*role="status"[^>]*hidden/);
  assert.ok(app.includes("const badge = $('effectsPausedBadge')"));
  assert.ok(app.includes('badge.hidden = !perf.effectsPaused'));
  assert.ok(app.includes('Efeitos reativos pausados · ${Math.round(perf.fpsAverage)} fps'));
});
