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

test('botão da rede alterna e persiste o efeito e o renderer desenha sempre', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.match(html, /id="blobNetworkButton"[^>]*aria-pressed="false"[^>]*>Rede de blobs/);
  assert.ok(app.includes('networkEffect: false'));
  assert.ok(app.includes('saved.networkEffect'));
  assert.ok(app.includes('networkEffect:state.networkEffect'));
  assert.ok(app.includes("bindReactiveToggle('blobNetworkButton', 'networkEffect')"));
  assert.match(render, /if \(state\.networkEffect\) drawBlobNetwork/);
});

test('janelas aparecem antes dos efeitos reativos e da rede', async () => {
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  const overlay = render.slice(render.indexOf('function drawMaskOverlay('));
  const windows = overlay.indexOf('drawRawVideoWindows(c,');
  // Ignora o drawImage de recorte do Pontilhado; este é o da sobreposição "Mostrar máscara".
  const mask = overlay.indexOf('drawImage(maskCanvas,', windows);
  const trails = overlay.indexOf('drawTrails(c,');
  const waves = overlay.indexOf('drawWaves(c,');
  const mesh = overlay.indexOf('drawMesh(c,');
  const network = overlay.indexOf('drawBlobNetwork(c,');
  assert.ok(windows >= 0 && windows < mask && mask < trails);
  assert.ok(trails < waves && waves < mesh && mesh < network);
});

test('limite do aparelho mostra aviso discreto e nunca pausa efeitos', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="deviceLimitNotice"[^>]*role="status"[^>]*hidden/);
  assert.ok(!html.includes('effectsPausedBadge'));
  assert.ok(!html.includes('effectPerformanceHint'));
  assert.ok(app.includes("const DEVICE_LIMIT_NOTICE = 'Aparelho no limite · efeitos mantidos'"));
  assert.ok(app.includes('notice.textContent = translateText(DEVICE_LIMIT_NOTICE, locale)'));
  assert.ok(app.includes('effectsPaused: false'));
});

test('nenhum gatilho de pausa nem orçamento de gravação corta os efeitos', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../src/core/qualityController.js', import.meta.url), 'utf8');
  for (const source of [app, render, controller]) {
    assert.ok(!source.includes('renderPause'), 'sem gatilho renderPause');
    assert.ok(!source.includes('recordingBudget'), 'sem corte ao gravar');
    assert.ok(!source.includes('setReactiveEffectsPaused'), 'sem política de pausa');
  }
  assert.ok(!render.includes('effectsPaused'), 'renderer não tem porta de pausa');
  assert.ok(!app.includes("showToast('Efeitos reativos pausados"));
  assert.ok(render.includes('if (state.networkEffect) drawBlobNetwork'));
  assert.ok(render.includes('if (state.distanceTelemetry) drawDistanceTelemetry'));
});
