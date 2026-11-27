import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('renderer factory initializes after all captured values', () => {
  const renderIndex = app.indexOf('const render = createRender(');
  assert.ok(renderIndex > 0);
  for (const declaration of [
    'let forceFallback = false;',
    'const maskCanvas =',
    'const cropRect =',
    'const trailIds =',
    'let recordingSnapshot =',
    'function sendAudioOptions()',
    'const glState =',
  ]) assert.ok(app.indexOf(declaration) < renderIndex, `${declaration} must precede the renderer`);
});

test('binary mask renderer receives the live mask context', () => {
  assert.ok(/maskCanvas,\r?\n\s*maskContext,\r?\n\s*maskImage: null,/.test(app));
  assert.ok(!app.includes('maskContext: null'));
});

test('Pontilhado é pointillism: fundo preto, papel só no blob e pontos pretos', async () => {
  assert.ok(!app.includes('bayer8'));
  assert.ok(app.includes('uEffect==2'));
  assert.ok(app.includes('glState.program = glProgram'));
  assert.ok(app.includes('else if(uEffect==2){rgb=vec3(0.0);}'));
  assert.ok(app.includes('float e=0.06;rgb=vec3(smoothstep(t-e,t+e,l));'));
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;'));
  assert.ok(render.includes('const STIPPLE_LEVELS = 8;'));
  assert.ok(render.includes('const jitter = 1 - .75 * edge;'));
  assert.ok(render.includes('Math.abs(l - below)) / .15,'));
  assert.ok(render.includes('grid.jitterX[i] * cellW * jitter'));
  assert.ok(render.includes('grid.error[i + 1] += diffusion * 7 / 16'));
  assert.ok(render.includes('grid.error[below] += diffusion * 5 / 16'));
  assert.ok(render.includes('const quantized = Math.round(tone * STIPPLE_LEVELS) / STIPPLE_LEVELS'));
  assert.ok(render.includes('drawStipple(c, source, viewWidth, viewHeight, offsetX, mirrorX, sample, clip, colors)'));
  assert.ok(render.includes("const paper = colors?.paper || '#fff';"));
  assert.ok(render.includes("const dot = colors?.dot || '#000';"));
  assert.ok(!render.includes('DOT_CELL'));
  assert.ok(!render.includes('DOT_RADIUS_SQ'));
  assert.ok(!render.includes('if (!mask[i]) { packed[i] = 0; continue; }'));
  assert.ok(!render.includes('getHalftoneFrame'));
  assert.ok(render.includes("state.effect === 'invert' ? 0 : state.effect === 'threshold' ? 1 : state.effect === 'dither' ? 2 : 3"));
  assert.ok(!render.includes("state.effect === 'dither') return;"));
  assert.ok(app.includes('drawMaskOverlay(result, source, applied)'));
  assert.ok(render.includes('drawRawVideoWindows(c, result.blobs, viewWidth, viewHeight, offsetX, source, applied)'));
});

test('Pacote 2 compartilha o readback e atualiza textura e máscara sem realocar', async () => {
  assert.ok(app.includes('const pixels = ctx.getImageData(0, 0, width, height).data;'));
  assert.ok(app.includes('tracker.updatePixels(pixels, width, height, state.threshold, dt, getTrackingRoi(source))'));
  assert.ok(app.includes('return { ...result, dt, pixels, pixelWidth: width, pixelHeight: height };'));
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)'));
  assert.ok(render.includes('const shared = sample?.data && sample.width > 0 && sample.height > 0'));
  assert.ok(render.includes('if (changed) maskContext.putImageData(image, 0, 0);'));
  const tracker = await readFile(new URL('../src/blob-tracker.js', import.meta.url), 'utf8');
  assert.ok(tracker.includes('context.getImageData(0, 0, width, height).data'));
  assert.ok(tracker.includes('update(video, context, canvas, trackingWidth, threshold, dt, roiMask = null)'));
});

test('Pontilhado desenha só nos blobs e reaproveita a grade calculada para o quadro', async () => {
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('function prepareStipple(source, viewWidth, viewHeight, sample = null)'));
  assert.ok(render.includes('function blobsClipRect(blobs, viewWidth, viewHeight, offsetX)'));
  assert.ok(render.includes('function paintStipple(c, viewWidth, viewHeight, offsetX, mirrorX, clipRect = null, colors = null)'));
  assert.ok(render.includes('function drawStipple(c, source, viewWidth, viewHeight, offsetX, mirrorX, sample = null, clipRect = null, colors = null)'));
  assert.ok(render.includes("const colors = state.invertBlend"));
  assert.ok(render.includes("? { paper: '#000', dot: '#fff' }"));
  assert.ok(render.includes('stippleReady = false;'));
});

