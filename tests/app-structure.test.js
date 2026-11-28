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
  assert.ok(app.includes('if(uEffect==0){rgb=vec3(0.0);}'));
  assert.ok(app.includes('else if(uEffect==1){rgb=vec3(dot(rgb,vec3(.299,.587,.114)));}'));
  assert.ok(app.includes('else if(uEffect==2){rgb=vec3(0.0);}'));
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;'));
  assert.ok(render.includes('const STIPPLE_LEVELS = 12;'));
  assert.ok(render.includes('const STIPPLE_SPACING = 2;'));
  assert.ok(render.includes('const STIPPLE_RADIUS_GAMMA = .68;'));
  assert.ok(render.includes('const STIPPLE_GRAIN_RATIO = .2;'));
  assert.ok(render.includes('const jitter = (1 - .75 * edge) * (1 - .3 * quantized);'));
  assert.ok(render.includes('Math.abs(l - belowLuma)) / .15,'));
  assert.ok(render.includes('const localMean = (l + left + right + above + belowLuma) * .2;'));
  assert.ok(render.includes('const level = Math.round(tone * STIPPLE_LEVELS);'));
  assert.ok(render.includes('const quantized = level / STIPPLE_LEVELS;'));
  assert.ok(render.includes('const reference = mean * .65 + localMean * .35;'));
  assert.ok(render.includes('const stretched = clamp(.5 + (l - reference) * 3, 0, 1);'));
  assert.ok(render.includes('grid.dotR[count] = grainR;'));
  assert.ok(render.includes('grid.dotR[count] = grid.radii[level];'));
  assert.ok(render.includes('grid.jitterX[i] * cellW * jitter'));
  assert.ok(render.includes('grid.error[i + 1] += diffusion * 7 / 16'));
  assert.ok(render.includes('grid.error[below] += diffusion * 5 / 16'));
  assert.ok(render.includes('const dotScale = Math.min(scaleX, scaleY);'));
  assert.ok(render.includes('if (screenX + r < 0 || screenX - r > viewWidth || y + r < 0 || y - r > viewHeight) continue;'));
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
  assert.ok(render.includes('drawRawVideoWindows(c, result.blobs, viewWidth, viewHeight, offsetX, source, applied, filter)'));
});

