import { BlobTracker } from './blob-tracker.js';
import { deviceProfile as createDeviceProfile } from './core/deviceProfile.js';
import { updateQualityBudgets } from './core/qualityController.js';
import { clamp, fmt, formatRecordingTime, recordingFileName, hasRecordingStorageHeadroom } from './core/utils.js';
import { createSessionLock } from './session/sessionLock.js';
import { createWakeLock } from './platform/wakeLock.js';
import { createAudio, createAudioBus } from './audio/audio.js';
import { createRender } from './render/render.js';
import { createRecorder } from './recorder.js';
import { drawRecordingFrame, recordingCanvasSize, RECORDING_WATERMARK } from './recording-canvas.js';
import { exportRecording, shareToInstagramStory } from './recording-export.js';
import { clearVideoComposition } from './video-crop.js';
import { loadPreferences } from './preferences.js';
import { createScaleRouter } from './audio/scale-router.js';
import { createRoiMask, roiHandleAt, resizeRoiRect } from './core/roiMask.js';
import { attachScalesUI } from './ui/scales-ui.js';
import { strings as defaultStrings } from './ui/i18n/pt-BR.js';
import { createNavigation } from './ui/navigation.js';
const $ = (id) => document.getElementById(id);
const saved = loadPreferences();
const savedLocale = ['pt-BR','es','en','fr'].includes(saved.locale) ? saved.locale : 'pt-BR';
let locale = 'pt-BR';
let strings = defaultStrings;
let localeApi = null;
let translateText = value => String(value ?? '');
const getLocaleIndexUrl = () => './ui/i18n/index.js';
function translateSubtree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    const translated = translateText(root.nodeValue, locale);
    if (translated !== root.nodeValue) root.nodeValue = translated;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    const translated = translateText(textNode.nodeValue, locale);
    if (translated !== textNode.nodeValue) textNode.nodeValue = translated;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    for (const name of ['aria-label','title']) {
      if (root.hasAttribute(name)) {
        const translated = translateText(root.getAttribute(name), locale);
        if (translated !== root.getAttribute(name)) root.setAttribute(name, translated);
      }
    }
  }
}
function applyLocale(nextLocale = locale) {
  locale = ['pt-BR','es','en','fr'].includes(nextLocale) ? nextLocale : 'pt-BR';
  strings = localeApi?.getStrings(locale) || defaultStrings;
  document.documentElement.lang = locale;
  document.title = strings.app.title;
  document.querySelector('meta[name=description]')?.setAttribute('content', strings.app.description);
  translateSubtree(document.body);
  const localeLabel = $('localeLabel');
  if (localeLabel) localeLabel.textContent = strings.ui.language;
  const invite = $('creditLink');
  if (invite) { invite.querySelector('.credit-link-label').textContent = strings.credit.link; invite.setAttribute('aria-label', strings.credit.aria); }
  document.querySelectorAll('[data-locale-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.localeChoice === locale)));
}
const LOCALE_OBSERVER_OPTIONS = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label','title'] };
const localeObserver = new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'characterData') translateSubtree(record.target);
    else for (const node of record.addedNodes) translateSubtree(node);
    if (record.type === 'attributes' && ['aria-label','title'].includes(record.attributeName)) {
      const element = record.target;
      const translated = translateText(element.getAttribute(record.attributeName), locale);
      if (translated !== element.getAttribute(record.attributeName)) element.setAttribute(record.attributeName, translated);
    }
  }
});
function suspendLocaleObserver() { localeObserver.disconnect(); }
function resumeLocaleObserver() { localeObserver.observe(document.body, LOCALE_OBSERVER_OPTIONS); }
localeObserver.observe(document.body, LOCALE_OBSERVER_OPTIONS);
applyLocale();
async function activateLocale(nextLocale, persist = false) {
  if (nextLocale === 'pt-BR') {
    translateText = localeApi?.translateText || (value => String(value ?? ''));
    applyLocale('pt-BR');
  } else {
    try {
      localeApi ||= await import(getLocaleIndexUrl());
      translateText = localeApi.translateText;
      applyLocale(nextLocale);
    } catch {
      localeApi = null;
      translateText = value => String(value ?? '');
      applyLocale('pt-BR');
    }
  }
  if (persist) savePreferences();
}
document.querySelectorAll('[data-locale-choice]').forEach(button => button.addEventListener('click', () => {
  void activateLocale(button.dataset.localeChoice, true);
}));
if (savedLocale !== 'pt-BR') void activateLocale(savedLocale);
const deviceProfile = createDeviceProfile();
const audioScaleRouter = createScaleRouter();
const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandaloneApp = navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
const video = $('camera'), canvas = $('visual'), analysisCanvas = $('analysis');
const overlayCanvas = $('overlay');
const stage = $('stage');
const stageViewport = { width: 0, height: 0 };
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance', desynchronized: true });
const fallbackContext = gl ? null : canvas.getContext('2d', { alpha: false });
const overlayContext = overlayCanvas.getContext('2d', { desynchronized: true });
const roiVeilCanvas = $('roiVeil');
const roiVeilContext = roiVeilCanvas.getContext('2d');
const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
const frameCanvas = document.createElement('canvas');
const frameContext = frameCanvas.getContext('2d', { alpha: false });
const recordingCanvas = document.createElement('canvas');
const recordingContext = recordingCanvas.getContext('2d', { alpha: false });
Object.defineProperties(frameCanvas, { videoWidth: { get: () => frameCanvas.width }, videoHeight: { get: () => frameCanvas.height } });
const state = {
  active: false, starting: false, claiming: false, sessionReserved: false, switching: false, camera: 'environment', cameraIds: { user: null, environment: null }, stream: null, audio: null, audioHandlersRegistered: false, worklet: null, audioGain: null,
  effect: 'invert', flip: false, overlay: true, showMask: false, gearVr: false, reacting: true, muted: false, cameraRecovering: false,
  videoWindows: true, trailEffect: false, waveEffect: false, meshEffect: false, networkEffect: false, distanceTelemetry: false, maxConnectionDistance: 0.22, visualOnly: false, maxEffects: false, minEffects: false, showOriginalVideo: true, extremeMode: false, videoBlend: 0, invertBlend: false,
  threshold: .18, minBlobAreaRatio: 0.00025, maxBlobs: 12, trackingWidth: deviceProfile.startWidth, autoQuality: true, master: 1, bias: 0, background: null, priorCentroid: null,
  performance: { analysisAverage: 0, renderAverage: 0, slowFrames: 0, fastFrames: 0, fpsAverage: 0, lastFrameAt: 0, limitFrames: 0, limitShown: false, effectsPaused: false, pauseReason: '', pauseCount: 0 },
  lowLightNoticeShown: false,
  lastFrame: 0, lastSignalsAt: 0, lastHudAt: 0, lastSignal: null, lastAccessibleCount: -1, lastAccessibleAt: 0, keyboardPoint: null, sessionBlocked: false, drawingRect: false, manualRects: [], dragRect: null, resizeRect: null, showRoiVeil: true,
  displayTracks: new Map(),
  envelopes: { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: Array(6).fill(0) },
  audioEnabled: true, audioSensitivity: 1, audioOscillation: .4, audioPitchRange: 2, audioKey: 0, audioTimbre: 0, rhythmEnabled: true,
  audioEffects: { echo: false, space: false, chorus: false },
  gains: { exposure: .35, grow: .60, threshold: .12, dither: .20, speed: 60 },
  timing: { camera: null, capture: null, tracking: null, analysis: null, render: null, cycle: null, bus: null, composition: null, windows: null, overlay: null },
  focusMode: false,
};
const idEventSeconds = new Int32Array(61).fill(-1);
const idEventCounts = new Uint16Array(61);
let lastIssuedBlobId = 0, lastMetricsPublishedAt = 0;
const recorder = createRecorder({
  canvas: recordingCanvas,
  fps: deviceProfile.fps,
});
let recordingSnapshot = { state: 'idle', durationMs: 0, bytes: 0, result: null };
let pendingRecording = null;
let themeChoice = ['system','dark','light'].includes(saved.theme) ? saved.theme : 'system';
let reduceMotion = saved.reduceMotion === true;
let hapticsEnabled = saved.hapticsEnabled === true;
if (typeof saved.reacting === 'boolean') state.reacting = saved.reacting;
if (typeof saved.effect === 'string' && ['invert','threshold','dither'].includes(saved.effect)) state.effect = saved.effect;
if (Number.isFinite(saved.master)) state.master = clamp(saved.master,0,2);
if (Number.isFinite(saved.bias)) state.bias = clamp(saved.bias,-1,1);
if (Number.isFinite(saved.threshold)) state.threshold = clamp(saved.threshold,0.02,0.60);
if (Number.isFinite(saved.minBlobAreaRatio)) state.minBlobAreaRatio = clamp(saved.minBlobAreaRatio, 0.00025, 0.006);
if (Number.isFinite(saved.maxBlobs)) state.maxBlobs = clamp(Math.round(saved.maxBlobs), 4, 12);
if (Number.isFinite(saved.trackingWidth)) state.trackingWidth = clamp(saved.trackingWidth,160,deviceProfile.maxWidth);
if (typeof saved.audioEnabled === 'boolean') state.audioEnabled = saved.audioEnabled;
if (Number.isFinite(saved.audioSensitivity)) state.audioSensitivity = clamp(saved.audioSensitivity,0,3);
if (typeof saved.showRoiVeil === 'boolean') state.showRoiVeil = saved.showRoiVeil;
if (typeof saved.videoWindows === 'boolean') state.videoWindows = saved.videoWindows;
if (typeof saved.trailEffect === 'boolean') state.trailEffect = saved.trailEffect;
if (typeof saved.waveEffect === 'boolean') state.waveEffect = saved.waveEffect;
if (typeof saved.meshEffect === 'boolean') state.meshEffect = saved.meshEffect;
if (typeof saved.networkEffect === 'boolean') state.networkEffect = saved.networkEffect;
if (typeof saved.distanceTelemetry === 'boolean') state.distanceTelemetry = saved.distanceTelemetry;
if (Number.isFinite(saved.maxConnectionDistance)) state.maxConnectionDistance = clamp(saved.maxConnectionDistance,0.08,0.5);
if (typeof saved.visualOnly === 'boolean') state.visualOnly = saved.visualOnly;
if (typeof saved.maxEffects === 'boolean') state.maxEffects = saved.maxEffects;
if (typeof saved.minEffects === 'boolean') state.minEffects = saved.minEffects;
// Migração B: "Vídeo original" passa a significar base reconhecível da câmera.
// Pref antiga showOriginalVideo (true=efeito aplicado, false=vídeo cru) vira showOriginalVideo.
if (typeof saved.showOriginalVideo === 'boolean') state.showOriginalVideo = saved.showOriginalVideo;
else if (typeof saved.showOriginalVideo === 'boolean') state.showOriginalVideo = true;
if (Number.isFinite(saved.videoBlend)) state.videoBlend = clamp(saved.videoBlend, 0, 1);
if (typeof saved.invertBlend === 'boolean') state.invertBlend = saved.invertBlend;
if (typeof saved.extremeMode === 'boolean') state.extremeMode = saved.extremeMode;
if (typeof saved.gearVr === 'boolean') state.gearVr = saved.gearVr;
if (Number.isFinite(saved.audioOscillation)) state.audioOscillation = clamp(saved.audioOscillation,0,1);
if (Number.isFinite(saved.audioPitchRange)) state.audioPitchRange = clamp(saved.audioPitchRange,0,7);
if (Number.isFinite(saved.audioKey)) state.audioKey = clamp(saved.audioKey,0,11);
if (Number.isFinite(saved.audioTimbre)) state.audioTimbre = clamp(saved.audioTimbre,0,2);
if (typeof saved.rhythmEnabled === 'boolean') state.rhythmEnabled = saved.rhythmEnabled;
if (saved.audioEffects && typeof saved.audioEffects === 'object') {
  for (const key of ['echo','space','chorus']) if (typeof saved.audioEffects[key] === 'boolean') state.audioEffects[key] = saved.audioEffects[key];
}
if (typeof saved.focusMode === 'boolean') state.focusMode = saved.focusMode;
let forceFallback = false;
if (state.extremeMode) {
  state.videoWindows = false; state.trailEffect = false; state.waveEffect = false;
  state.meshEffect = false; state.networkEffect = false; state.distanceTelemetry = false;
  state.maxEffects = false; state.minEffects = false;
  setTrackingWidth(120);
  forceFallback = true;
}
let toastTimer = null, installPrompt = null, glProgram = null, texture = null, posBuffer = null, uniforms = null;
const maskCanvas = document.createElement('canvas');
const maskContext = maskCanvas.getContext('2d');
let maskImage = null, maskView = null;
const tracker = new BlobTracker({ calibrateFrames: 8, stationaryAbsorbFrames: 8 });
tracker.minAreaRatio = Math.max(0.00025, state.minBlobAreaRatio || 0.00025);
if (tracker.setMaxBlobs) tracker.setMaxBlobs(state.maxBlobs || 12);

