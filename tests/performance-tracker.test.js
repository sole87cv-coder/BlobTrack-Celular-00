import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobTracker } from '../src/blob-tracker.js';

function createFrame(width = 320, height = 180) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const context = {
    drawImage() {},
    getImageData() {
      return { data: pixels };
    },
  };
  return {
    pixels,
    context,
    canvas: { width: 0, height: 0 },
    video: { videoWidth: width, videoHeight: height },
  };
}

function drawBlob(pixels, width, left, top, size = 10) {
  for (let y = top; y < top + size; y++) {
    for (let x = left; x < left + size; x++) {
      const index = (y * width + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
    }
  }
}

test('tracker update cost stays below budget for 320px tracking width', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  const positions = [[15, 15], [105, 15], [205, 15], [15, 105], [105, 105], [205, 105]];
  for (const [left, top] of positions) drawBlob(fixture.pixels, 320, left, top);

  const iterations = 100;
  let totalMs = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
    totalMs += performance.now() - t0;
  }
  const averageMs = totalMs / iterations;
  // Budget: tracking must complete within 70% of frame interval at 24 fps (~29 ms per frame)
  const budgetMs = (1000 / 24) * 0.7;
  assert.ok(averageMs < budgetMs, `average tracking cost ${averageMs.toFixed(2)} ms exceeds budget ${budgetMs.toFixed(2)} ms`);
});

test('tracker update cost scales with tracking width', (t) => {
  const tracker = new BlobTracker();
  const fixture320 = createFrame(320, 180);
  const fixture640 = createFrame(640, 360);

  tracker.update(fixture320.video, fixture320.context, fixture320.canvas, 320, 0.18, 0.04);
  tracker.update(fixture640.video, fixture640.context, fixture640.canvas, 640, 0.18, 0.04);

  const positions320 = [[15, 15], [105, 15], [205, 15], [15, 105], [105, 105], [205, 105]];
  for (const [left, top] of positions320) drawBlob(fixture320.pixels, 320, left, top);
  const positions640 = [[30, 30], [210, 30], [410, 30], [30, 330], [210, 330], [410, 330]];
  for (const [left, top] of positions640) drawBlob(fixture640.pixels, 640, left, top);

  let cost320 = 0;
  let cost640 = 0;
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    tracker.update(fixture320.video, fixture320.context, fixture320.canvas, 320, 0.18, 0.04);
    cost320 += performance.now() - t0;

    const t1 = performance.now();
    tracker.update(fixture640.video, fixture640.context, fixture640.canvas, 640, 0.18, 0.04);
    cost640 += performance.now() - t1;
  }
  const avg320 = cost320 / iterations;
  const avg640 = cost640 / iterations;
  // 640px has 4x more pixels than 320px, cost should be roughly proportional
  assert.ok(avg640 > avg320, `640px tracking (${avg640.toFixed(2)} ms) should cost more than 320px (${avg320.toFixed(2)} ms)`);
});

test('tracker processes six blobs within time budget', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  const positions = [[15, 15], [105, 15], [205, 15], [15, 105], [105, 105], [205, 105]];
  for (const [left, top] of positions) drawBlob(fixture.pixels, 320, left, top);

  const t0 = performance.now();
  const result = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  const elapsedMs = performance.now() - t0;

  assert.equal(result.blobs.length, 6);
  assert.ok(elapsedMs < 50, `six-blob detection took ${elapsedMs.toFixed(2)} ms, should be under 50 ms`);
});
