import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobTrackerCore } from '../../src/domain/blobTrackerCore.js';

function frame(width, height, regions = []) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
  for (const { x, y, w, h } of regions) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
      const offset = (row * width + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
    }
  }
  return pixels;
}

test('pure tracker consumes RGBA buffers without browser APIs', () => {
  const tracker = new BlobTrackerCore();
  tracker.updatePixels(frame(32, 24), 32, 24, .18, .04);
  const result = tracker.updatePixels(frame(32, 24, [{ x: 3, y: 4, w: 4, h: 4 }]), 32, 24, .18, .04);
  assert.equal(result.blobs.length, 1);
  assert.equal(result.blobs[0].pixels, 16);
  assert.equal(result.mask.length, 32 * 24);
});

test('pure tracker rejects malformed buffers and reset relearns background', () => {
  const tracker = new BlobTrackerCore();
  assert.equal(tracker.updatePixels(new Uint8Array(4), 8, 8, .18, .04), null);
  tracker.updatePixels(frame(16, 16), 16, 16, .18, .04);
  assert.equal(tracker.updatePixels(frame(16, 16, [{ x: 2, y: 2, w: 4, h: 4 }]), 16, 16, .18, .04).blobs.length, 1);
  tracker.reset();
  const result = tracker.updatePixels(frame(16, 16, [{ x: 2, y: 2, w: 4, h: 4 }]), 16, 16, .18, .04);
  assert.equal(result.blobs.length, 0);
});