const TRAIL_SLOTS = 12, TRAIL_POINTS = 18;
const trailIds = new Int32Array(TRAIL_SLOTS).fill(-1);
const trailPoints = new Float32Array(TRAIL_SLOTS * TRAIL_POINTS * 2);
const trailCursor = new Uint8Array(TRAIL_SLOTS), trailLength = new Uint8Array(TRAIL_SLOTS);
const trailAge = new Uint8Array(TRAIL_SLOTS), trailSpeed = new Float32Array(TRAIL_SLOTS);
const trailSeen = new Uint8Array(TRAIL_SLOTS), mapPointA = new Float32Array(2), mapPointB = new Float32Array(2);
const cropRect = new Float32Array(4), gridPoint = new Float32Array(2), blobViewPoints = new Float32Array(TRAIL_SLOTS * 2);

const tabId = Math.random().toString(36).slice(2);
// One tab owns capture and audio. An existing active session answers the probe.
const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('blobtrack-celular-00-session') : null;
if (channel) {
  let replied = false;
  channel.onmessage = ({ data }) => {
    if (data?.type === 'probe' && (state.active || state.starting || state.sessionReserved)) channel.postMessage({ type: 'active', id: tabId });
    if (data?.type === 'claim' && state.claiming && data.id < tabId) state.sessionBlocked = true;
    if (data?.type === 'active' && !state.active) { replied = true; state.sessionBlocked = true; showToast('BlobTrack Celular-00 já está aberto em outra aba'); log('Sessão ativa em outra aba.'); }
    if (data?.type === 'start' && data.id !== tabId) { if (state.sessionReserved && tabId < data.id) return; if (state.claiming && tabId < data.id) return; state.sessionBlocked = true; if(state.active||state.starting) stopSession(); showToast('BlobTrack Celular-00 já está aberto em outra aba'); }
    if (data?.type === 'stop' && data.id !== tabId) { state.sessionBlocked = false; ['startButton','startButton2'].forEach(id=>{const b=$(id); if(b) b.disabled=false;}); }
  };
  channel.postMessage({ type: 'probe' });
  setTimeout(() => { if (!replied && !state.sessionBlocked) channel.postMessage({ type: 'ready', id: tabId }); }, 180);
}

const sessionLock = createSessionLock({ state, channel, tabId });
const wakeLockService = createWakeLock({
  navigatorObject: navigator,
  documentObject: document,
  isActive: () => state.active,
  onError: error => log('Tela: Wake Lock indisponível (' + error.message + ')'),
});
function log(message) { $('logLine').textContent = message; }
function showToast(message) { const el = $('toast'); el.textContent = translateText(message,locale); el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function announceStatus(message) { $('appStatus').textContent = translateText(message,locale); }
function setStatus(text, on = false) { $('statusText').textContent = translateText(text,locale); $('statusLight').parentElement.classList.toggle('on', on); announceStatus(text); }
function showCameraIssue(error) {
  const message = error?.name === 'NotAllowedError' ? strings.errors.permission : error?.name === 'NotFoundError' ? strings.errors.missing : error?.name === 'NotReadableError' ? strings.errors.busy : error?.name === 'SecurityError' ? strings.errors.insecure : strings.errors.generic;
  $('cameraIssueTitle').textContent = error?.name === 'SecurityError' ? 'Conexão segura necessária' : error?.name === 'NotAllowedError' ? 'Acesso à câmera bloqueado' : error?.name === 'NotFoundError' ? 'Câmera não encontrada' : error?.name === 'NotReadableError' ? 'Câmera indisponível' : 'Não foi possível iniciar';
  $('cameraIssueText').textContent = message; if(!$('permissionDialog').open)$('permissionDialog').showModal(); announceStatus(message);
}
function toggle(button, on) { button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); }
function savePreferences() { try { localStorage.setItem('blobtrack-celular-00-preferences',JSON.stringify({locale,reacting:state.reacting,effect:state.effect,master:state.master,bias:state.bias,threshold:state.threshold,minBlobAreaRatio:state.minBlobAreaRatio,maxBlobs:state.maxBlobs,trackingWidth:state.trackingWidth,autoQuality:state.autoQuality,focusMode:document.body.classList.contains('focus-mode'),audioEnabled:state.audioEnabled,audioSensitivity:state.audioSensitivity,gearVr:state.gearVr,audioOscillation:state.audioOscillation,audioPitchRange:state.audioPitchRange,audioKey:state.audioKey,audioTimbre:state.audioTimbre,rhythmEnabled:state.rhythmEnabled,audioEffects:state.audioEffects,videoWindows:state.videoWindows,trailEffect:state.trailEffect,waveEffect:state.waveEffect,meshEffect:state.meshEffect,networkEffect:state.networkEffect,distanceTelemetry:state.distanceTelemetry,maxConnectionDistance:state.maxConnectionDistance,visualOnly:state.visualOnly,maxEffects:state.maxEffects,minEffects:state.minEffects,showOriginalVideo:state.showOriginalVideo,videoBlend:state.videoBlend,invertBlend:state.invertBlend,theme:themeChoice,reduceMotion,hapticsEnabled,showRoiVeil:state.showRoiVeil})); } catch {} }
const audioBus = createAudioBus({ getPort: () => state.worklet?.port });
let preferencesSaveTimer = null;
function scheduleSavePreferences(delay = 300) {
  clearTimeout(preferencesSaveTimer);
  preferencesSaveTimer = setTimeout(() => {
    preferencesSaveTimer = null;
    savePreferences();
  }, delay);
}
function flushPendingPreferences() {
  if (preferencesSaveTimer === null) return;
  clearTimeout(preferencesSaveTimer);
  preferencesSaveTimer = null;
  savePreferences();
}
function soundOptions() { return {oscillation:state.audioOscillation,pitchRange:state.audioPitchRange,key:state.audioKey,timbre:state.audioTimbre,rhythmEnabled:state.rhythmEnabled,bandMode:true,soundEffects:state.audioEffects}; }
function postAudioScale(scale) { state.worklet?.port.postMessage({type:'scale',id:scale.id,degrees:scale.degrees}); }
function sendAudioOptions(debounce = false) { if(debounce) audioBus.scheduleOptions(soundOptions(),80); else audioBus.sendOptions(soundOptions()); if(!debounce && audioScaleRouter.hasStoredChoice()) postAudioScale(audioScaleRouter.getScale()); }
const scalesUi = attachScalesUI({ root:$('audioScales'), router:audioScaleRouter, onSelect:postAudioScale, getAudioContext:()=>state.audio, getKey:()=>state.audioKey, isAudible:()=>state.audioEnabled&&!state.muted&&state.reacting&&state.master>0 });

const audioService = createAudio({
  state,
  log,
  showToast,
  sendAudioOptions,
  fmt,
  onMeter: (peak, voices, cost) => {
    $('audioReadout').textContent = 'WebAudio · ' + fmt(peak, 3) + ' pico · ' + voices + ' vozes · ' + fmt(cost, 2) + ' ms';
  },
});
const { makeAudio, connectRecordingAudio, disconnectRecordingAudio, ensureAudioAlive, watchAudio, handleAudioInterruption } = audioService;

const glState = { program: null, texture: null, uniforms: null };
const render = createRender({
  state,
  canvas,
  overlayCanvas,
  stageViewport,
  gl,
  glState,
  fallbackContext,
  overlayContext,
  roiVeilCanvas,
  roiVeilContext,
  video,
  maskCanvas,
  maskContext,
  maskImage: null,
  maskView: null,
  cropRect,
  gridPoint,
  mapPointA,
  mapPointB,
  blobViewPoints,
  TRAIL_SLOTS,
  TRAIL_POINTS,
  trailIds,
  trailPoints,
  trailCursor,
  trailLength,
  trailAge,
  trailSpeed,
  trailSeen,
  recordingContext,
  recordingCanvas,
  recordingSnapshot,

  recordingCanvasSize,
  drawRecordingFrame,
  recordingWatermark: RECORDING_WATERMARK,
  resize,
  forceFallback: () => forceFallback,
  log,
  showToast,
  onMeter: null,
  sendAudioOptions,
  fmt,
});

toggle($('reactButton'),state.reacting);
toggle($('audioSensitivityButton'),state.audioEnabled);
$('audioSensitivity').value=String(state.audioSensitivity);$('audioSensitivityValue').textContent=fmt(state.audioSensitivity);
$('audioOscillation').value=String(state.audioOscillation);$('audioOscillationValue').textContent=`${Math.round(state.audioOscillation*100)}%`;
$('audioPitchRange').value=String(state.audioPitchRange);$('audioPitchRangeValue').textContent=`${fmt(state.audioPitchRange,1)} semitons`;
$('audioKey').value=String(state.audioKey);
const audioKeyButtons=[...document.querySelectorAll('[data-audio-key]')];
function syncAudioKey(){
  const active=String(state.audioKey);
  for(const button of audioKeyButtons){
    const on=button.dataset.audioKey===active;
    button.classList.toggle('active',on);
    button.setAttribute('aria-pressed',on?'true':'false');
  }
}
syncAudioKey();
$('audioTimbre').value=String(state.audioTimbre);
toggle($('audioEchoButton'),state.audioEffects.echo);
toggle($('audioSpaceButton'),state.audioEffects.space);
toggle($('audioChorusButton'),state.audioEffects.chorus);
toggle($('audioRhythmButton'),state.rhythmEnabled);
toggle($('blobWindowButton'),state.videoWindows);
toggle($('trailEffectButton'),state.trailEffect);
toggle($('waveEffectButton'),state.waveEffect);
toggle($('meshEffectButton'),state.meshEffect);
toggle($('blobNetworkButton'),state.networkEffect);
toggle($('distanceTelemetryButton'),state.distanceTelemetry);
toggle($('originalVideoButton'),state.showOriginalVideo);
toggle($('maxEffectsButton'),state.maxEffects);
toggle($('minEffectsButton'),state.minEffects);
toggle($('extremeModeButton'),state.extremeMode);
$('maxConnectionDistance').value=String(state.maxConnectionDistance);$('maxConnectionDistanceValue').textContent=`${Math.round(state.maxConnectionDistance*100)}%`;
toggle($('visualOnlyButton'),state.visualOnly);
toggle($('roiVeilButton'),state.showRoiVeil);
$('motionThreshold').value=String(state.threshold);
$('trackingWidth').max=String(deviceProfile.maxWidth);$('trackingWidth').value=String(state.trackingWidth);syncTrackingUi();syncWindowControlCoherence();
$('master').value=String(state.master);$('masterValue').textContent=fmt(state.master);
$('bias').value=String(state.bias);$('biasValue').textContent=fmt(state.bias);
document.querySelectorAll('[data-effect]').forEach(b=>toggle(b,b.dataset.effect===state.effect));

