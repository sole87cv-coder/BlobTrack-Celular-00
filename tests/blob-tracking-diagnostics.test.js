import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobTrackerCore } from '../src/domain/blobTrackerCore.js';

const width = 320;
const height = 180;

function createFrame() {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const context = { drawImage() {}, getImageData: () => ({ data: pixels }) };
  return { pixels, context, canvas: { width: 0, height: 0 }, video: { videoWidth: width, videoHeight: height } };
}

function fillBackground(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 36;
    pixels[i + 3] = 255;
  }
}

function setBox(pixels, left, top, color = 230, size = 10) {
  for (let y = top; y < top + size; y++) for (let x = left; x < left + size; x++) {
    const index = (y * width + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = color;
  }
}

function update(tracker, fixture) {
  return tracker.updatePixels(fixture.pixels, width, height, 0.18, 1 / 24);
}

function initialize(tracker, fixture) {
  fillBackground(fixture.pixels);
  update(tracker, fixture);
}

test('id sobrevive a 2 frames ausente e reaparece no mesmo id', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 20, 30);
  const firstId = update(tracker, fixture).blobs[0].id;

  fillBackground(fixture.pixels);
  assert.equal(update(tracker, fixture).blobs.length, 0);
  assert.equal(update(tracker, fixture).blobs.length, 0);
  setBox(fixture.pixels, 26, 30);
  assert.equal(update(tracker, fixture).blobs[0].id, firstId);
});

test('id novo após 4 frames ausente', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 20, 30);
  const firstId = update(tracker, fixture).blobs[0].id;

  fillBackground(fixture.pixels);
  for (let i = 0; i < 4; i++) assert.equal(update(tracker, fixture).blobs.length, 0);
  setBox(fixture.pixels, 20, 30);
  assert.notEqual(update(tracker, fixture).blobs[0].id, firstId);
});

test('cruzamento em X mantém ids em >= 90% dos frames (2 manchas 10×10, 40 frames)', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  let firstRowId = 0;
  let secondRowId = 0;
  let stable = 0;
  const observed = [];

  for (let frame = 0; frame < 40; frame++) {
    fillBackground(fixture.pixels);
    const pathFrame = Math.min(frame, 7);
    const ax = 20 + pathFrame * 30;
    const ay = 10 + pathFrame * 17;
    const bx = 230 - pathFrame * 30;
    const by = 129 - pathFrame * 17;
    setBox(fixture.pixels, ax, ay);
    setBox(fixture.pixels, bx, by);
    const blobs = update(tracker, fixture).blobs;
    if (blobs.length !== 2) continue;
    const findAt = (x, y) => blobs.reduce((best, blob) => {
      const distance = (blob.x * width - (x + 4.5)) ** 2 + (blob.y * height - (y + 4.5)) ** 2;
      return !best || distance < best.distance ? { blob, distance } : best;
    }, null)?.blob;
    const a = findAt(ax, ay);
    const b = findAt(bx, by);
    if (!a || !b || a === b) continue;
    if (frame === 0) { firstRowId = a.id; secondRowId = b.id; }
    if (a.id === firstRowId && b.id === secondRowId) stable++;
    observed.push([frame, a.id, b.id, firstRowId, secondRowId]);
  }
  assert.ok(stable / 40 >= 0.9, `stable identity ratio was ${(stable / 40).toFixed(2)}: ${JSON.stringify(observed)}`);
});

test('blob que sai pela borda não duplica id ao voltar pelo mesmo lado dentro de 3 frames', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 280, 30);
  const firstId = update(tracker, fixture).blobs[0].id;
  fillBackground(fixture.pixels);
  setBox(fixture.pixels, 290, 30);
  assert.equal(update(tracker, fixture).blobs[0].id, firstId);
  fillBackground(fixture.pixels);
  setBox(fixture.pixels, 310, 30);
  assert.equal(update(tracker, fixture).blobs[0].id, firstId);

  fillBackground(fixture.pixels);
  update(tracker, fixture);
  update(tracker, fixture);
  setBox(fixture.pixels, 304, 30);
  const returned = update(tracker, fixture).blobs[0];
  assert.equal(returned.id, firstId);
});

test('frame sem movimento continua com blobs.length === 0', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  const result = update(tracker, fixture);
  assert.equal(result.blobs.length, 0);
});

test('velocidade do teste existente permanece na mesma fórmula', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 15, 15);
  update(tracker, fixture);
  fillBackground(fixture.pixels);
  setBox(fixture.pixels, 20, 15);
  const result = update(tracker, fixture);
  assert.ok(Math.abs(result.blobs[0].speed - (5 / width / (1 / 24) / 2)) < 0.0001);
});
