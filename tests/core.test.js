import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BlobTracker } from '../src/blob-tracker.js';
import { createRecorder, recordingExtension, selectRecordingMimeType } from '../src/recorder.js';
import { clearVideoComposition } from '../src/video-crop.js';

const projectRoot = new URL('../', import.meta.url);
const supportedMime = 'video/webm;codecs=vp8,opus';

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.stopped = false;
  }

  clone() {
    this.cloned = new FakeTrack(this.kind);
    return this.cloned;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeMediaStream {
  constructor(tracks) {
    this.tracks = tracks;
  }

  getVideoTracks() {
    return this.tracks.filter(track => track.kind === 'video');
  }

  getAudioTracks() {
    return this.tracks.filter(track => track.kind === 'audio');
  }
}

class FakeMediaRecorder {
  static supportedTypes = new Set([supportedMime]);
  static instances = [];

  static isTypeSupported(type) {
    return this.supportedTypes.has(type);
  }

  constructor(stream, options) {
    this.stream = stream;
    this.mimeType = options.mimeType;
    this.state = 'inactive';
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['final'], { type: this.mimeType }) });
    this.onstop?.();
  }

  emitChunk(value) {
    this.ondataavailable?.({ data: new Blob([value], { type: this.mimeType }) });
  }
}

function createRecorderFixture(overrides = {}) {
  const videoTrack = new FakeTrack('video');
  const audioTrack = new FakeTrack('audio');
  let now = 1000;
  let timerCallback = null;
  const recorder = createRecorder({
    canvas: { captureStream: fps => {
      assert.equal(fps, 24);
      return new FakeMediaStream([videoTrack]);
    } },
    fps: 24,
    MediaRecorderClass: FakeMediaRecorder,
    MediaStreamClass: FakeMediaStream,
    URLClass: { createObjectURL: () => 'blob:test-recording' },
    getAudioStream: () => new FakeMediaStream([audioTrack]),
    now: () => now,
    setIntervalFn: callback => {
      timerCallback = callback;
      return 1;
    },
    clearIntervalFn() {},
    ...overrides,
  });
  return {
    recorder,
    videoTrack,
    audioTrack,
    setNow(value) { now = value; },
    tick() { timerCallback?.(); },
    get activeMediaRecorder() { return FakeMediaRecorder.instances.at(-1); },
  };
}

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

function addSixBlobs(pixels, width = 320) {
  for (const [left, top] of [[15, 15], [105, 15], [205, 15], [15, 105], [105, 105], [205, 105]]) {
    for (let y = top; y < top + 10; y++) {
      for (let x = left; x < left + 10; x++) {
        const index = (y * width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      }
    }
  }
}

test('tracker skips frames until camera dimensions are available', () => {
  const tracker = new BlobTracker();
  assert.equal(tracker.update({ videoWidth: 0, videoHeight: 180 }, {}, {}, 320, 0.18, 0.04), null);
});

test('tracker uses a safe threshold and preserves blob IDs across frames', () => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  addSixBlobs(fixture.pixels);

  const result = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, Number.NaN, 0.04);
  assert.equal(result.blobs.length, 6);
  assert.equal(result.mask.reduce((sum, pixel) => sum + pixel, 0), 600);
  assert.equal(result.raw.zones.length, 6);

  const ids = result.blobs.map(blob => blob.id);
  const next = tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  assert.deepEqual(next.blobs.map(blob => blob.id), ids);
});

test('tracker reset relearns the current frame as background', () => {
  const tracker = new BlobTracker();
  const fixture = createFrame();
  tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04);
  addSixBlobs(fixture.pixels);
  assert.equal(tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04).blobs.length, 6);

  tracker.reset();
  assert.equal(tracker.update(fixture.video, fixture.context, fixture.canvas, 320, 0.18, 0.04).blobs.length, 0);
});

test('WebGL cleanup clears the framebuffer and overlay', () => {
  const calls = [];
  const gl = {
    FRAMEBUFFER: 'framebuffer',
    COLOR_BUFFER_BIT: 0x4000,
    bindFramebuffer: (...args) => calls.push(['bindFramebuffer', ...args]),
    viewport: (...args) => calls.push(['viewport', ...args]),
    clearColor: (...args) => calls.push(['clearColor', ...args]),
    clear: (...args) => calls.push(['clear', ...args]),
  };
  const overlayContext = { clearRect: (...args) => calls.push(['overlay', ...args]) };

  clearVideoComposition({ gl, fallbackContext: null, overlayContext, width: 320, height: 180 });

  assert.deepEqual(calls, [
    ['bindFramebuffer', 'framebuffer', null],
    ['viewport', 0, 0, 320, 180],
    ['clearColor', 0, 0, 0, 1],
    ['clear', 0x4000],
    ['overlay', 0, 0, 320, 180],
  ]);
});