const vertexSource = `#version 300 es
in vec2 aPosition; out vec2 vUv;
void main(){ vUv=(aPosition+1.0)*0.5; gl_Position=vec4(aPosition,0.0,1.0); }`;
const fragmentSource = `#version 300 es
precision highp float; uniform sampler2D uTexture; uniform int uEffect; uniform float uThreshold; uniform float uBias; uniform float uExposure; uniform float uGrowth; uniform float uSpeed; uniform float uTime; uniform float uImageAspect; uniform float uViewportAspect; uniform bool uFlip; uniform bool uMirror; uniform bool uFit; in vec2 vUv; out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 uv=vUv;if(uFit){if(uImageAspect>uViewportAspect){float contentHeight=uViewportAspect/uImageAspect;if(abs(vUv.y-.5)>contentHeight*.5){outColor=vec4(0.0,0.0,0.0,1.0);return;}uv.y=(vUv.y-.5)/contentHeight+.5;}else{float contentWidth=uImageAspect/uViewportAspect;if(abs(vUv.x-.5)>contentWidth*.5){outColor=vec4(0.0,0.0,0.0,1.0);return;}uv.x=(vUv.x-.5)/contentWidth+.5;}}else if(uImageAspect>uViewportAspect)uv.x=(uv.x-.5)*(uViewportAspect/uImageAspect)+.5;else uv.y=(uv.y-.5)*(uImageAspect/uViewportAspect)+.5;if(uMirror!=uFlip)uv.x=1.0-uv.x;vec4 c=texture(uTexture,uv);float l=dot(c.rgb,vec3(.299,.587,.114));float w=clamp(uExposure*.22+uGrowth*.16,0.0,.45);vec3 rgb=clamp(c.rgb*(1.0+w),0.0,1.0);if(uEffect==0){rgb=vec3(0.0);}else if(uEffect==1){rgb=vec3(dot(rgb,vec3(.299,.587,.114)));}else if(uEffect==2){rgb=vec3(0.0);}float pulse=1.0+0.012*sin(uTime*min(8.0,1.0+uSpeed*.02));outColor=vec4(clamp(rgb*pulse,0.0,1.0),1.0);}`;
function shader(type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function initRenderer() {
  if (!gl) { $('renderInfo').textContent = fallbackContext ? 'Canvas 2D · modo leve' : 'Renderização indisponível'; return Boolean(fallbackContext); }
  try {
    glProgram = gl.createProgram(); gl.attachShader(glProgram, shader(gl.VERTEX_SHADER, vertexSource)); gl.attachShader(glProgram, shader(gl.FRAGMENT_SHADER, fragmentSource)); gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProgram));
    uniforms = Object.fromEntries(['uTexture','uEffect','uThreshold','uBias','uExposure','uGrowth','uSpeed','uTime','uImageAspect','uViewportAspect','uMirror','uFlip','uFit'].map(name => [name, gl.getUniformLocation(glProgram, name)]));
    gl.useProgram(glProgram); posBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(glProgram, 'aPosition'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    glState.program = glProgram; glState.texture = texture; glState.uniforms = uniforms;
    $('renderInfo').textContent = 'WebGL2 ativo'; return true;
  } catch (e) { log(`Renderizador: ${e.message}`); showToast(fallbackContext ? 'WebGL indisponível · usando modo leve' : 'Renderização indisponível'); $('renderInfo').textContent = fallbackContext ? 'Canvas 2D · modo leve' : 'WebGL2 indisponível'; return Boolean(fallbackContext); }
}
initRenderer();

function cameraScore(label,facing){const name=(label||'').toLocaleLowerCase();const front=/front|user|frontal|selfie|frente/.test(name),rear=/back|rear|environment|traseir|principal|facing back/.test(name);if(facing==='user')return front?100:rear?-100:0;if(front)return-100;let score=rear?20:0;if(/main|primary|principal|wide|camera 0|camera2 0/.test(name))score+=12;if(/ultra|tele|macro|zoom/.test(name))score-=100;return score;}
async function refreshCameraChoices(){if(!navigator.mediaDevices?.enumerateDevices)return;try{const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');for(const facing of ['user','environment']){const pick=devices.map(device=>({device,score:cameraScore(device.label,facing)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)[0];if(pick)state.cameraIds[facing]=pick.device.deviceId;}}catch{}}
async function startCamera() {
  if (state.sessionBlocked) { releaseSession(); showToast('BlobTrack Celular-00 já está aberto em outra aba'); return; }
  if (state.active || state.starting) { log('startCamera: já ativo ou iniciando'); return; }
  if (!window.isSecureContext) { log('Contexto não seguro detectado · tentando mesmo assim (WebView Android).'); }
  if (!navigator.mediaDevices?.getUserMedia) { log('getUserMedia não disponível.'); showCameraIssue({name:'NotFoundError'}); releaseSession(); return; }
  state.starting = true; setStatus('Aguardando câmera'); log('Aguardando permissão da câmera no navegador.'); channel?.postMessage({ type: 'start', id: tabId });
  try {
    log(`startCamera: getUserMedia com constraints=${JSON.stringify({width:{ideal:deviceProfile.captureWidth},height:{ideal:Math.round(deviceProfile.captureWidth*9/16)},frameRate:{ideal:deviceProfile.fps,max:30}})}`);
    const videoConstraints={width:{ideal:deviceProfile.captureWidth},height:{ideal:Math.round(deviceProfile.captureWidth*9/16)},frameRate:{ideal:deviceProfile.fps,max:30}}; const preferred=state.cameraIds[state.camera]; if(preferred)videoConstraints.deviceId={exact:preferred};else videoConstraints.facingMode=state.camera; let stream; try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoConstraints});}catch(err){log(`startCamera: getUserMedia falhou com preferred=${!!preferred}: ${err.name} ${err.message}`);if(!preferred)throw err;state.cameraIds[state.camera]=null;delete videoConstraints.deviceId;videoConstraints.facingMode=state.camera;stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoConstraints});}
    state.stream = stream; video.srcObject = stream;
    log('startCamera: aguardando vídeo carregar');
    const videoReady = new Promise((resolve, reject) => {
      if (video.readyState >= 2) { resolve(video); return; }
      video.addEventListener('loadedmetadata', () => { log('startCamera: loadedmetadata'); resolve(video); }, { once: true });
      video.addEventListener('error', (ev) => reject(ev.error || new Error('video error')), { once: true });
      setTimeout(() => reject(new Error('video timeout')), 10000);
    });
    try { await videoReady; } catch (e) { log(`Vídeo não carregou: ${e.message}`); throw e; }
    log('startCamera: chamando video.play()');
    try { await video.play(); log('startCamera: video.play() OK'); } catch (e) { await new Promise(r => setTimeout(r, 250)); try { await video.play(); log('startCamera: video.play() retry OK'); } catch (e2) { log(`video.play falhou: ${e2.message}`); throw e2; } }
    const tracks = stream.getVideoTracks(); if (!tracks.length) { log('startCamera: sem tracks de vídeo'); throw new Error('Câmera não forneceu faixa de vídeo.'); }
    const track = tracks[0];
    log(`startCamera: ${tracks.length} track(s) de vídeo encontrada(s), readyState=${track.readyState}`);
    resize();
    state.active = true; document.body.classList.add('session-active'); suspendLocaleObserver(); state.starting = false; state.switching = false;
    void wakeLockService.acquire();
    $('stageMessage').hidden = true; if($('permissionDialog').open)$('permissionDialog').close(); $('stagePill').hidden = false; $('switchCamera').disabled = false; $('stopButton').hidden = false; $('startButton2').hidden = true; $('shareButton').hidden = false; setStatus('Sessão ativa', true);
    $('cameraLabel').textContent = state.camera==='environment'?'Traseira principal':'Frontal'; refreshCameraChoices();
    track.addEventListener('ended', () => {
      if (!state.active || state.switching) return;
      log('Câmera desconectada; tentando reconectar.');
      showToast('Câmera desconectada · reconectando');
      recoverCameraStream().catch(error => {
        log(`Câmera: reconexão falhou (${error.message})`);
        showToast('Não foi possível reconectar a câmera');
      });
    }, { once: true });
    updateExposureCapability(track); tracker.reset(); resetDisplayTracks(); state.priorCentroid = null;
    handleAudioInterruption();
    log('Câmera ativa. O processamento acompanha o movimento da sala.');
    updateRecordingControls(recordingSnapshot);
    requestAnimationFrame(frame); watchAudio();
  } catch (e) { state.starting = false; state.switching = false; await stopMedia(); $('stageMessage').hidden = false; $('stagePill').hidden = true; $('stopButton').hidden = true; $('startButton2').hidden = false; $('switchCamera').disabled = true; $('exposureButton').disabled = true; channel?.postMessage({type:'stop',id:tabId}); releaseSession(); setStatus('Câmera indisponível'); log(`Câmera: ${e.name === 'NotAllowedError' ? 'permissão negada.' : e.message}`); showCameraIssue(e); }
}
async function recoverCameraStream() {
  if (state.cameraRecovering || state.switching) return;
  state.cameraRecovering = true;
  try { await stopMedia(); await startCamera(); }
  finally { state.cameraRecovering = false; }
}
async function stopMedia() { state.active = false; document.body.classList.remove('session-active'); resumeLocaleObserver(); updateRecordingControls(recordingSnapshot); clearVideoComposition({ gl, fallbackContext, overlayContext, width:canvas.width, height:canvas.height }); state.stream?.getTracks().forEach(t => t.stop()); state.stream = null; if (video.srcObject) video.srcObject = null; tracker.reset(); resetDisplayTracks(); }
function releaseSession() { sessionLock.release(); }
async function stopSession() { await wakeLockService.release(); if(recordingSnapshot.state!=='idle')await stopRecording(); await stopMedia(); state.starting = false; state.switching = false; $('stageMessage').hidden = false; $('stagePill').hidden = true; $('stopButton').hidden = true; $('startButton2').hidden = false; $('shareButton').hidden = true; $('switchCamera').disabled = true; $('exposureButton').disabled = true; $('cameraLabel').textContent = 'Câmera aguardando'; setStatus('Sessão encerrada'); if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(0,t,.12);} releaseSession(); if(state.audio)setTimeout(()=>{if(!state.active)state.audio.suspend().catch(()=>{});},180); }
async function switchCamera() { if (!state.active || state.switching) return; state.switching = true; state.camera = state.camera === 'environment' ? 'user' : 'environment'; await stopMedia(); await startCamera(); }
function updateExposureCapability(track) { const caps = track.getCapabilities?.() || {}; const ok = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual'); $('exposureButton').disabled = !ok; $('exposureHint').textContent = ok ? 'A câmera aceita exposição manual.' : 'Exposição manual não suportada por esta câmera.'; }
// Blindagem: retoma câmera/vídeo quando a aba volta ao primeiro plano (iOS suspende o stream).
let hiddenRecordingTimer = null, recordingPausedForVisibility = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushPendingPreferences();
    void wakeLockService.release();
    if (recordingSnapshot.state === 'recording') {
      clearTimeout(hiddenRecordingTimer);
      hiddenRecordingTimer = setTimeout(() => {
        hiddenRecordingTimer = null;
        if (document.visibilityState !== 'hidden' || recordingSnapshot.state !== 'recording') return;
        try {
          if (!recorder.pause()) throw new Error('A gravação não pôde ser pausada.');
          recordingPausedForVisibility = true;
        } catch (error) {
          log(`Gravação: pausa em segundo plano falhou (${error.message})`);
          showToast('Gravação encerrada ao ir para segundo plano');
          void stopRecording();
        }
      }, 5000);
    }
    return;
  }
  if (document.visibilityState !== 'visible') return;
  clearTimeout(hiddenRecordingTimer);
  hiddenRecordingTimer = null;
  if (recordingPausedForVisibility && recordingSnapshot.state === 'paused') {
    recordingPausedForVisibility = false;
    try {
      if (!recorder.resume()) throw new Error('A gravação não pôde ser retomada.');
    } catch (error) {
      log(`Gravação: retomada falhou (${error.message})`);
      showToast('Gravação encerrada ao voltar');
      void stopRecording();
    }
  }
  if (state.active) {
    void wakeLockService.acquire();
    const track = state.stream?.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') { recoverCameraStream().catch(() => {}); return; }
    if (video.readyState < 2) video.play().catch(() => {});
    ensureAudioAlive();
  }
});
async function setManualExposure() { const track = state.stream?.getVideoTracks()[0]; if (!track) return; const caps = track.getCapabilities?.() || {}; if (!Array.isArray(caps.exposureMode) || !caps.exposureMode.includes('manual')) return; try { const settings = track.getSettings?.() || {}; const range = caps.exposureTime; const current = settings.exposureTime ?? range?.min; await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: clamp(current, range?.min ?? 0, range?.max ?? 1) }] }); showToast('Exposição manual aplicada'); } catch (e) { log(`Exposição: ${e.message}`); } }

function resize() {
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  stageViewport.width = rect.width;
  stageViewport.height = rect.height;
  const ratio = Math.min(devicePixelRatio || 1, deviceProfile.pixelRatio, 1.5); const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (overlayCanvas.width !== w || overlayCanvas.height !== h) { overlayCanvas.width = w; overlayCanvas.height = h; }
  if (roiVeilCanvas.width !== w || roiVeilCanvas.height !== h) { roiVeilCanvas.width = w; roiVeilCanvas.height = h; }
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}
new ResizeObserver(resize).observe(canvas);
window.addEventListener('orientationchange', () => requestAnimationFrame(resize), { passive: true });