test('Vídeo original ligado aplica efeito na janela; Pontilhado não usa janela de vídeo', async () => {
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('const enableEffect = state.originalVideoWindows || state.videoBlend > 0;'));
  assert.ok(render.includes("const filter = (effectPart + invertPart).trim() || 'none';"));
  assert.ok(render.includes('if (state.videoWindows && !dotted) {'));
  assert.ok(render.includes('// Com Pontilhado ligado o vídeo não entra na composição: os pontos são a imagem gravada.'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('Ligado: aplica o efeito na janela; desligado: vídeo cru dentro do blob'));
});

test('recording snapshot retains identity shared with renderer', () => {
  assert.ok(app.includes('Object.assign(recordingSnapshot, snapshot);'));
  assert.ok(!app.includes('recordingSnapshot = snapshot;'));
});

test('recording follows the mobile recording limits', () => {
  assert.ok(app.includes('hasRecordingStorageHeadroom(navigator.storage)'));
  assert.ok(app.includes('videoBitsPerSecond: deviceProfile.recordingBitrate'));
  assert.ok(app.includes('beforeunload'));
  assert.ok(app.includes('audioStream: audioDestination?.stream'));
  assert.ok(app.includes('recordingCanvasSize(canvas.width, canvas.height, state.maxEffects ? Math.round(deviceProfile.captureWidth * 0.65) : deviceProfile.captureWidth)'));
  assert.ok(app.includes('recordingOwnsFocusMode'));
  assert.ok(app.includes('recorder.releaseResult()'));
});

test('production app uses the tested audio and session factories', () => {
  assert.ok(app.includes('const audioService = createAudio('));
  assert.ok(app.includes('sessionLock.acquire()'));
  assert.ok(app.includes('sessionLock.release()'));
  assert.ok(!app.includes('async function acquireSessionLock()'));
  assert.ok(!app.includes('async function makeAudio()'));
});

test('blob signals are delivered in the same frame with the AudioContext clock', () => {
  const queueIndex = app.indexOf('audioBus.queueSignals({ type:\'signals\'');
  const flushIndex = app.indexOf('audioBus.flushSignals();');
  assert.ok(queueIndex > 0);
  assert.ok(flushIndex > queueIndex);
  assert.ok(app.includes('capturedAt:now, audioTime'));
  assert.ok(app.includes('bandMode:true'));
  assert.ok(app.includes("cacheVersion: 'blobtrack-celular-00-v78'"));
});

test('camera loop initializes the device profile factory before using its FPS', () => {
  const factoryIndex = app.indexOf("import { deviceProfile as createDeviceProfile } from './core/deviceProfile.js';");
  const profileIndex = app.indexOf('const deviceProfile = createDeviceProfile();');
  const firstFpsUse = app.indexOf('deviceProfile.fps');
  assert.ok(factoryIndex >= 0);
  assert.ok(profileIndex > factoryIndex && profileIndex < firstFpsUse);
  assert.ok(app.includes('new BlobTracker({ calibrateFrames: 8, stationaryAbsorbFrames: 8 })'));
});

test('automatic quality separates analysis and render budgets', () => {
  assert.ok(app.includes("import { updateQualityBudgets } from './core/qualityController.js';"));
  assert.ok(app.includes('updateQualityBudgets(perf, state.timing.analysis, state.timing.render'));
  assert.ok(app.includes('1000 / deviceProfile.fps'));
  assert.ok(app.includes('window.__blobtrackMetrics = {'));
  for (const key of ['tAnalysis:', 'tRender:', 'tCapture:', 'tOverlay:', 'tComposition:', 'blobsAtivos:', 'idsNovosUltimos60s:', 'recordingState:', 'effectsPaused:']) {
    assert.ok(app.includes(key), `${key} is published`);
  }
});

test('Pacote 1 reaproveita buffers e evita payload de áudio inútil', async () => {
  assert.ok(app.includes('let maskImage = null, maskView = null;'));
  assert.ok(/maskImage: null,\r?\n\s*maskView: null,/.test(app));
  assert.ok(app.includes("typeof state.worklet?.port?.postMessage === 'function'"));
  assert.ok(app.includes("value: el.querySelector('b')"));
  assert.ok(app.includes('zone.value.textContent'));
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('maskView || (maskView = new Uint32Array(image.data.buffer))'));
  assert.ok(render.includes('meshSteps = { width: viewWidth, height: viewHeight, spacing, x: xSteps, y: ySteps }'));
  assert.ok(render.includes('state.timing.overlay = overlayCost'));
  assert.ok(render.includes("if (!(filter !== 'none' && state.videoBlend === 0)) drawSource();"));
});

test('viewport does not prevent user zoom', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1(?:\.0+)?/i);
});

test('slider changes debounce preference writes and flush on lifecycle', () => {
  assert.ok(app.includes('function scheduleSavePreferences(delay = 300)'));
  assert.ok(app.includes('function flushPendingPreferences()'));
  assert.ok(!app.includes('saveSoundPreferences'));
  for (const id of ['videoBlend', 'maxConnectionDistance', 'motionThreshold', 'master', 'bias', 'trackingWidth']) {
    const start = app.indexOf(`$('${id}').addEventListener('input'`);
    assert.ok(start >= 0, `${id} has an input handler`);
    const block = app.slice(start, start + 400);
    assert.ok(block.includes('scheduleSavePreferences()') || block.includes('setTrackingWidth('), `${id} must not write preferences synchronously`);
  }
  assert.equal(app.split('flushPendingPreferences();').length - 1, 3);
});

