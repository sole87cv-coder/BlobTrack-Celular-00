import { performance } from 'node:perf_hooks';
import { BlobTrackerCore } from '../src/domain/blobTrackerCore.js';

const width = 320;
const height = 180;
const warmupFrames = 30;
const measuredFrames = 300;
const pixels = new Uint8ClampedArray(width * height * 4);

function drawFrame(frame) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 36;
    pixels[i + 1] = 36;
    pixels[i + 2] = 36;
    pixels[i + 3] = 255;
  }
  const x1 = 20 + frame % 100;
  const x2 = 260 - frame % 100;
  const y1 = 40 + Math.floor(frame % 60 / 3);
  const y2 = 110 - Math.floor(frame % 60 / 3);
  for (const [left, top] of [[x1, y1], [x2, y2]]) {
    for (let y = top; y < top + 14; y++) {
      for (let x = left; x < left + 14; x++) {
        const index = (y * width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 230;
      }
    }
  }
}

function percentile(sorted, value) {
  return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];
}

const tracker = new BlobTrackerCore();
drawFrame(-1);
tracker.updatePixels(pixels, width, height, 0.18, 1 / 24);

for (let i = 0; i < warmupFrames; i++) {
  drawFrame(i);
  tracker.updatePixels(pixels, width, height, 0.18, 1 / 24);
}

const samples = new Float64Array(measuredFrames);
for (let i = 0; i < measuredFrames; i++) {
  drawFrame(i + warmupFrames);
  const start = performance.now();
  tracker.updatePixels(pixels, width, height, 0.18, 1 / 24);
  samples[i] = performance.now() - start;
}

const sorted = Array.from(samples).sort((a, b) => a - b);
console.log(JSON.stringify({
  benchmark: 'BlobTrackerCore.updatePixels',
  width,
  height,
  scenario: 'two moving 14x14 rectangles',
  warmupFrames,
  measuredFrames,
  p50Ms: Number(percentile(sorted, 0.5).toFixed(3)),
  p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
  peakMs: Number(sorted.at(-1).toFixed(3)),
}, null, 2));