// One immutable camera snapshot feeds tracking, the main render and raw blob windows.
function captureVideoFrame() {
  const started = performance.now();
  const scale = Math.min(1, deviceProfile.captureWidth / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  if (frameCanvas.width !== width || frameCanvas.height !== height) {
    frameCanvas.width = width; frameCanvas.height = height;
  }
  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  state.timing.capture = performance.now() - started;
  return frameCanvas;
}

let roiCache = { rects: null, rectCount: -1, width: 0, height: 0, sourceWidth: 0, sourceHeight: 0, viewWidth: 0, viewHeight: 0, camera: '', flip: false, gearVr: false, mask: null };
function getTrackingRoi(source) {
  if (!state.manualRects.length) return null;
  const width = Math.max(1, Math.min(Math.round(state.trackingWidth) || 320, source.videoWidth));
  const height = Math.max(1, Math.round(width * source.videoHeight / source.videoWidth));
  const viewWidth = stageViewport.width / (state.gearVr ? 2 : 1);
  const viewHeight = stageViewport.height;
  if (roiCache.mask && roiCache.rects === state.manualRects && roiCache.rectCount === state.manualRects.length
    && roiCache.width === width && roiCache.height === height && roiCache.sourceWidth === source.videoWidth
    && roiCache.sourceHeight === source.videoHeight && roiCache.viewWidth === viewWidth && roiCache.viewHeight === viewHeight
    && roiCache.camera === state.camera && roiCache.flip === state.flip && roiCache.gearVr === state.gearVr) return roiCache.mask;
  const mask = createRoiMask({
    width, height, sourceWidth: source.videoWidth, sourceHeight: source.videoHeight,
    viewWidth, viewHeight, rects: state.manualRects,
    mirror: state.camera === 'user', flip: state.flip, gearVr: state.gearVr,
  }) || new Uint8Array(width * height);
  roiCache = { rects: state.manualRects, rectCount: state.manualRects.length, width, height,
    sourceWidth: source.videoWidth, sourceHeight: source.videoHeight, viewWidth, viewHeight,
    camera: state.camera, flip: state.flip, gearVr: state.gearVr, mask };
  return mask;
}

const DISPLAY_SMOOTH_TAU = 0.08; // suaviza??o de apresenta??o: est?vel sem atrasar ?udio/sinais
const DISPLAY_HOLD_FRAMES = 3; // segura trilha visual por poucos frames ausentes (apresenta??o apenas)
function resetDisplayTracks() { state.displayTracks.clear(); }
function smoothBlobsForDisplay(blobs, dt) {
  const safeDt = Math.max(0.001, dt);
  const alpha = 1 - Math.exp(-safeDt / DISPLAY_SMOOTH_TAU);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const id = b.id;
    seen.add(id);
    const prev = state.displayTracks.get(id);
    if (!prev) {
      const s = { x: b.x, y: b.y, left: b.left, top: b.top, right: b.right, bottom: b.bottom, area: b.area, vx: 0, vy: 0, miss: 0 };
      state.displayTracks.set(id, s);
      out.push(b);
      continue;
    }
    const dx = b.x - prev.x, dy = b.y - prev.y;
    prev.vx = prev.vx * 0.6 + (dx / safeDt) * 0.4;
    prev.vy = prev.vy * 0.6 + (dy / safeDt) * 0.4;
    prev.x += dx * alpha;
    prev.y += dy * alpha;
    prev.left += (b.left - prev.left) * alpha;
    prev.top += (b.top - prev.top) * alpha;
    prev.right += (b.right - prev.right) * alpha;
    prev.bottom += (b.bottom - prev.bottom) * alpha;
    prev.area += (b.area - prev.area) * alpha;
    prev.miss = 0;
    out.push({ ...b, x: prev.x, y: prev.y, left: prev.left, top: prev.top, right: prev.right, bottom: prev.bottom, area: prev.area });
  }
  for (const [id, prev] of state.displayTracks.entries()) {
    if (seen.has(id)) continue;
    prev.miss = (prev.miss || 0) + 1;
    if (prev.miss > DISPLAY_HOLD_FRAMES) { state.displayTracks.delete(id); continue; }
    const pdx = (prev.vx || 0) * safeDt;
    const pdy = (prev.vy || 0) * safeDt;
    prev.x = clamp(prev.x + pdx, 0, 1);
    prev.y = clamp(prev.y + pdy, 0, 1);
    prev.left = clamp(prev.left + pdx, 0, 1);
    prev.top = clamp(prev.top + pdy, 0, 1);
    prev.right = clamp(prev.right + pdx, 0, 1);
    prev.bottom = clamp(prev.bottom + pdy, 0, 1);
    out.push({ id, x: prev.x, y: prev.y, left: prev.left, top: prev.top, right: prev.right, bottom: prev.bottom, area: prev.area, held: true });
  }
  return out;
}
function analyze(source = video) {
  if (!source?.videoWidth || !source?.videoHeight) return null;
  const t0 = performance.now();
  const dt = state.lastSignalsAt ? Math.max(0.001, (t0 - state.lastSignalsAt) / 1000) : 1 / deviceProfile.fps;
  state.lastSignalsAt = t0;
  // Pacote 2: um único readback por quadro alimenta o tracker e o Pointillism.
  const width = Math.max(1, Math.min(Math.round(state.trackingWidth) || 320, source.videoWidth));
  const height = Math.max(1, Math.round(width * source.videoHeight / source.videoWidth));
  if (analysisCanvas.width !== width || analysisCanvas.height !== height) {
    analysisCanvas.width = width;
    analysisCanvas.height = height;
  }
  // Cópia GPU→CPU: drawImage + getImageData.
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const result = tracker.updatePixels(pixels, width, height, state.threshold, dt, getTrackingRoi(source));
  if (!result) return null;
  state.timing.tracking = performance.now() - t0;
  state.timing.analysis = state.timing.tracking;
  state.timing.camera = null;
  return { ...result, dt, pixels, pixelWidth: width, pixelHeight: height };
}
function followEnvelope(current, target, dt, attack=.06, decay=.45) { const tau = target > current ? attack : decay; return current + (target - current) * (1 - Math.exp(-dt / tau)); }
function updateSignals(raw, dt, blobs = [], now = performance.now()) {
  const e = state.envelopes;
  for (const key of ['energy','density','speed','coherence','ambient']) e[key] = followEnvelope(e[key], raw[key], dt);
  for (let i = 0; i < e.zones.length; i++) e.zones[i] = followEnvelope(e.zones[i],raw.zones[i],dt,.06,.9);
  const m = state.reacting ? state.master : 0;
  const applied = { exposure:m*state.gains.exposure*e.energy, grow:m*state.gains.grow*(.6*e.density+.4*e.speed), threshold:m*state.gains.threshold*e.coherence, dither:m*state.gains.dither*e.speed, speed:m*state.gains.speed*e.energy };
  state.lastSignal = { ...e, applied };
  const t0 = performance.now();
  // Sem porta, com som desligado, mudo ou no modo "Só visual", não há por que montar o payload.
  if (state.audioEnabled && !state.muted && !state.visualOnly && typeof state.worklet?.port?.postMessage === 'function') {
    const audioTime = Number.isFinite(state.audio?.currentTime) ? state.audio.currentTime : null;
    audioBus.queueSignals({ type:'signals', signals:{...e,zones:[...e.zones],blobs:blobs.map(blob=>({id:blob.id,x:blob.x,y:blob.y,size:blob.area,speed:blob.speed}))}, master:m, muted:state.muted, sensitivity:state.audioSensitivity, audioEnabled:state.audioEnabled&&!state.visualOnly, capturedAt:now, audioTime, frameTime: now });
    audioBus.flushSignals();
  }
  state.timing.bus = performance.now() - t0;
  return applied;
}
let hudCache = null;
function updateHud(raw, applied, result, source = null) {
  const now = performance.now();
  if (now - state.lastHudAt < 100) return;
  state.lastHudAt = now;
  if (!hudCache) {
    hudCache = {
      zones: Array.from(document.querySelectorAll('.zone'), el => ({ el, value: el.querySelector('b'), percent: -1, background: '' })),
      elements: {},
    };
    for (const k of ['energy','density','speed','coherence','ambient']) hudCache.elements[k] = { label: document.getElementById('signal-'+k), bar: document.getElementById('bar-'+k) };
  }
  for(const k of ['energy','density','speed','coherence','ambient']){const el=hudCache.elements[k];el.label.textContent=`${Math.round(state.envelopes[k]*100)}%`;el.bar.style.width=`${state.envelopes[k]*100}%`;};
  hudCache.zones.forEach((zone,i)=>{
    const v=state.envelopes.zones[i],percent=Math.round(v*100);
    const background=`linear-gradient(90deg,#15372d ${Math.min(100,v*100)}%,#141a23 ${Math.min(100,v*100)}%)`;
    if (zone.percent===percent && zone.background===background) return;
    if (zone.percent!==percent) {
      zone.percent=percent;
      if (zone.value) zone.value.textContent=`${percent}%`;
      zone.el.setAttribute('aria-label',`Zona ${i+1}: ${percent}%`);
    }
    zone.background=background;
    zone.el.style.background=background;
  });
  const sr=$('statusReadout'); if(sr) sr.textContent=`${Math.round(state.envelopes.energy*100)}% energia · ${Math.round(state.envelopes.density*100)}% dens`;
  const ms=x=>Number.isFinite(x)?x.toFixed(1):'—'; $('timeReadout').textContent=`${ms(state.timing.tracking)} · ${ms(state.timing.cycle)} ms`;
  $('windowCostReadout').textContent=state.videoWindows?`${ms(state.timing.windows)} ms · ${result.blobs.length} recortes`:'Desligada';
  const roi = state.manualRects.length && source ? getTrackingRoi(source) : null;
  let inside = 0;
  if (roi) {
    for (const blob of result.blobs) {
      const bx = Math.min(result.width - 1, Math.max(0, Math.floor(blob.x * result.width)));
      const by = Math.min(result.height - 1, Math.max(0, Math.floor(blob.y * result.height)));
      if (roi[by * result.width + bx]) inside++;
    }
  }
  const roiReadout = $('roiReadout');
  if (roiReadout) roiReadout.textContent = roi
    ? `${Math.round(100 * roi.reduce((sum, value) => sum + value, 0) / roi.length)}% · ${inside}/${result.blobs.length} blobs`
    : '—';
  $('frameInfo').textContent=`${result.width}×${result.height} · fps ${Math.round(1/Math.max(result.dt,.001))}`;
  if($('blobReadout')) $('blobReadout').textContent = roi ? `${inside}/${result.blobs.length} blobs` : `${result.blobs.length} blobs`;
  if (now - state.lastAccessibleAt >= 1500 && result.blobs.length !== state.lastAccessibleCount) {
    state.lastAccessibleAt = now;
    state.lastAccessibleCount = result.blobs.length;
    const count = result.blobs.length;
    $('visualSummary').textContent = count === 1 ? 'Uma região de movimento detectada.' : `${count} regiões de movimento detectadas.`;
  }
}
const DEVICE_LIMIT_FRAMES = 8;
const DEVICE_LIMIT_NOTICE = 'Aparelho no limite · efeitos mantidos';
function updateReactiveEffectQuality(now) {
  const perf = state.performance, elapsed = perf.lastFrameAt ? now - perf.lastFrameAt : 0;
  perf.lastFrameAt = now;
  const fps = elapsed > 0 ? 1000 / elapsed : deviceProfile.fps;
  perf.fpsAverage = perf.fpsAverage ? perf.fpsAverage * .88 + fps * .12 : fps;
  // Reatividade intocável: o limite só liga um aviso discreto, nunca pausa efeitos.
  const limitBelow = Math.max(12, deviceProfile.fps * 0.55);
  perf.limitFrames = perf.fpsAverage < limitBelow ? perf.limitFrames + 1 : 0;
  const atLimit = perf.limitFrames >= DEVICE_LIMIT_FRAMES;
  if (atLimit !== perf.limitShown) {
    perf.limitShown = atLimit;
    const notice = $('deviceLimitNotice');
    notice.hidden = !atLimit;
    if (atLimit) notice.textContent = translateText(DEVICE_LIMIT_NOTICE, locale);
  }
}
function publishBlobTrackMetrics(now, result) {
  const second = Math.floor(now / 1000);
  for (const blob of result.blobs) {
    if (blob.id <= lastIssuedBlobId) continue;
    const slot = second % idEventCounts.length;
    if (idEventSeconds[slot] !== second) {
      idEventSeconds[slot] = second;
      idEventCounts[slot] = 0;
    }
    idEventCounts[slot]++;
    lastIssuedBlobId = blob.id;
  }
  if (now - lastMetricsPublishedAt < 250) return;
  lastMetricsPublishedAt = now;
  let idsNewLast60s = 0;
  for (let slot = 0; slot < idEventCounts.length; slot++) {
    const age = second - idEventSeconds[slot];
    if (age >= 0 && age < 60) idsNewLast60s += idEventCounts[slot];
  }
  window.__blobtrackMetrics = {
    cacheVersion: 'blobtrack-celular-00-v103',
    fps: state.performance.fpsAverage,
    tAnalysis: state.performance.analysisAverage,
    tRender: state.performance.renderAverage,
    tCapture: state.timing.capture,
    tOverlay: state.timing.overlay,
    tComposition: state.timing.composition,
    blobsAtivos: result.blobs.length,
    idsNovosUltimos60s: idsNewLast60s,
    recordingState: recordingSnapshot.state,
    effectsPaused: state.performance.effectsPaused,
    deviceLimit: state.performance.limitShown,
    pauseReason: state.performance.pauseReason,
    pauseCount: state.performance.pauseCount,
    tPorEfeito: null,
  };
}
let frameErrors = 0;
function frame(now) {
  if (!state.active) return;
  try {
    const interval = 1000 / deviceProfile.fps;
    if (video.readyState >= 2 && now - state.lastFrame >= interval) {
      state.lastFrame = now;
      try {
        const source = captureVideoFrame();
        const result = analyze(source);
        if (result) {
          if (result.raw.lowLight && !state.lowLightNoticeShown) {
            state.lowLightNoticeShown = true;
            showToast('Pouca luz: o rastreio pode ficar instável.');
          } else if (!result.raw.lowLight) state.lowLightNoticeShown = false;
          if (result.raw.sceneShift) { showToast('Cena mudou — refaça o fundo'); resetDisplayTracks(); }
          const rawBlobs = result.blobs;
          const applied = updateSignals(result.raw, result.dt, rawBlobs, now);
          result.blobs = smoothBlobsForDisplay(rawBlobs, result.dt);
          const renderStarted = performance.now();
          render.renderFrame(applied, source);
          render.drawMaskOverlay(result, source, applied);
          render.drawRecordingComposite();
          state.timing.render = performance.now() - renderStarted;
          updateHud(result.raw, applied, result, source);
          const perf = state.performance;
          const next = updateQualityBudgets(perf, state.timing.analysis, state.timing.render, interval, state.trackingWidth, deviceProfile.maxWidth);
          perf.analysisAverage = next.analysisAverage;
          perf.renderAverage = next.renderAverage;
          perf.slowFrames = next.slowFrames;
          perf.fastFrames = next.fastFrames;
          if (state.autoQuality && next.trackingWidth !== state.trackingWidth) setTrackingWidth(next.trackingWidth);
          updateReactiveEffectQuality(now);
          publishBlobTrackMetrics(now, result);
        }
      } catch (e) { if (++frameErrors % 30 === 1) log(`Ciclo: ${e.message}`); }
    }
    requestAnimationFrame(frame);
  } catch (e) {
    frameErrors++;
    if (frameErrors <= 5) log(`Ciclo: ${e.message}`);
    // Blindagem: mesmo com erro no agendamento, tenta continuar; se persistir, encerra com aviso.
    if (frameErrors < 120) requestAnimationFrame(frame);
    else { showToast('Sessão encerrada por erro repetido'); log(`Ciclo interrompido: ${e.message}`); stopSession(); }
  }
}

