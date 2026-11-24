import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRoiMask } from '../src/core/roiMask.js';
import { BlobTrackerCore } from '../src/domain/blobTrackerCore.js';

test('sem retângulos, ROI é nula e mantém o quadro inteiro', () => {
  assert.equal(createRoiMask({ width: 20, height: 10, sourceWidth: 4, sourceHeight: 3, viewWidth: 4, viewHeight: 3, rects: [] }), null);
});

test('retângulo no centro do palco cobre o centro do quadro de análise', () => {
  const mask = createRoiMask({
    width: 40, height: 30, sourceWidth: 4, sourceHeight: 3,
    viewWidth: 100, viewHeight: 100,
    rects: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }],
  });
  assert.equal(mask[15 * 40 + 20], 1);
  assert.equal(mask[15 * 40 + 2], 0);
});

test('ROI acompanha espelho e inversão vertical da composição', () => {
  const mask = createRoiMask({
    width: 20, height: 20, sourceWidth: 1, sourceHeight: 1,
    viewWidth: 100, viewHeight: 100,
    rects: [{ x: 0.7, y: 0.7, w: 0.2, h: 0.2 }],
    mirror: true, flip: true,
  });
  assert.equal(mask[3 * 20 + 3], 1);
  assert.equal(mask[3 * 20 + 16], 0);
});

test('ROI Gear VR respeita a área contain dentro da tela', () => {
  const mask = createRoiMask({
    width: 20, height: 20, sourceWidth: 4, sourceHeight: 3,
    viewWidth: 100, viewHeight: 100,
    rects: [{ x: 0.45, y: 0.45, w: 0.1, h: 0.1 }],
    gearVr: true,
  });
  assert.equal(mask[10 * 20 + 10], 1);
  assert.equal(mask[0], 0);
});

test('ROI exclui blob fora e detecta blob dentro da região', () => {
  const width = 40, height = 30;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const tracker = new BlobTrackerCore();
  tracker.updatePixels(pixels, width, height, 0.18, 0.04);
  const addBox = (left, top) => {
    for (let y = top; y < top + 4; y++) for (let x = left; x < left + 4; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    }
  };
  addBox(3, 10);
  addBox(27, 10);
  const roi = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) roi.fill(1, y * width + 20, (y + 1) * width);
  const result = tracker.updatePixels(pixels, width, height, 0.18, 0.04, roi);
  assert.equal(result.blobs.length, 1);
  assert.ok(result.blobs[0].x > 0.5);
  assert.equal(result.mask[10 * width + 3], 0);
  assert.equal(result.mask[10 * width + 27], 1);
});

test('ROI inválida retorna null sem quebrar o tracker', () => {
  const tracker = new BlobTrackerCore();
  assert.equal(tracker.updatePixels(new Uint8Array(40 * 30 * 4), 40, 30, 0.18, 0.04, new Uint8Array(4)), null);
});

test('app só cria ROI quando há retângulos, reaproveita cache e persiste Só visual', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(app.includes('if (!state.manualRects.length) return null'));
  assert.ok(app.includes('roiCache.mask && roiCache.rects === state.manualRects'));
  assert.ok(app.includes('getTrackingRoi(source)'));
  assert.ok(app.includes('visualOnly:state.visualOnly'));
  assert.ok(app.includes('audioEnabled:state.audioEnabled&&!state.visualOnly'));
  assert.match(html, /id="visualOnlyButton"[^>]*aria-pressed="false">Só visual/);
});