test('Canvas 2D cleanup clears both composition layers', () => {
  const calls = [];
  const fallbackContext = { clearRect: (...args) => calls.push(['fallback', ...args]) };
  const overlayContext = { clearRect: (...args) => calls.push(['overlay', ...args]) };

  clearVideoComposition({ gl: null, fallbackContext, overlayContext, width: 320, height: 180 });

  assert.deepEqual(calls, [
    ['fallback', 0, 0, 320, 180],
    ['overlay', 0, 0, 320, 180],
  ]);
});

test('service worker precaches all runtime assets', async () => {
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const shellMatch = serviceWorker.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(shellMatch, 'service worker shell list exists');
  const shell = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(([, asset]) => asset);
  const requiredAssets = [
    './index.html',
    './src/app.css',
    './src/app.js',
    './src/blob-tracker.js',
    './src/video-crop.js',
    './src/audio-processor.js',
    './manifest.webmanifest',
    './icons/icon.svg',
  ];

  for (const asset of requiredAssets) {
    assert.ok(shell.includes(asset), `${asset} is precached`);
    await readFile(new URL(asset.replace(/^\.\//, ''), projectRoot));
  }
});

test('visibility lifecycle checks use the standard document property', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(app.includes('document.visibilitystate'), false);
  assert.equal([...app.matchAll(/document\.visibilityState\s*===\s*'visible'/g)].length, 2);
});

test('recorder selects the first browser-supported MIME and matching extension', () => {
  FakeMediaRecorder.supportedTypes = new Set([supportedMime]);
  assert.equal(selectRecordingMimeType(FakeMediaRecorder), supportedMime);
  assert.equal(recordingExtension('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(recordingExtension(supportedMime), 'webm');
  assert.equal(selectRecordingMimeType({ isTypeSupported: () => false }), null);
});

test('recorder combines the canvas with a cloned audio track and excludes paused time', async () => {
  const fixture = createRecorderFixture();
  const states = [];
  fixture.recorder.onState(snapshot => states.push(snapshot.state));

  fixture.recorder.start({ maxDurationMs: 5000, maxBytes: 1024 });
  assert.equal(fixture.activeMediaRecorder.timeslice, 1000);
  assert.equal(fixture.activeMediaRecorder.stream.getVideoTracks().length, 1);
  assert.equal(fixture.activeMediaRecorder.stream.getAudioTracks().length, 1);
  assert.notEqual(fixture.activeMediaRecorder.stream.getAudioTracks()[0], fixture.audioTrack);

  fixture.setNow(2000);
  assert.equal(fixture.recorder.pause(), true);
  fixture.setNow(4000);
  assert.equal(fixture.recorder.resume(), true);
  fixture.setNow(5000);
  const result = await fixture.recorder.stop();

  assert.equal(result.durationMs, 2000);
  assert.equal(result.mimeType, supportedMime);
  assert.equal(result.extension, 'webm');
  assert.equal(result.url, 'blob:test-recording');
  assert.equal(fixture.videoTrack.stopped, true);
  assert.equal(fixture.audioTrack.cloned.stopped, true);
  assert.equal(fixture.audioTrack.stopped, false);
  assert.deepEqual(states, ['idle', 'recording', 'paused', 'recording', 'stopping', 'stopping', 'idle']);
});

test('recorder stops automatically at the duration limit', () => {
  const fixture = createRecorderFixture();
  let finalSnapshot;
  fixture.recorder.onState(snapshot => { finalSnapshot = snapshot; });
  fixture.recorder.start({ maxDurationMs: 500, maxBytes: 1024 });
  fixture.setNow(1600);
  fixture.tick();

  assert.equal(finalSnapshot.state, 'idle');
  assert.equal(finalSnapshot.result.reason, 'max-duration');
  assert.equal(finalSnapshot.result.durationMs, 600);
});

test('recorder preserves a partial result if the media stream ends unexpectedly', () => {
  const fixture = createRecorderFixture();
  let finalSnapshot;
  fixture.recorder.onState(snapshot => { finalSnapshot = snapshot; });
  fixture.recorder.start();
  fixture.setNow(2500);
  fixture.activeMediaRecorder.state = 'inactive';
  fixture.activeMediaRecorder.ondataavailable({ data: new Blob(['partial'], { type: supportedMime }) });
  fixture.activeMediaRecorder.onstop();

  assert.equal(finalSnapshot.state, 'idle');
  assert.equal(finalSnapshot.result.reason, 'ended');
  assert.equal(finalSnapshot.result.durationMs, 1500);
  assert.equal(finalSnapshot.result.bytes, 7);
});

test('recorder stops at the byte limit and rejects unsupported browsers', () => {
  const fixture = createRecorderFixture();
  let finalSnapshot;
  fixture.recorder.onState(snapshot => { finalSnapshot = snapshot; });
  fixture.recorder.start({ maxBytes: 3 });
  fixture.activeMediaRecorder.emitChunk('large');
  assert.equal(finalSnapshot.state, 'idle');
  assert.equal(finalSnapshot.result.reason, 'max-bytes');

  const unsupported = createRecorderFixture({ MediaRecorderClass: { isTypeSupported: () => false } });
  assert.equal(unsupported.recorder.isSupported(), false);
  assert.throws(() => unsupported.recorder.start(), /não suportada/);
});