test('active session drops backdrop blur using the existing opaque fallback', async () => {
  const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.ok(app.includes("document.body.classList.add('session-active')"));
  assert.ok(app.includes("document.body.classList.remove('session-active')"));
  assert.ok(css.includes('@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px)))'));
  assert.ok(css.includes('body.session-active .float-bar'));
  assert.ok(css.includes('body.session-active .stage-pill'));
  assert.ok(css.includes('body.session-active .dock'));
  assert.ok(css.includes('body.session-active .toast'));
  assert.ok(css.includes('body.session-active .record-indicator'));
  assert.ok(css.includes('background-color:#111720f5'));
  const navRule = css.split('\n').find(line => line.startsWith('.primary-nav {'));
  assert.ok(navRule && !navRule.includes('backdrop-filter'), 'primary navigation must not request GPU blur');
});

test('locale observer pauses while the HUD is updating during a session', () => {
  assert.ok(app.includes('const LOCALE_OBSERVER_OPTIONS'));
  assert.ok(app.includes('function suspendLocaleObserver() { localeObserver.disconnect(); }'));
  assert.ok(app.includes('function resumeLocaleObserver() { localeObserver.observe(document.body, LOCALE_OBSERVER_OPTIONS); }'));
  assert.ok(app.includes("localeObserver.observe(document.body, LOCALE_OBSERVER_OPTIONS);"));
  const start = app.indexOf("document.body.classList.add('session-active')");
  assert.ok(start >= 0);
  assert.ok(app.slice(start, start + 160).includes('suspendLocaleObserver()'));
  const stop = app.indexOf("document.body.classList.remove('session-active')");
  assert.ok(stop >= 0);
  assert.ok(app.slice(stop, stop + 160).includes('resumeLocaleObserver()'));
  assert.ok(app.includes('function updateHud('), 'HUD updates remain available');
});

test('recording watermark is wired from the app into the renderer', () => {
  assert.ok(app.includes('RECORDING_WATERMARK'));
  assert.ok(app.includes('recordingWatermark: RECORDING_WATERMARK'));
});

test('Tom base keyboard mirrors the eight selectable keys without bypassing audio options', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
  const select = html.match(/<select id="audioKey"[\s\S]*?<\/select>/)?.[0] || '';
  const values = [...select.matchAll(/<option value="(\d+)"/g)].map(match => match[1]);
  assert.deepEqual(values, ['0', '2', '4', '5', '7', '9', '10', '11']);
  const buttons = [...html.matchAll(/data-audio-key="(\d+)"/g)].map(match => match[1]);
  assert.equal(buttons.length, values.length * 2, 'piano do palco espelha o teclado do painel');
  assert.deepEqual(buttons.slice(0, values.length), values);
  assert.deepEqual(buttons.slice(values.length), values);
  assert.match(select, /class="sr-only" tabindex="-1"/);
  assert.ok(html.includes('<label for="audioKey"'));
  assert.ok(html.includes('class="audio-keyboard"'));
  assert.ok(html.includes('class="stage-keyboard" id="stageKeyboard" role="group" aria-label="Tom base"'));
  assert.match(html, /data-audio-key="0" aria-pressed="true"/);
  const keyRule = css.split('\n').find(line => line.startsWith('.audio-key {'));
  assert.ok(keyRule && keyRule.includes('min-height:44px'), 'keys keep an accessible touch target');
  assert.ok(css.includes('.audio-keyboard {'));
  assert.ok(css.includes('.stage-keyboard {'));
  assert.ok(css.includes('body.fullscreen-active .stage-keyboard,'));
  assert.ok(css.includes('body.gear-vr .stage-keyboard { display:none!important }'));
  assert.ok(app.includes('function syncFullscreenUi()'));
  assert.ok(app.includes("document.body.classList.toggle('fullscreen-active',on);"));
  assert.ok(app.includes("document.addEventListener('fullscreenchange',syncFullscreenUi);"));
  assert.ok(app.includes("document.addEventListener('webkitfullscreenchange',syncFullscreenUi);"));
  assert.ok(app.includes("const audioKeyButtons=[...document.querySelectorAll('[data-audio-key]')];"));
  assert.ok(app.includes('function syncAudioKey()'));
  assert.ok(app.includes("syncAudioKey();"));
  assert.ok(app.includes("dispatchEvent(new Event('change',{bubbles:true}))"));
  const changeHandler = app.indexOf("$('audioKey').addEventListener('change'");
  assert.ok(app.slice(changeHandler, changeHandler + 200).includes('syncAudioKey()'));
});
