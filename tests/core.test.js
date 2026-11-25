import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BlobTracker } from '../src/blob-tracker.js';
import { createRecorder, recordingExtension, selectRecordingMimeType } from '../src/recorder.js';
import { drawRecordingFrame, recordingCanvasSize } from '../src/recording-canvas.js';
import { exportRecording } from '../src/recording-export.js';
import { clearVideoComposition } from '../src/video-crop.js';
import { loadPreferences } from '../src/preferences.js';

const projectRoot = new URL('../', import.meta.url);
const supportedMime = 'video/mp4;codecs=avc1.42E01E';

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

class FallbackMediaRecorder extends FakeMediaRecorder {
  static supportedTypes = new Set(['video/mp4;codecs=avc1.64001E', supportedMime]);

  static isTypeSupported(type) {
    return this.supportedTypes.has(type);
  }

  constructor(stream, options) {
    if (options.mimeType === 'video/mp4;codecs=avc1.64001E') {
      const error = new Error('Codec indisponível');
      error.name = 'NotSupportedError';
      throw error;
    }
    super(stream, options);
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

test('preferences safely fall back for malformed, non-object, or inaccessible storage', () => {
  assert.deepEqual(loadPreferences(() => '{'), {});
  assert.deepEqual(loadPreferences(() => 'null'), {});
  assert.deepEqual(loadPreferences(() => '[]'), {});
  assert.deepEqual(loadPreferences(() => '{"focusMode":true}'), { focusMode: true });
  assert.deepEqual(loadPreferences(() => { throw new Error('Storage unavailable'); }), {});
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

test('recording dimensions cap the long edge without changing aspect ratio', () => {
  assert.deepEqual(recordingCanvasSize(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(recordingCanvasSize(640, 480), { width: 640, height: 480 });
  assert.throws(() => recordingCanvasSize(0, 480), /Dimensões/);
});

test('recording composition letterboxes, shades, and layers the overlay last', () => {
  const calls = [];
  const gradient = { addColorStop: (...args) => calls.push(['stop', ...args]) };
  const context = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    clearRect: (...args) => calls.push(['clear', ...args]),
    fillRect: (...args) => calls.push(['fill', ...args]),
    createLinearGradient: (...args) => { calls.push(['gradient', ...args]); return gradient; },
    drawImage: (...args) => calls.push(['image', ...args]),
  };
  const visual = { width: 480, height: 640 };
  const overlay = { width: 480, height: 640 };

  const frame = drawRecordingFrame(context, visual, overlay, 1280, 720, true);

  assert.deepEqual(frame, { left: 370, top: 0, width: 540, height: 720 });
  const visualIndex = calls.findIndex(([type, image]) => type === 'image' && image === visual);
  const shadeIndex = calls.findIndex(([type]) => type === 'gradient');
  const overlayIndex = calls.findIndex(([type, image]) => type === 'image' && image === overlay);
  assert.ok(visualIndex < shadeIndex && shadeIndex < overlayIndex);
  assert.equal(calls.filter(([type]) => type === 'stop').length, 4);
  assert.deepEqual(calls.at(-1), ['restore']);
});

test('recording watermark is drawn over the overlay without changing composition order', () => {
  const calls = [];
  const context = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    clearRect: () => {},
    fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    drawImage: (...args) => calls.push(['image', ...args]),
    fillText: (...args) => calls.push(['text', ...args]),
  };
  const visual = { width: 480, height: 640 };
  const overlay = { width: 480, height: 640 };

  drawRecordingFrame(context, visual, overlay, 1280, 720, false, '@V1su4rt');

  const visualIndex = calls.findIndex(([type, image]) => type === 'image' && image === visual);
  const overlayIndex = calls.findIndex(([type, image]) => type === 'image' && image === overlay);
  const textIndex = calls.findIndex(([type]) => type === 'text');
  assert.ok(visualIndex >= 0 && overlayIndex > visualIndex);
  assert.ok(textIndex > overlayIndex, 'watermark must be the last visible layer');
  assert.equal(calls[textIndex][1], '@V1su4rt');
  assert.deepEqual(calls.at(-1), ['restore']);
});

test('recording export prefers file sharing and respects user cancellation', async () => {
  const operations = [];
  class FakeFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }
  const result = { blob: new Blob(['video']), mimeType: supportedMime, extension: 'webm' };
  const filename = 'BlobTrack_2026-01-01_12-00-00.webm';
  const shared = await exportRecording(result, {
    filename,
    FileClass: FakeFile,
    navigatorObject: {
      canShare: ({ files }) => files[0].name === filename,
      share: async ({ files }) => operations.push(['share', files[0].name]),
    },
    windowObject: {},
    documentObject: {},
  });
  assert.equal(shared, 'shared');
  assert.deepEqual(operations, [['share', filename]]);

  const cancelled = await exportRecording(result, {
    filename,
    FileClass: FakeFile,
    navigatorObject: {
      canShare: () => true,
      share: async () => { throw Object.assign(new Error('Cancelado'), { name: 'AbortError' }); },
    },
    windowObject: { showSaveFilePicker: () => { throw new Error('Não deve abrir'); } },
    documentObject: {},
  });
  assert.equal(cancelled, 'cancelled');
});

test('recording export uses the file picker and falls back to download', async () => {
  const result = { blob: new Blob(['video']), mimeType: supportedMime, extension: 'webm' };
  const filename = 'BlobTrack_2026-01-01_12-00-00.webm';
  const operations = [];
  const pickerResult = await exportRecording(result, {
    filename,
    navigatorObject: {},
    windowObject: {
      showSaveFilePicker: async options => {
        operations.push(['picker', options.suggestedName, options.types[0].accept['video/webm'][0]]);
        return { createWritable: async () => ({
          write: async blob => operations.push(['write', blob.size]),
          close: async () => operations.push(['close']),
        }) };
      },
    },
    documentObject: {},
  });
  assert.equal(pickerResult, 'saved');
  assert.deepEqual(operations.map(([action]) => action), ['picker', 'write', 'close']);

  const downloadEvents = [];
  const downloadResult = await exportRecording(result, {
    filename,
    navigatorObject: {},
    windowObject: {},
    URLClass: {
      createObjectURL: blob => { downloadEvents.push(['create', blob.size]); return 'blob:recording'; },
      revokeObjectURL: url => downloadEvents.push(['revoke', url]),
    },
    setTimeoutFn: callback => { downloadEvents.push(['timer']); callback(); },
    documentObject: {
      createElement: tag => ({
        set href(value) { downloadEvents.push(['href', value]); },
        set download(value) { downloadEvents.push(['filename', value]); },
        click: () => downloadEvents.push(['click']),
      }),
    },
  });
  assert.equal(downloadResult, 'downloaded');
  assert.deepEqual(downloadEvents.map(([action]) => action), ['create', 'href', 'filename', 'click', 'timer', 'revoke']);
});

test('recording export reports a file-picker failure before downloading', async () => {
  const errors = [];
  let clicked = false;
  const method = await exportRecording({
    blob: new Blob(['video']),
    mimeType: supportedMime,
    extension: 'webm',
  }, {
    filename: 'BlobTrack_2026-01-01_12-00-00.webm',
    navigatorObject: {},
    windowObject: { showSaveFilePicker: async () => { throw new Error('Picker indisponível'); } },
    documentObject: { createElement: () => ({ click: () => { clicked = true; } }) },
    URLClass: { createObjectURL: () => 'blob:recording', revokeObjectURL() {} },
    setTimeoutFn() {},
    onError: (operation, error) => errors.push([operation, error.message]),
  });

  assert.equal(method, 'downloaded');
  assert.equal(clicked, true);
  assert.deepEqual(errors, [['seletor de arquivo', 'Picker indisponível']]);
});

test('service worker precaches all runtime assets', async () => {
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const shellMatch = serviceWorker.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(shellMatch, 'service worker shell list exists');
  const shell = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(([, asset]) => asset);
  assert.ok(!shell.includes('./'), 'shell does not cache a duplicate directory URL');
  const requiredAssets = [
    './index.html',
    './src/app.css',
    './src/app.js',
    './src/core/roiMask.js',
    './src/core/qualityController.js',
    './src/blob-tracker.js',
    './src/video-crop.js',
    './src/audio-processor.js',
    './src/recorder.js',
    './src/recording-canvas.js',
    './src/recording-export.js',
    './src/preferences.js',
    './manifest.webmanifest',
    './icons/icon.svg',
  ];

  for (const asset of requiredAssets) {
    assert.ok(shell.includes(asset), `${asset} is precached`);
    await readFile(new URL(asset.replace(/^\.\//, ''), projectRoot));
  }
});

test('Android asset packaging includes every service-worker shell asset', async () => {
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const shellMatch = serviceWorker.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(shellMatch, 'service worker shell list exists');
  const shell = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(([, asset]) => asset);
  const buildFile = await readFile(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  const patterns = [...buildFile.matchAll(/include "([^"]+)"/g)].map(([, pattern]) => pattern);

  for (const asset of shell) {
    const relativeAsset = asset.replace(/^\.\//, '');
    const packaged = patterns.some(pattern => pattern.endsWith('/**')
      ? relativeAsset.startsWith(pattern.slice(0, -2))
      : relativeAsset === pattern);
    assert.ok(packaged, `${asset} is included in Android assets`);
  }
});

test('visibility lifecycle checks use the standard document property', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(app.includes('document.visibilitystate'), false);
  assert.equal([...app.matchAll(/document\.visibilityState\s*(?:===|!==)\s*'visible'/g)].length, 1);
  assert.ok(app.includes("document.visibilityState === 'hidden'"));
  assert.ok(app.includes('recorder.pause()'));
  assert.ok(app.includes('recorder.resume()'));
});

test('recorder selects the first browser-supported MIME and matching extension', () => {
  FakeMediaRecorder.supportedTypes = new Set([supportedMime]);
  assert.equal(selectRecordingMimeType(FakeMediaRecorder), supportedMime);
  assert.equal(recordingExtension('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(recordingExtension(supportedMime), 'mp4');
  assert.equal(selectRecordingMimeType({ isTypeSupported: () => false }), null);
});

test('recorder falls back when a supported MIME is rejected by its constructor', async () => {
  const fixture = createRecorderFixture({ MediaRecorderClass: FallbackMediaRecorder });

  const startInfo = fixture.recorder.start();

  assert.equal(selectRecordingMimeType(FallbackMediaRecorder), 'video/mp4;codecs=avc1.42E01E');
  assert.equal(startInfo.mimeType, supportedMime);
  assert.equal(fixture.activeMediaRecorder.mimeType, supportedMime);
  await fixture.recorder.stop();
});

test('recorder combines the canvas with a cloned audio track and excludes paused time', async () => {
  const fixture = createRecorderFixture();
  const states = [];
  fixture.recorder.onState(snapshot => states.push(snapshot.state));

  const startInfo = fixture.recorder.start({ maxDurationMs: 5000, maxBytes: 1024 });
  assert.equal(startInfo.includesAudio, true);
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
  assert.equal(result.extension, 'mp4');
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

test('default recording limit is five minutes', () => {
  const fixture = createRecorderFixture();
  let finalSnapshot;
  fixture.recorder.onState(snapshot => { finalSnapshot = snapshot; });
  fixture.recorder.start();
  fixture.setNow(301_000);
  fixture.tick();
  assert.equal(finalSnapshot.state, 'idle');
  assert.equal(finalSnapshot.result.reason, 'max-duration');
  assert.equal(finalSnapshot.result.durationMs, 300_000);
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