function updateRecordingControls(snapshot) {
  const previousState = recordingSnapshot.state;
  Object.assign(recordingSnapshot, snapshot);
  if (previousState !== 'idle' && snapshot.state === 'idle') {
    document.body.classList.remove('recording-active');
    disconnectRecordingAudio();
    if (recordingOwnsFocusMode) {
      recordingOwnsFocusMode = false;
      setFocusMode(false);
    }
    if (snapshot.result) {
      pendingRecording = snapshot.result;
      const duration = formatRecordingTime(snapshot.result.durationMs);
      const size = (snapshot.result.bytes / (1024 * 1024)).toFixed(1);
      if (snapshot.result.reason === 'max-duration') showToast(`Limite de 5 min · gravado ${duration} · ${size} MB`);
      else if (snapshot.result.reason === 'max-bytes') showToast(`Limite de tamanho · gravado ${duration} · ${size} MB`);
      else if (snapshot.result.reason === 'memory-limit') showToast(`Memória alta · gravação encerrada em ${duration}`);
      else showToast(`Gravado · ${duration} · ${size} MB · use Salvar`);
    }
  }
  const supported = recorder.isSupported();
  const recording = ['recording', 'paused', 'stopping'].includes(snapshot.state);
  const saving = snapshot.state === 'saving';
  const label = saving ? 'Salvando gravação' : snapshot.state === 'stopping' ? 'Finalizando gravação' : recording ? 'Parar gravação' : 'Iniciar gravação';
  const title = !supported ? 'Gravação não suportada neste navegador.'
    : !recording && !state.active ? 'Inicie a sessão para gravar o palco.'
      : label;
  const disabled = !supported || (!recording && !state.active) || snapshot.state === 'stopping' || saving;
  for (const id of ['recordButton', 'recordButtonPanel']) {
    const button = $(id);
    button.hidden = !supported;
    button.disabled = disabled;
    button.title = title;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(recording));
    button.classList.toggle('recording', snapshot.state === 'recording');
    button.classList.toggle('paused', snapshot.state === 'paused');
  }
  const icon = $('recordButton').querySelector('.record-button-icon');
  icon.textContent = recording ? '●' : '○';
  const time = formatRecordingTime(snapshot.durationMs);
  $('recordButtonTime').textContent = time;
  $('recordButtonTime').hidden = !recording;
  $('recordButtonPanel').textContent = recording ? label : 'Gravar vídeo';

  // Botão único da base em tela cheia: um controle para as três ações.
  const footer = $('recordFooterButton');
  const readyToSave = !recording && Boolean(pendingRecording);
  footer.hidden = !supported;
  footer.disabled = disabled;
  footer.title = readyToSave ? 'Salvar ou compartilhar gravação' : title;
  footer.setAttribute('aria-label', readyToSave ? 'Salvar ou compartilhar gravação' : label);
  footer.setAttribute('aria-pressed', String(recording));
  $('recordFooterIcon').textContent = readyToSave ? '↓' : recording ? '●' : '○';
  $('recordFooterLabel').textContent = readyToSave ? 'Salvar' : recording ? 'Parar' : 'Gravar';
  $('recordFooterTime').textContent = time;
  $('recordFooterTime').hidden = !recording;

  const indicator = $('recordIndicator');
  indicator.hidden = !recording;
  indicator.classList.toggle('paused', snapshot.state === 'paused');
  indicator.setAttribute('aria-label', label);
  indicator.setAttribute('aria-pressed', String(recording));
  indicator.title = label;
  $('recordIndicatorLabel').textContent = snapshot.state === 'paused' ? 'PAUSADO' : snapshot.state === 'stopping' ? 'FINALIZANDO' : 'REC';
  $('recordIndicatorTime').textContent = time;

  const sessionNames={idle:pendingRecording?'Gravação pronta':'Pronta para começar',recording:'Gravando',paused:'Gravação pausada',stopping:'Finalizando gravação',saving:'Salvando gravação'};
  $('sessionCard').dataset.state=snapshot.state; $('sessionStateText').textContent=sessionNames[snapshot.state]||sessionNames.idle;
  $('sessionDuration').textContent=recording?'Duração: '+formatRecordingTime(snapshot.durationMs):pendingRecording?'Pronta para salvar · '+formatRecordingTime(pendingRecording.durationMs):'Nenhuma gravação em andamento.';
  $('sessionRecordButton').hidden=recording||saving; $('sessionRecordButton').disabled=!recording&&!state.active||saving;
  $('sessionPauseButton').hidden=!['recording','paused'].includes(snapshot.state); $('sessionPauseButton').textContent=snapshot.state==='paused'?'Retomar gravação':'Pausar gravação';
  $('sessionStopButton').hidden=!recording; $('sessionSaveButton').hidden=!pendingRecording;
  $('quickRecordButton').textContent=recording?'Parar gravação':'Gravar'; $('quickPauseButton').hidden=!['recording','paused'].includes(snapshot.state); $('quickPauseButton').textContent=snapshot.state==='paused'?'Retomar gravação':'Pausar gravação'; $('quickSaveButton').hidden=!pendingRecording;
  const hasResult = Boolean(pendingRecording);
  $('recordSaveButton').hidden = !hasResult;
  $('recordSaveButtonPanel').hidden = !hasResult;
  $('instagramShareButton').hidden = !hasResult;
  $('recordSaveButton').disabled = saving;
  $('recordSaveButtonPanel').disabled = saving;
}
function releasePendingRecording() {
  if (pendingRecording?.url) URL.revokeObjectURL(pendingRecording.url);
  pendingRecording = null;
}
async function savePendingRecording() {
  if (!pendingRecording || recordingSnapshot.state === 'saving') return;
  const result = pendingRecording;
  const filename = recordingFileName(result);
  updateRecordingControls({ ...recordingSnapshot, state: 'saving', result: null });
  try {
    const method = await exportRecording(result, {
      filename,
      onError: (operation, error) => log(`Gravação: ${operation} falhou (${error.message}); tentando alternativa.`),
    });
    if (method === 'shared' || method === 'saved' || method === 'downloaded') {
      pendingRecording = null;
      if (result.url) URL.revokeObjectURL(result.url);
      recorder.releaseResult();
      if (method === 'shared') showToast('Gravação compartilhada');
      else if (method === 'saved') showToast('Gravação salva no local escolhido (cartão SD, se selecionado)');
      else showToast('Download da gravação iniciado');
    } else showToast('Salvamento cancelado');
  } catch (error) {
    log(`Gravação: falha ao salvar (${error.message})`);
    showToast('Não foi possível salvar a gravação');
  } finally {
    updateRecordingControls({ ...recordingSnapshot, state: 'idle', result: null });
  }
}
async function startRecording() {
  if (!state.active) { showToast('Inicie a sessão antes de gravar'); return; }
  if (recordingSnapshot.state === 'stopping') { showToast('Gravação já está sendo finalizada'); return; }
  if (!recorder.isSupported()) { showToast('Gravação não suportada neste navegador'); return; }
  if (!recordingContext) { showToast('Composição de gravação indisponível neste navegador'); return; }
  navigation.navigate('stage');
  if (!focusMode) {
    recordingOwnsFocusMode = true;
    setFocusMode(true);
  }
  document.body.classList.add('recording-active');
  if (!await hasRecordingStorageHeadroom(navigator.storage)) {
    document.body.classList.remove('recording-active');
    if (recordingOwnsFocusMode) { recordingOwnsFocusMode = false; setFocusMode(false); }
    showToast('Espaço livre abaixo de 100 MB; libere espaço antes de gravar.');
    return;
  }
  resize();
  if (!canvas.width || !canvas.height) {
    document.body.classList.remove('recording-active');
    if (recordingOwnsFocusMode) { recordingOwnsFocusMode = false; setFocusMode(false); }
    showToast('Palco indisponível para gravação');
    return;
  }
  const size = recordingCanvasSize(canvas.width, canvas.height, state.maxEffects ? Math.round(deviceProfile.captureWidth * 0.65) : deviceProfile.captureWidth);
  recordingCanvas.width = size.width;
  recordingCanvas.height = size.height;
  render.drawRecordingComposite(true);
  const audioDestination = connectRecordingAudio();
  try {
    const recordInfo = recorder.start({ audioStream: audioDestination?.stream, videoBitsPerSecond: deviceProfile.recordingBitrate });
    releasePendingRecording();
    updateRecordingControls(recordingSnapshot);
    showToast(`Gravando ${recordInfo.extension.toUpperCase()} · ${recordingCanvas.width}×${recordingCanvas.height} · ${recordInfo.includesAudio ? 'com áudio do app' : 'sem áudio'} · até 5 min · ${recordInfo.extension === 'mp4' ? 'MP4 compatível Android' : 'WebM · escolha MP4 nas configurações se disponível'}`);
  } catch (error) {
    disconnectRecordingAudio(audioDestination);
    document.body.classList.remove('recording-active');
    if (recordingOwnsFocusMode) { recordingOwnsFocusMode = false; setFocusMode(false); }
    log(`Gravação: ${error.message}`);
    showToast(`Não foi possível iniciar a gravação: ${error.message}`);
  }
}
async function stopRecording() {
  if (recordingSnapshot.state === 'idle' || recordingSnapshot.state === 'stopping') return;
  try { await recorder.stop('user'); }
  catch (error) {
    log(`Gravação: ${error.message}`);
    showToast('A gravação foi encerrada com erro');
  }
}
async function toggleRecording() {
  if (recordingSnapshot.state === 'saving') return;
  if (recordingSnapshot.state === 'idle') await startRecording();
  else await stopRecording();
}
recorder.onState(updateRecordingControls);
recorder.onError(error => {
  log(`Gravação: ${error.message}`);
  showToast('Erro durante a gravação');
});
['recordButton', 'recordButtonPanel', 'recordIndicator'].forEach(id => $(id).addEventListener('click', toggleRecording));
$('sessionRecordButton').addEventListener('click',()=>$('recordButton').click());
$('sessionStopButton').addEventListener('click',()=>$('recordButton').click());
$('sessionSaveButton').addEventListener('click',()=>$('recordSaveButtonPanel').click());$('quickSaveButton').addEventListener('click',()=>$('recordSaveButtonPanel').click());
function toggleRecordingPause(){const changed=recordingSnapshot.state==='recording'?recorder.pause():recordingSnapshot.state==='paused'?recorder.resume():false;if(!changed)showToast('Pausa indisponível neste estado.');}
$('sessionPauseButton').addEventListener('click',toggleRecordingPause);$('quickPauseButton').addEventListener('click',toggleRecordingPause);
['recordSaveButton', 'recordSaveButtonPanel'].forEach(id => $(id).addEventListener('click', savePendingRecording));
function toggleFooterRecording(){
  if (recordingSnapshot.state === 'saving' || recordingSnapshot.state === 'stopping') return;
  if (pendingRecording && !['recording', 'paused'].includes(recordingSnapshot.state)) { void savePendingRecording(); return; }
  void toggleRecording();
}
$('recordFooterButton').addEventListener('click', toggleFooterRecording);
$('instagramShareButton').addEventListener('click', async () => {
  if (!pendingRecording || recordingSnapshot.state === 'saving') return;
  const result = pendingRecording;
  updateRecordingControls({ ...recordingSnapshot, state: 'saving', result: null });
  try {
    await shareToInstagramStory(result);
    pendingRecording = null;
    if (result.url) URL.revokeObjectURL(result.url);
    recorder.releaseResult();
    showToast('Compartilhado no Instagram Stories');
  } catch (error) {
    log(`Gravação: falha ao compartilhar no Instagram (${error.message})`);
    showToast('Não foi possível compartilhar no Instagram');
  } finally {
    updateRecordingControls({ ...recordingSnapshot, state: 'idle', result: null });
  }
});
function resetStartButtons(){['startButton','startButton2'].forEach(id=>{const b=$(id);if(b)b.disabled=false;});}
async function beginSession(button){
  if(state.active||state.starting){log('beginSession: já ativo ou iniciando');return;}
  if(button)button.disabled=true;
  log('beginSession: adquirindo sessionLock');
  const reserved=await sessionLock.acquire();
  log(`beginSession: sessionLock resultado=${reserved}`);
  if(!reserved){resetStartButtons();state.sessionBlocked=true;showToast('BlobTrack Celular-00 já está aberto em outra aba');log('beginSession: lock não adquirido');return;}
  resetStartButtons();
  log('beginSession: iniciando áudio');
  const audioPromise=makeAudio();
  try { if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(()=>{}); } catch {}
  await audioPromise; if(state.audio?.state==='suspended') await state.audio.resume().catch(()=>{});
  if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.audioEnabled&&!state.muted?1:0,t,.12);}
  log('beginSession: iniciando câmera');
  await startCamera();
}
$('startButton').addEventListener('click',e=>beginSession(e.currentTarget));
$('startButton2').addEventListener('click',e=>beginSession(e.currentTarget));
$('switchCamera').addEventListener('click',switchCamera);$('exposureButton').addEventListener('click',setManualExposure);$('stopButton').addEventListener('click',stopSession);
/* Painel deslizante: alça e gesto de arrasto */
const dock=$('dock');
function setDock(open){dock.classList.toggle('closed',!open);document.body.classList.toggle('dock-open',open);$('dockHandle').setAttribute('aria-expanded',String(open));$('dockPeek').textContent=open?'▾':'▴';$('dockLabel').textContent=open?'Controles':'Ajustes';}
$('dockHandle').addEventListener('click',()=>setDock(dock.classList.contains('closed')));
let dockDragY=null;
$('dockHandle').addEventListener('touchstart',e=>{dockDragY=e.changedTouches[0].clientY;},{passive:true});
$('dockHandle').addEventListener('touchend',e=>{if(dockDragY===null)return;const dy=dockDragY-e.changedTouches[0].clientY;dockDragY=null;if(Math.abs(dy)>30)setDock(dy>0);},{passive:true});

