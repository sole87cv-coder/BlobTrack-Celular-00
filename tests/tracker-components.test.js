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

test('tracker detecta seis blobs separados com IDs estáveis', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  const positions = [[15, 15], [105, 15], [205, 15], [15, 105], [105, 105], [205, 105]];
  for (const [left, top] of positions) drawBlob(fixture.pixels, 320, left, top);

  const r1 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r1.blobs.length, 6);
  const ids1 = r1.blobs.map(b => b.id).sort();

  const r2 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r2.blobs.length, 6);
  const ids2 = r2.blobs.map(b => b.id).sort();
  assert.deepEqual(ids2, ids1);
});

test('tracker funde dois blobs próximos em um só componente (8-vizinhos)', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  drawBlob(fixture.pixels, 320, 15, 15, 10);
  drawBlob(fixture.pixels, 320, 22, 15, 10);

  const result = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(result.blobs.length, 1);
  assert.equal(result.blobs[0].pixels, 170);
});

test('tracker perde blob quando região deixa de ter movimento', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  drawBlob(fixture.pixels, 320, 15, 15, 10);
  const r1 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r1.blobs.length, 1);

  for (let i = 0; i < fixture.pixels.length; i += 4) {
    fixture.pixels[i] = fixture.pixels[i + 1] = fixture.pixels[i + 2] = 128;
  }
  const r2 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r2.blobs.length, 0);
});

test('tracker mantém componente único quando blobs se tocam por 8-vizinhos', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  for (let y = 15; y < 25; y++) {
    for (let x = 15; x < 25; x++) {
      const index = (y * 320 + x) * 4;
      fixture.pixels[index] = fixture.pixels[index + 1] = fixture.pixels[index + 2] = 255;
    }
  }
  const r1 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r1.blobs.length, 1);

  for (let y = 15; y < 20; y++) {
    for (let x = 15; x < 20; x++) {
      const index = (y * 320 + x) * 4;
      fixture.pixels[index] = fixture.pixels[index + 1] = fixture.pixels[index + 2] = 128;
    }
  }
  const r2 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r2.blobs.length, 1);
});

test('tracker calcula velocidade proporcional ao deslocamento do centróide', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  drawBlob(fixture.pixels, 320, 15, 15, 10);
  const r1 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r1.blobs.length, 1);
  const id1 = r1.blobs[0].id;

  for (let y = 15; y < 25; y++) {
    for (let x = 15; x < 25; x++) {
      const index = (y * 320 + x) * 4;
      fixture.pixels[index] = fixture.pixels[index + 1] = fixture.pixels[index + 2] = 10;
    }
  }
  drawBlob(fixture.pixels, 320, 20, 15, 10);
  const r2 = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(r2.blobs.length, 1);
  assert.equal(r2.blobs[0].id, id1);
  assert.ok(r2.blobs[0].speed > 0);
  assert.ok(r2.blobs[0].speed <= 1);
});

test('tracker respeita limite máximo de blobs (maxBlobs = 12)', (t) => {
  const tracker = new BlobTracker({ maxBlobs: 3 });
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  const positions = [[15, 15], [105, 15], [205, 15], [15, 105], [105, 105], [205, 105]];
  for (const [left, top] of positions) drawBlob(fixture.pixels, 320, left, top);

  const result = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.ok(result.blobs.length <= 3);
});

test('tracker ignora componentes abaixo da área mínima', (t) => {
  const tracker = new BlobTracker({ minAreaRatio: 0.01 });
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  drawBlob(fixture.pixels, 320, 15, 15, 3);
  const result = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(result.blobs.length, 0);
});

test('tracker calcula zonas de atividade corretamente', (t) => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);

  drawBlob(fixture.pixels, 320, 15, 15, 50);
  const result = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.equal(result.raw.zones.length, 6);
  for (const z of result.raw.zones) {
    assert.ok(z >= 0 && z <= 1);
  }
});