test('Inverter e Preto e branco pintam só os blobs sobre o fundo próprio', async () => {
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes("if (state.effect === 'dither' || state.effect === 'invert')"));
  assert.ok(render.includes("fallbackContext.filter = state.effect === 'threshold' ? 'grayscale(1)' : 'none';"));
  assert.ok(render.includes("const styled = (state.effect === 'invert' || state.effect === 'threshold') && result.blobs?.length > 0;"));
  assert.ok(render.includes("const filter = state.effect === 'invert' ? 'invert(1)' : 'grayscale(1) contrast(6)';"));
  assert.ok(render.includes('forcedFilter = null'));
  assert.ok(render.includes('const forced = forcedFilter ? `${forcedFilter}${invertPart}` : null;'));
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

test('Coer?ncia Janela viva/V?deo original/Inverter v?deo; Pontilhado n?o usa janela de v?deo', async () => {
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(render.includes('const showOriginal = state.showOriginalVideo;'));
  assert.ok(render.includes('const enableEffect = showOriginal || state.videoBlend > 0;'));
  assert.ok(render.includes('if (state.videoWindows && !dotted && !styled) {'));
  assert.ok(render.includes('Com Pontilhado ligado o v'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('Janela viva ligada: ON mostra a c?mera reconhec?vel'));
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

test('band rhythm comes from blob motion and is cut when disabled', async () => {
  const processor = await readFile(new URL('../src/audio-processor.js', import.meta.url), 'utf8');
  assert.ok(processor.includes('trackBlobMotion(signals)'));
  assert.ok(processor.includes('scheduleBlobRhythm(signals, energy, speed, density)'));
  assert.ok(processor.includes('if (this.bandMode) {'));
  assert.ok(processor.includes('this.blobMotionSeen = false;'));
  assert.ok(processor.includes('if (this.rhythmEnabled && this.rhythmEnvelope > .0005)'));
  assert.ok(processor.includes("Gota d'água"));
  assert.ok(processor.includes('this.rhythmDropAge += 1 / sampleRate'));
  assert.ok(processor.includes('this.rhythmDropFrequency = dropFrequency'));
  assert.ok(processor.includes('this.rhythmEnvelope * .26 * this.rhythmVelocity'));
  assert.ok(processor.includes('const bandGain = this.rhythmEnabled ? 0 : (.3 + .7 * this.sensitivity) * .5;'));
  assert.ok(processor.includes("if (typeof options.rhythmEnabled === 'boolean' && options.rhythmEnabled !== this.rhythmEnabled)"));
  assert.ok(processor.includes('// Troca de regime: nada do som anterior pode ecoar junto com o novo.'));
  assert.ok(!processor.includes('(this.bandMode ? .45 : 1)'));
  assert.ok(!processor.includes('(this.bandMode ? .34 : .26)'));
});

test('efeitos have a real room, stereo chorus, fades and pruned buffers', async () => {
  const processor = await readFile(new URL('../src/audio-processor.js', import.meta.url), 'utf8');
  assert.ok(processor.includes('const FX_FADE_UP = 1 - Math.exp(-1 / (sampleRate * .04));'));
  assert.ok(processor.includes('const FX_FADE_DOWN = 1 - Math.exp(-1 / (sampleRate * .08));'));
  assert.ok(processor.includes('const FX_CHORUS_RATE = .6;'));
  assert.ok(processor.includes('this.spaceDelayA = Math.floor(sampleRate * .072);'));
  assert.ok(processor.includes('this.spaceDelayC = Math.floor(sampleRate * .167);'));
  assert.ok(processor.includes('const mixNorm = 1 / Math.max(1, (mix.echo + mix.space + mix.chorus) * .5);'));
  assert.ok(processor.includes('let chorusL = 0, chorusR = 0;'));
  assert.ok(processor.includes('if (mix.chorus > .0001) {'));
  assert.ok(processor.includes("// Só o Eco realimenta: o Espaço é um quarto, não um segundo eco."));
  assert.ok(!processor.includes('.029)'));
  assert.ok(!processor.includes('const space = this.delayBuffer[spaceA] + this.delayBuffer[spaceB] + this.delayBuffer[spaceC];'));
});

test('blob signals are delivered in the same frame with the AudioContext clock', () => {
  const queueIndex = app.indexOf('audioBus.queueSignals({ type:\'signals\'');
  const flushIndex = app.indexOf('audioBus.flushSignals();');
  assert.ok(queueIndex > 0);
  assert.ok(flushIndex > queueIndex);
  assert.ok(app.includes('capturedAt:now, audioTime'));
  assert.ok(app.includes('bandMode:true'));
  assert.ok(app.includes("cacheVersion: 'blobtrack-celular-00-v99'"));
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

test('Tela cheia tem um botão discreto de gravar/parar/salvar fora do piano', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(html.includes('class="stage-record-footer" id="recordFooterButton"'));
  assert.ok(html.includes('id="recordFooterIcon"'));
  assert.ok(html.includes('id="recordFooterLabel"'));
  assert.ok(html.includes('id="recordFooterTime"'));
  assert.ok(css.includes('.stage-record-footer {'));
  assert.ok(css.includes('right:10px;bottom:calc(8px + var(--safe-bottom));'));
  assert.ok(css.includes('body.fullscreen-active .stage-record-footer:not([hidden]),'));
  assert.ok(css.includes('html:fullscreen body:not(.gear-vr) .stage-record-footer:not([hidden])'));
  assert.ok(css.includes('body.gear-vr .stage-record-footer { display:none!important }'));
  assert.ok(app.includes('const readyToSave = !recording && Boolean(pendingRecording);'));
  assert.ok(app.includes("$('recordFooterLabel').textContent = readyToSave ? 'Salvar' : recording ? 'Parar' : 'Gravar';"));
  assert.ok(app.includes('function toggleFooterRecording()'));
  assert.ok(app.includes("$('recordFooterButton').addEventListener('click', toggleFooterRecording);"));
});

test('Tela cheia comum segue o giro do celular; só Gear VR trava em paisagem', async () => {
  const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('async function exitFullscreen(){'));
  assert.ok(app.includes('try{ screen.orientation?.unlock?.(); }catch{}'));
  assert.ok(app.includes("async function enterFullscreen(orientation=null){"));
  assert.ok(app.includes('if(orientation && screen.orientation?.lock) screen.orientation.lock(orientation).catch(()=>{});'));
  assert.ok(app.includes("if(persist)enterFullscreen('landscape');"));
  assert.ok(!app.includes("enterFullscreen('portrait')"));
  assert.ok(!app.includes("function enterFullscreen(orientation='portrait')"));
  assert.ok(css.includes('@media (orientation:landscape) {'));
  assert.ok(css.includes('@media (orientation:landscape) and (max-height:520px) {'));
  assert.ok(css.includes('  .stage-record-footer { right:calc(min(320px,26vw) + 22px) }'));
});

test('recorte tem véu fora da gravação, limpeza, cantos arrastáveis e número no painel', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
  const render = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  const roi = await readFile(new URL('../src/core/roiMask.js', import.meta.url), 'utf8');
  assert.ok(html.includes('<canvas id="roiVeil" aria-hidden="true"></canvas>'));
  assert.ok(html.includes('id="clearRectanglesButton"'));
  assert.match(html, /id="roiVeilButton"[^>]*aria-pressed="true"/);
  assert.ok(html.includes('id="roiReadout"'));
  assert.ok(html.includes('id="roiHint"'));
  assert.ok(css.includes('.stage canvas#roiVeil { position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;pointer-events:none }'));
  assert.ok(app.includes("import { createRoiMask, roiHandleAt, resizeRoiRect } from './core/roiMask.js';"));
  assert.ok(app.includes('resizeRect: null, showRoiVeil: true'));
  assert.ok(app.includes("if (typeof saved.showRoiVeil === 'boolean') state.showRoiVeil = saved.showRoiVeil;"));
  assert.ok(app.includes('showRoiVeil:state.showRoiVeil}));'));
  assert.ok(app.includes("$('clearRectanglesButton').addEventListener('click'"));
  assert.ok(app.includes("state.manualRects.length=0;state.dragRect=null;state.resizeRect=null;state.keyboardPoint=null;"));
  assert.ok(app.includes("$('roiVeilButton').addEventListener('click'"));
  assert.ok(app.includes('const handle=roiHandleAt(x,y,state.manualRects,10/bounds.width,10/bounds.height);'));
  assert.ok(app.includes('resizeRoiRect(state.resizeRect.rect,state.resizeRect.corner,x,y);'));
  assert.ok(app.includes('if(!state.drawingRect&&!didResizeRect&&Math.abs(dy)>65'));
  assert.ok(app.includes('const roi = state.manualRects.length && source ? getTrackingRoi(source) : null;'));
  assert.ok(app.includes('roiReadout.textContent = roi'));
  assert.ok(app.includes('render.drawRoiVeil()'));
  assert.ok(render.includes('function drawRoiVeil() {'));
  assert.ok(render.includes("c.globalCompositeOperation = 'destination-out';"));
  assert.ok(!render.includes('drawImage(roiVeilCanvas'));
  assert.ok(roi.includes('export function roiHandleAt('));
  assert.ok(roi.includes('export function resizeRoiRect('));
});

test('guias e distâncias se acomodam em cantos opostos sem mudar o efeito isolado', async () => {
  const source = await readFile(new URL('../src/render/render.js', import.meta.url), 'utf8');
  assert.ok(source.includes('export function placeOverlayLabel('));
  assert.ok(source.includes('const labelOccupied = state.overlay && state.distanceTelemetry ? [] : null;'));
  assert.ok(source.includes('blobViewCount, labelOccupied);'));
  assert.ok(source.includes('placeOverlayLabel(c, label, candidates, occupied)'));
  assert.equal(source.split('placeOverlayLabel(c, label, candidates, labelOccupied)').length - 1, 2);
  assert.ok(source.includes('if (labelOccupied) c.restore();'));
  assert.ok(app.includes("cacheVersion: 'blobtrack-celular-00-v99'"));
});