function setGearVr(on, persist=true){
  state.gearVr=on;
  document.body.classList.toggle('gear-vr',on);
  $('gearVrButton').classList.toggle('active',on);
  $('gearVrButton').setAttribute('aria-pressed',String(on));
  $('gearVrExit').hidden=!on;
  if(on){state.showMask=false;toggle($('maskButton'),false);if(persist)enterFullscreen('landscape');showToast('Gear VR ativo · imagem lado a lado');}
  else {if(persist&&isFullscreen())exitFullscreen();showToast('Visualização normal');}
  if(persist)savePreferences();
}
$('gearVrButton').addEventListener('click',()=>setGearVr(!state.gearVr));
$('gearVrExit').addEventListener('click',()=>setGearVr(false));
if(state.gearVr)setGearVr(true,false);

document.querySelectorAll('[data-effect]').forEach(b=>b.addEventListener('click',()=>{if(state.effect===b.dataset.effect)return;state.effect=b.dataset.effect;document.querySelectorAll('[data-effect]').forEach(x=>toggle(x,x===b));savePreferences();}));
function syncWindowControlCoherence(){
  const on = !!state.videoWindows;
  for (const id of ['originalVideoButton','invertBlendButton','videoBlend']) {
    const el = $(id); if(!el) continue;
    el.disabled = !on;
    el.style.opacity = on ? '' : '.45';
  }
}
function bindReactiveToggle(id, key) {
  $(id).addEventListener('click', event => { state[key] = !state[key]; toggle(event.currentTarget, state[key]); syncWindowControlCoherence(); savePreferences(); });
}
bindReactiveToggle('blobWindowButton', 'videoWindows');
bindReactiveToggle('trailEffectButton', 'trailEffect');
bindReactiveToggle('waveEffectButton', 'waveEffect');
bindReactiveToggle('meshEffectButton', 'meshEffect');
bindReactiveToggle('blobNetworkButton', 'networkEffect');
bindReactiveToggle('distanceTelemetryButton', 'distanceTelemetry');
bindReactiveToggle('originalVideoButton', 'showOriginalVideo');
bindReactiveToggle('invertBlendButton', 'invertBlend');
syncWindowControlCoherence();
$('videoBlend').addEventListener('input', event => {
  state.videoBlend = clamp(Number(event.target.value), 0, 1);
  $('videoBlendValue').textContent = `${Math.round(state.videoBlend * 100)}%`;
  scheduleSavePreferences();
});

function setAllEffects(on) {
  state.videoWindows = on;
  state.trailEffect = on;
  state.waveEffect = on;
  state.meshEffect = on;
  state.networkEffect = on;
  state.distanceTelemetry = on;
  toggle($('blobWindowButton'), on);
  toggle($('trailEffectButton'), on);
  toggle($('waveEffectButton'), on);
  toggle($('meshEffectButton'), on);
  toggle($('blobNetworkButton'), on);
  toggle($('distanceTelemetryButton'), on);
  savePreferences();
}
$('maxEffectsButton').addEventListener('click', () => {
  if (state.maxEffects) return;
  state.minEffects = false;
  toggle($('minEffectsButton'), false);
  state.maxEffects = true;
  toggle($('maxEffectsButton'), true);
  setAllEffects(true);
});
$('minEffectsButton').addEventListener('click', () => {
  if (state.minEffects) return;
  state.maxEffects = false;
  toggle($('maxEffectsButton'), false);
  state.minEffects = true;
  toggle($('minEffectsButton'), true);
  setAllEffects(false);
});
$('extremeModeButton').addEventListener('click', () => {
  state.extremeMode = !state.extremeMode;
  toggle($('extremeModeButton'), state.extremeMode);
  if (state.extremeMode) {
    state.videoWindows = false; state.trailEffect = false; state.waveEffect = false;
    state.meshEffect = false; state.networkEffect = false; state.distanceTelemetry = false;
    state.maxEffects = false; state.minEffects = false;
    toggle($('blobWindowButton'), false); toggle($('trailEffectButton'), false);
    toggle($('waveEffectButton'), false); toggle($('meshEffectButton'), false);
    toggle($('blobNetworkButton'), false); toggle($('distanceTelemetryButton'), false);
    toggle($('maxEffectsButton'), false); toggle($('minEffectsButton'), false);
    setTrackingWidth(120);
    forceFallback = true;
    showToast('Modo leve extremo ativado');
  } else {
    forceFallback = false;
    showToast('Modo leve extremo desativado');
  }
  savePreferences();
});
$('maxConnectionDistance').addEventListener('input',event=>{state.maxConnectionDistance=clamp(Number(event.target.value),0.08,0.5);$('maxConnectionDistanceValue').textContent=`${Math.round(state.maxConnectionDistance*100)}%`;scheduleSavePreferences();});
$('visualOnlyButton').addEventListener('click',event=>{state.visualOnly=!state.visualOnly;toggle(event.currentTarget,state.visualOnly);savePreferences();audioBus.queueSignals({type:'signals',signals:{...state.envelopes,zones:[...state.envelopes.zones],blobs:[]},master:state.reacting?state.master:0,muted:state.muted,sensitivity:state.audioSensitivity,audioEnabled:state.audioEnabled&&!state.visualOnly});});
function motionSensitivityLabel(v){
  if(v<=0.1) return 'Muito alta';
  if(v<=0.2) return 'Alta';
  if(v<=0.35) return 'Média';
  if(v<=0.55) return 'Baixa';
  return 'Muito baixa';
}
function trackingDetailLabel(w){
  if(w<=160) return 'Rápido';
  if(w<=240) return 'Equilibrado';
  if(w<=320) return 'Detalhado';
  if(w<=480) return 'Fino';
  return 'Máximo';
}
function minBlobSizeLabel(v){
  if(v<=0.0003) return 'Mínimo';
  if(v<=0.0008) return 'Pequeno';
  if(v<=0.002) return 'Médio';
  if(v<=0.004) return 'Grande';
  return 'Muito grande';
}
function syncTrackingUi(){
  $('motionValue').textContent=`${fmt(state.threshold)} · ${motionSensitivityLabel(state.threshold)}`;
  $('trackingValue').textContent=`${state.trackingWidth} px · ${trackingDetailLabel(state.trackingWidth)}`;
  $('autoQualityButton').classList.toggle('active',state.autoQuality);
  $('autoQualityButton').setAttribute('aria-pressed',String(state.autoQuality));
  $('autoQualityButton').textContent=state.autoQuality?'Automática · '+deviceProfile.name:'Automática desligada';
  if ($('minBlobSize')) {
    $('minBlobSize').value = String(state.minBlobAreaRatio);
    $('minBlobSizeValue').textContent = minBlobSizeLabel(state.minBlobAreaRatio);
  }
  if ($('maxBlobs')) {
    $('maxBlobs').value = String(state.maxBlobs);
    $('maxBlobsValue').textContent = `${state.maxBlobs} blobs`;
  }
}
$('motionThreshold').addEventListener('input',e=>{state.threshold=Number(e.target.value);syncTrackingUi();tracker.reset();resetDisplayTracks();scheduleSavePreferences();});
$('trackingWidth').addEventListener('input',e=>{state.autoQuality=false;setTrackingWidth(Number(e.target.value));syncTrackingUi();});
$('minBlobSize').addEventListener('input',e=>{state.minBlobAreaRatio=clamp(Number(e.target.value),0.00025,0.006);tracker.minAreaRatio=state.minBlobAreaRatio;syncTrackingUi();scheduleSavePreferences();});
$('maxBlobs').addEventListener('input',e=>{state.maxBlobs=clamp(Math.round(Number(e.target.value)),4,12);if(tracker.setMaxBlobs)tracker.setMaxBlobs(state.maxBlobs);tracker.reset();resetDisplayTracks();syncTrackingUi();scheduleSavePreferences();});
$('autoQualityButton').addEventListener('click',()=>{state.autoQuality=!state.autoQuality;state.performance.analysisAverage=0;state.performance.renderAverage=0;state.performance.slowFrames=0;state.performance.fastFrames=0;if(state.autoQuality)setTrackingWidth(deviceProfile.startWidth);syncTrackingUi();savePreferences();});
$('master').addEventListener('input',e=>{state.master=Number(e.target.value);$('masterValue').textContent=fmt(state.master);scheduleSavePreferences();});
$('bias').addEventListener('input',e=>{state.bias=Number(e.target.value);$('biasValue').textContent=fmt(state.bias);scheduleSavePreferences();});

$('reactButton').addEventListener('click',e=>{state.reacting=!state.reacting;toggle(e.currentTarget,state.reacting);savePreferences();});
$('muteButton').addEventListener('click',e=>{state.muted=!state.muted;toggle(e.currentTarget,state.muted);if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.muted?0:1,t,.12);}audioBus.send({type:'mute',muted:state.muted});audioBus.queueSignals({type:'signals',signals:{...state.envelopes,zones:[...state.envelopes.zones],blobs:[]},master:state.reacting?state.master:0,muted:state.muted,sensitivity:state.audioSensitivity,audioEnabled:state.audioEnabled});});
/* ===== Sensibilidade do áudio: liga/desliga + intensidade ===== */
$('audioSensitivityButton').addEventListener('click',e=>{
  state.audioEnabled=!state.audioEnabled;
  toggle(e.currentTarget,state.audioEnabled);
  e.currentTarget.textContent=state.audioEnabled?'Som · ligado':'Som · desligado';
  audioBus.send({type:'audioEnabled',enabled:state.audioEnabled});
  audioBus.queueSignals({type:'signals',signals:{...state.envelopes,zones:[...state.envelopes.zones],blobs:[]},master:state.reacting?state.master:0,muted:state.muted,sensitivity:state.audioSensitivity,audioEnabled:state.audioEnabled});
  if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.audioEnabled&&!state.muted?1:0,t,.12);}
  showToast(state.audioEnabled?'Som reativo ligado':'Som desligado · imagem continua');
  scheduleSavePreferences();
});
$('audioSensitivity').addEventListener('input',e=>{
  state.audioSensitivity=clamp(Number(e.target.value),0,3);
  $('audioSensitivityValue').textContent=fmt(state.audioSensitivity);
  audioBus.scheduleMessage({type:'sensitivity',value:state.audioSensitivity},80);
  scheduleSavePreferences();
});
$('audioOscillation').addEventListener('input',e=>{
  state.audioOscillation=clamp(Number(e.target.value),0,1);
  $('audioOscillationValue').textContent=`${Math.round(state.audioOscillation*100)}%`;
  sendAudioOptions(true);scheduleSavePreferences();
});
$('audioPitchRange').addEventListener('input',e=>{
  state.audioPitchRange=clamp(Number(e.target.value),0,7);
  $('audioPitchRangeValue').textContent=`${fmt(state.audioPitchRange,1)} semitons`;
  sendAudioOptions(true);scheduleSavePreferences();
});
$('audioKey').addEventListener('change',e=>{
  state.audioKey=clamp(Number(e.target.value),0,11);
  syncAudioKey();
  sendAudioOptions(true);scheduleSavePreferences();
});
for(const button of audioKeyButtons) button.addEventListener('click',()=>{
  const key=clamp(Number(button.dataset.audioKey),0,11);
  if(key===state.audioKey) return;
  $('audioKey').value=String(key);
  $('audioKey').dispatchEvent(new Event('change',{bubbles:true}));
});
$('audioTimbre').addEventListener('change',e=>{
  state.audioTimbre=clamp(Number(e.target.value),0,2);
  sendAudioOptions(true);scheduleSavePreferences();
});
$('audioRhythmButton').addEventListener('click',event=>{
  state.rhythmEnabled=!state.rhythmEnabled;
  toggle(event.currentTarget,state.rhythmEnabled);
  sendAudioOptions();
  scheduleSavePreferences();
});
function bindAudioEffect(id, key) {
  $(id).addEventListener('click',event=>{
    state.audioEffects[key]=!state.audioEffects[key];
    toggle(event.currentTarget,state.audioEffects[key]);
    sendAudioOptions(true);scheduleSavePreferences();
  });
}
bindAudioEffect('audioEchoButton','echo');
bindAudioEffect('audioSpaceButton','space');
bindAudioEffect('audioChorusButton','chorus');
$('flipButton').addEventListener('click',e=>{state.flip=!state.flip;toggle(e.currentTarget,state.flip);});$('maskButton').addEventListener('click',e=>{state.showMask=!state.showMask;toggle(e.currentTarget,state.showMask);});
$('backgroundButton').addEventListener('click',()=>{tracker.reset();resetDisplayTracks();showToast('Fundo refeito');});
$('reseedButton').addEventListener('click',()=>{state.priorCentroid=null;tracker.reset();resetDisplayTracks();showToast('Rastreio reiniciado');});
$('rectangleButton').addEventListener('click',e=>{
  state.drawingRect=!state.drawingRect;
  state.dragRect=null;
  state.keyboardPoint=state.drawingRect?{x:.5,y:.5,anchor:null}:null;
  toggle(e.currentTarget,state.drawingRect);
  if(state.drawingRect){$('rectangleKeyboardStatus').textContent='Desenho por teclado ativo. Use as setas, Enter e Escape.';stage.focus({preventScroll:true});}
  else $('rectangleKeyboardStatus').textContent='Criação de região cancelada.';
  showToast(state.drawingRect?'Use as setas e Enter, ou arraste no palco':'Criação cancelada');
});
$('clearRectanglesButton').addEventListener('click',()=>{
  state.manualRects.length=0;state.dragRect=null;state.resizeRect=null;state.keyboardPoint=null;
  state.drawingRect=false;toggle($('rectangleButton'),false);
  render.drawRoiVeil();
  showToast('Retângulos removidos');scheduleSavePreferences();
});
$('roiVeilButton').addEventListener('click',event=>{
  state.showRoiVeil=!state.showRoiVeil;
  toggle(event.currentTarget,state.showRoiVeil);
  render.drawRoiVeil();
  scheduleSavePreferences();
});
function setTrackingWidth(value){const next=Math.round(clamp(value,160,deviceProfile.maxWidth)/40)*40;if(next===state.trackingWidth){syncTrackingUi();return;}state.trackingWidth=next;tracker.reset();resetDisplayTracks();$('trackingWidth').value=String(next);syncTrackingUi();scheduleSavePreferences();}
function adjustTracking(delta){state.autoQuality=false;setTrackingWidth(state.trackingWidth+delta);syncTrackingUi();}
$('trackDown').addEventListener('click',()=>adjustTracking(-40));$('trackUp').addEventListener('click',()=>adjustTracking(40));
$('captureButton').addEventListener('click',()=>{if(!canvas.width)return;try{const shot=document.createElement('canvas');shot.width=canvas.width;shot.height=canvas.height;const c=shot.getContext('2d');c.drawImage(canvas,0,0);c.drawImage(overlayCanvas,0,0);const a=document.createElement('a');a.download=`blobtrack-celular-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.href=shot.toDataURL('image/png');a.click();}catch(e){showToast(`Captura: ${e.message}`);}});

/* ===== Tela cheia: entrar e SAIR de qualquer jeito ===== */
function isFullscreen(){return Boolean(document.fullscreenElement||document.webkitFullscreenElement);}
async function exitFullscreen(){
  try{ if(document.exitFullscreen) await document.exitFullscreen(); else if(document.webkitExitFullscreen) document.webkitExitFullscreen(); }catch{}
  // O Gear VR travou em paisagem; ao sair, devolve a orientação ao aparelho.
  try{ screen.orientation?.unlock?.(); }catch{}
}
async function enterFullscreen(orientation=null){
  try{
    const el=document.documentElement;
    if(el.requestFullscreen) await el.requestFullscreen({navigationUI:'hide'});
    else if(el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else { showToast(isAppleMobile && !isStandaloneApp ? 'No Safari do iPhone, use Compartilhar → Adicionar à Tela de Início para abrir em tela cheia.' : 'Tela cheia não suportada neste navegador'); return; }
    // Só trava quando o chamador pede (Gear VR). Tela cheia comum segue o giro do celular.
    if(orientation && screen.orientation?.lock) screen.orientation.lock(orientation).catch(()=>{});
  }catch{ showToast(isAppleMobile && !isStandaloneApp ? 'No iPhone, adicione o BlobTrack à Tela de Início para abrir sem as barras do Safari.' : 'Tela cheia não suportada aqui'); }
}
async function toggleFullscreen(){ isFullscreen() ? await exitFullscreen() : await enterFullscreen(); }
$('fullscreenButton').addEventListener('click',toggleFullscreen);
/* Um único sinal do app diz que estamos em tela cheia. CSS :fullscreen falha em alguns
   navegadores de Android/PWA; a classe no body funciona nos dois caminhos. */
function syncFullscreenUi(){
  const on=isFullscreen();
  document.body.classList.toggle('fullscreen-active',on);
  $('fullscreenButton').querySelector('.chip-icon').textContent=on?'⤢':'⛶';
  $('fullscreenButton').setAttribute('aria-label',on?'Sair da tela cheia':'Tela cheia');
}
document.addEventListener('fullscreenchange',syncFullscreenUi);
document.addEventListener('webkitfullscreenchange',syncFullscreenUi);
syncFullscreenUi();
/* Esc / gesto de volta do sistema: sempre reflete o estado */
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusMode)setFocusMode(false);else if(e.key==='Escape'&&isFullscreen())exitFullscreen();});
window.addEventListener('resize',()=>{ if(!isFullscreen()) $('fullscreenButton').querySelector('.chip-icon').textContent='⛶'; });

/* ===== Compartilhar (captura do palco via Web Share API) ===== */
async function shareStage(){
  if(!canvas.width){showToast('Ligue a sessão primeiro');return;}
  try{
    const shot=document.createElement('canvas');shot.width=canvas.width;shot.height=canvas.height;const c=shot.getContext('2d');c.drawImage(canvas,0,0);c.drawImage(overlayCanvas,0,0);
    const blob=await new Promise(r=>shot.toBlob(r,'image/png'));
    const file=new File([blob],`blobtrack-${Date.now()}.png`,{type:'image/png'});
    if(typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:'BlobTrack'});
    else {
      const a=document.createElement('a');a.download=file.name;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      showToast('Navegador sem compartilhamento · imagem salva');
    }
  }catch(e){if(e.name!=='AbortError')showToast(`Compartilhar: ${e.message}`);}
}
$('shareButton').addEventListener('click',shareStage);

/* Um único controle liga/desliga o modo palco; duplo toque no palco também alterna. */
let focusMode=false;
let recordingOwnsFocusMode=false;
function setFocusMode(on){
  focusMode=on;
  state.overlay=true;
  document.body.classList.toggle('focus-mode',on);
  $('focusModeButton').classList.toggle('active',on);
  $('focusModeButton').setAttribute('aria-pressed',String(on));
  $('focusModeButton').setAttribute('aria-label',on?'Sair do modo palco':'Ativar modo palco');
  $('focusModeLabel').textContent=on?'Voltar':'Palco';
  $('focusHint').hidden=!on;
  $('focusHint').textContent=on?'Duplo toque para voltar':'Duplo toque para o modo palco';
  if(on){ if(!isFullscreen())enterFullscreen().catch(()=>{}); }
  else { if(isFullscreen())exitFullscreen().catch(()=>{}); }
  savePreferences();
}
$('focusModeButton').addEventListener('click',()=>setFocusMode(!focusMode));
let lastTap=0;
stage.addEventListener('touchend',e=>{
  if(e.target!==canvas&&e.target!==overlayCanvas)return;
  const now=Date.now();
  if(now-lastTap<320){
    lastTap=0;
    setFocusMode(!focusMode);
  } else lastTap=now;
},{passive:true});
if(saved.focusMode)setFocusMode(true);
const dockBody=$('dockBody'),dockActions=$('dockActions'),dockActionsHint=$('dockActionsHint'),dockScrollHint=$('dockScrollHint');
function updateDockScrollHints(){
  dockActionsHint.hidden=dockActions.scrollWidth<=dockActions.clientWidth+2;
  dockScrollHint.hidden=dockBody.scrollHeight<=dockBody.clientHeight+28;
}
window.addEventListener('resize',updateDockScrollHints);
if('ResizeObserver' in window){const dockResizeObserver=new ResizeObserver(updateDockScrollHints);dockResizeObserver.observe(dockActions);dockResizeObserver.observe(dockBody);}
const dockMutationObserver=new MutationObserver(updateDockScrollHints);
dockMutationObserver.observe(dockActions,{attributes:true,childList:true,subtree:true,attributeFilter:['hidden']});
setTimeout(updateDockScrollHints,0);
const tabButtons=[...document.querySelectorAll('.tab-button')];
function activateTab(button,moveFocus=false){
  tabButtons.forEach(tab=>{const selected=tab===button;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
  document.querySelectorAll('.dock-panel').forEach(panel=>panel.classList.toggle('active',panel.id===button.getAttribute('aria-controls')));
  updateDockScrollHints();
  if(moveFocus)button.focus();
}
tabButtons.forEach((button,index)=>{
  button.addEventListener('click',()=>activateTab(button));
  button.addEventListener('keydown',event=>{
    let next=index;
    if(event.key==='ArrowRight')next=(index+1)%tabButtons.length;
    else if(event.key==='ArrowLeft')next=(index+tabButtons.length-1)%tabButtons.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabButtons.length-1;
    else return;
    event.preventDefault();activateTab(tabButtons[next],true);
  });
});
let touchStartY=0,touchStartTime=0,didResizeRect=false;
stage.addEventListener('touchstart',e=>{if(e.target===canvas||e.target===overlayCanvas){touchStartY=e.changedTouches[0].clientY;touchStartTime=Date.now();}},{passive:true});
stage.addEventListener('touchend',e=>{
  if(e.target!==canvas&&e.target!==overlayCanvas)return;

  const dy=e.changedTouches[0].clientY-touchStartY;
  if(!state.drawingRect&&!didResizeRect&&Math.abs(dy)>65&&Date.now()-touchStartTime<600)switchCamera();
  didResizeRect=false;
},{passive:true});
stage.addEventListener('keydown',e=>{
  if(!state.drawingRect||!state.keyboardPoint)return;
  const point=state.keyboardPoint,step=e.shiftKey ? 0.05 : 0.01,status=$('rectangleKeyboardStatus');
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();
    if(e.key==='ArrowLeft')point.x=Math.max(0,point.x-step);
    if(e.key==='ArrowRight')point.x=Math.min(1,point.x+step);
    if(e.key==='ArrowUp')point.y=Math.max(0,point.y-step);
    if(e.key==='ArrowDown')point.y=Math.min(1,point.y+step);
    if(point.anchor){state.dragRect={x:Math.min(point.anchor.x,point.x),y:Math.min(point.anchor.y,point.y),w:Math.abs(point.x-point.anchor.x),h:Math.abs(point.y-point.anchor.y)};}
    if(!e.repeat)status.textContent=`Ponto em ${Math.round(point.x*100)}%, ${Math.round(point.y*100)}%.`;
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    if(!point.anchor){point.anchor={x:point.x,y:point.y};status.textContent='Primeiro canto marcado. Posicione o segundo canto e pressione Enter.';return;}
    const rect={x:Math.min(point.anchor.x,point.x),y:Math.min(point.anchor.y,point.y),w:Math.abs(point.x-point.anchor.x),h:Math.abs(point.y-point.anchor.y)};
    if(rect.w>.015&&rect.h>.015){state.manualRects.push(rect);status.textContent='Região adicionada.';}
    else status.textContent='Região muito pequena; mova o ponto e tente novamente.';
    state.dragRect=null;state.keyboardPoint=null;state.drawingRect=false;toggle($('rectangleButton'),false);$('rectangleButton').focus();return;
  }
  if(e.key==='Escape'){
    e.preventDefault();state.dragRect=null;state.keyboardPoint=null;state.drawingRect=false;toggle($('rectangleButton'),false);status.textContent='Criação de região cancelada.';$('rectangleButton').focus();
  }
});
overlayCanvas.addEventListener('pointerdown',e=>{
  const bounds=overlayCanvas.getBoundingClientRect();
  const x=(e.clientX-bounds.left)/bounds.width,y=(e.clientY-bounds.top)/bounds.height;
  if(!state.drawingRect){
    const handle=roiHandleAt(x,y,state.manualRects,10/bounds.width,10/bounds.height);
    if(handle){state.resizeRect=handle;didResizeRect=true;overlayCanvas.setPointerCapture(e.pointerId);}
    return;
  }
  state.keyboardPoint=null;
  state.dragRect={x,y,w:0,h:0};
  overlayCanvas.setPointerCapture(e.pointerId);
});
overlayCanvas.addEventListener('pointermove',e=>{
  const bounds=overlayCanvas.getBoundingClientRect();
  const x=(e.clientX-bounds.left)/bounds.width,y=(e.clientY-bounds.top)/bounds.height;
  if(state.resizeRect){resizeRoiRect(state.resizeRect.rect,state.resizeRect.corner,x,y);return;}
  if(!state.dragRect)return;
  state.dragRect={x:Math.min(x,state.dragRect.x),y:Math.min(y,state.dragRect.y),w:Math.abs(x-state.dragRect.x),h:Math.abs(y-state.dragRect.y)};
});
overlayCanvas.addEventListener('pointerup',()=>{
  if(state.resizeRect){state.resizeRect=null;return;}
  if(state.dragRect){if(state.dragRect.w>.015&&state.dragRect.h>.015)state.manualRects.push(state.dragRect);state.dragRect=null;state.drawingRect=false;state.keyboardPoint=null;toggle($('rectangleButton'),false);}
});
overlayCanvas.addEventListener('pointercancel',()=>{state.resizeRect=null;state.dragRect=null;});
if(isStandaloneApp)$('installButton').hidden=true;
if(isAppleMobile && !isStandaloneApp){$('installButton').setAttribute('aria-label','Como adicionar à Tela de Início');}
if(isAppleMobile && isStandaloneApp)$('fullscreenButton').hidden=true;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installButton').hidden=false;});$('installButton').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installButton').hidden=true;return;}if(isAppleMobile&&!isStandaloneApp)showToast('No Safari: Compartilhar → Adicionar à Tela de Início.');});
function applyUiPreferences(){
  const systemLight=window.matchMedia?.('(prefers-color-scheme: light)').matches===true;
  const theme=themeChoice==='system'?(systemLight?'light':'dark'):themeChoice;
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content',theme==='light'?'#f6f8fa':'#090b10');
  document.documentElement.classList.toggle('reduce-motion',reduceMotion);
  document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===themeChoice)));
  $('reduceMotionButton').setAttribute('aria-pressed',String(reduceMotion));
  $('hapticsButton').setAttribute('aria-pressed',String(hapticsEnabled));
  $('hapticsButton').textContent='Feedback tátil · '+(hapticsEnabled?'ligado':'desligado');
}
applyUiPreferences();
document.body.classList.add('dock-open');
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(themeChoice==='system')applyUiPreferences();});
const navigation = createNavigation({
  pages: [{name:'stage',element:$('pageStage')},{name:'session',element:$('pageSession')},{name:'settings',element:$('pageSettings')},{name:'help',element:$('pageHelp')}],
  buttons: [...document.querySelectorAll('.primary-nav [data-page]')].map(element=>({name:element.dataset.page,element})),
  initial: 'stage',
  onChange: name => { document.body.dataset.page=name; },
});
document.querySelectorAll('[data-go-page]').forEach(button=>button.addEventListener('click',()=>{if($('quickSettingsSheet').open)$('quickSettingsSheet').close();if($('permissionDialog').open)$('permissionDialog').close();navigation.navigate(button.dataset.goPage,{focus:true});}));
document.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>{
  navigation.navigate('settings',{focus:true});
  const tab=document.getElementById('tab'+button.dataset.settingsTab);
  if(tab)activateTab(tab);
}));
$('cameraIssueRetry').addEventListener('click',()=>{$('permissionDialog').close();beginSession($('startButton'));});
$('closePermissionDialog').addEventListener('click',()=>$('permissionDialog').close());
$('quickSettingsButton').addEventListener('click',()=>$('quickSettingsSheet').showModal());
$('closeQuickSettings').addEventListener('click',()=>$('quickSettingsSheet').close());
$('quickSettingsSheet').addEventListener('click',event=>{if(event.target===$('quickSettingsSheet'))$('quickSettingsSheet').close();});
$('quickCameraButton').addEventListener('click',()=>{if(!$('switchCamera').disabled)$('switchCamera').click();else showToast('Inicie a câmera para trocar a lente.');});
$('quickQualityButton').addEventListener('click',()=>{$('autoQualityButton').click();const on=$('autoQualityButton').getAttribute('aria-pressed')==='true';$('quickQualityButton').setAttribute('aria-pressed',String(on));$('quickQualityButton').textContent='Qualidade automática · '+(on?'ligada':'desligada');});
$('quickRecordButton').addEventListener('click',()=>{$('recordButton').click();});
$('stageMuteButton').addEventListener('click',()=>$('muteButton').click());
$('quickMuteButton').addEventListener('click',()=>$('muteButton').click());
$('quickSoundButton').addEventListener('click',()=>$('audioSensitivityButton').click());
$('audioSensitivityButton').addEventListener('click',()=>{const on=state.audioEnabled;$('quickSoundButton').setAttribute('aria-pressed',String(on));$('quickSoundButton').textContent=on?'Som ligado':'Som desligado';});
$('muteButton').addEventListener('click',()=>{const muted=state.muted;for(const id of ['stageMuteButton','quickMuteButton']){const b=$(id);b.setAttribute('aria-pressed',String(muted));b.textContent='Mudo';}announceStatus(muted?'Som silenciado':'Som ligado');});
$('quickSoundButton').setAttribute('aria-pressed',String(state.audioEnabled));$('quickSoundButton').textContent=state.audioEnabled?'Som ligado':'Som desligado';
for(const id of ['stageMuteButton','quickMuteButton'])$(id).setAttribute('aria-pressed',String(state.muted));
document.querySelectorAll('[data-quick-effect]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.quickEffect===state.effect)));
$('quickAudioSensitivity').value=String(state.audioSensitivity);$('quickAudioSensitivityValue').textContent=fmt(state.audioSensitivity);
$('quickQualityButton').setAttribute('aria-pressed',String(state.autoQuality));$('quickQualityButton').textContent='Qualidade automática · '+(state.autoQuality?'ligada':'desligada');
$('quickAudioSensitivity').addEventListener('input',event=>{$('audioSensitivity').value=event.target.value;$('audioSensitivity').dispatchEvent(new Event('input',{bubbles:true}));$('quickAudioSensitivityValue').textContent=fmt(Number(event.target.value));});
document.querySelectorAll('[data-quick-effect]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('[data-effect="'+button.dataset.quickEffect+'"]')?.click();document.querySelectorAll('[data-quick-effect]').forEach(item=>{const active=item.dataset.quickEffect===state.effect;item.setAttribute('aria-pressed',String(active));});}));


document.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{
  themeChoice=button.dataset.themeChoice;applyUiPreferences();savePreferences();
}));
$('reduceMotionButton').addEventListener('click',event=>{reduceMotion=!reduceMotion;applyUiPreferences();savePreferences();});
$('hapticsButton').addEventListener('click',()=>{hapticsEnabled=!hapticsEnabled;applyUiPreferences();savePreferences();if(hapticsEnabled)navigator.vibrate?.(8);});
function hapticFeedback(){if(hapticsEnabled)navigator.vibrate?.(8);}
document.querySelectorAll('.primary-nav button,.quick-filter-row button,.pill,.page-button').forEach(button=>button.addEventListener('click',hapticFeedback));
function updateConnectionState(restored=false){const online=navigator.onLine;$('connectionLabel').hidden=online;if(!online)announceStatus('Sem conexão. O app está offline.');else if(restored)announceStatus('Conexão restabelecida.');}
window.addEventListener('offline',()=>updateConnectionState());
window.addEventListener('online',()=>updateConnectionState(true));
updateConnectionState();
if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(e=>log(`Offline: ${e.message}`));
window.addEventListener('beforeunload', event => {
  flushPendingPreferences();
  if (!['recording', 'paused'].includes(recordingSnapshot.state)) return;
  event.preventDefault();
  event.returnValue = '';
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.active) void wakeLockService.acquire(); });
window.addEventListener('pageshow', () => { if(state.active) void ensureAudioAlive(); });
window.addEventListener('focus', () => { if(state.active) void ensureAudioAlive(); });
window.addEventListener('pagehide', () => { flushPendingPreferences(); void wakeLockService.release(); });
