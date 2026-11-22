import { BlobTracker } from './blob-tracker.js';
import { deviceProfile } from './core/deviceProfile.js';
import { clamp, fmt, formatRecordingTime } from './core/utils.js';
import { createSessionLock } from './session/sessionLock.js';
import { createWakeLock } from './platform/wakeLock.js';
import { createAudio } from './audio/audio.js';
import { createRender } from './render/render.js';
import { createRecorder, recordingExtension } from './recorder.js';
import { drawRecordingFrame, recordingCanvasSize } from './recording-canvas.js';
import { exportRecording } from './recording-export.js';
import { clearVideoComposition } from './video-crop.js';
import { loadPreferences } from './preferences.js';
const $ = (id) => document.getElementById(id);
const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandaloneApp = navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
const video = $('camera'), canvas = $('visual'), analysisCanvas = $('analysis');
const overlayCanvas = $('overlay');
const stage = $('stage');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
const fallbackContext = gl ? null : canvas.getContext('2d', { alpha: false });
const overlayContext = overlayCanvas.getContext('2d');
const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
const frameCanvas = document.createElement('canvas');
const frameContext = frameCanvas.getContext('2d', { alpha: false });
const recordingCanvas = document.createElement('canvas');
const recordingContext = recordingCanvas.getContext('2d', { alpha: false });
Object.defineProperties(frameCanvas, { videoWidth: { get: () => frameCanvas.width }, videoHeight: { get: () => frameCanvas.height } });
const state = {
  active: false, starting: false, claiming: false, sessionReserved: false, switching: false, camera: 'environment', cameraIds: { user: null, environment: null }, stream: null, audio: null, audioHandlersRegistered: false, worklet: null, audioGain: null, recordAudioDestination: null,
  effect: 'invert', flip: false, overlay: true, showMask: false, gearVr: false, reacting: true, muted: false, cameraRecovering: false,
  videoWindows: true, trailEffect: false, waveEffect: false, meshEffect: false,
  threshold: .18, trackingWidth: deviceProfile.startWidth, autoQuality: true, master: 1, bias: 0, background: null, priorCentroid: null,
  performance: { average: 0, slowFrames: 0, fastFrames: 0, fpsAverage: 0, lastFrameAt: 0, lowFpsFrames: 0, recoveredFrames: 0, effectsPaused: false },
  lastFrame: 0, lastSignalsAt: 0, lastHudAt: 0, lastSignal: null, lastAccessibleCount: -1, lastAccessibleAt: 0, keyboardPoint: null, sessionBlocked: false, drawingRect: false, manualRects: [], dragRect: null,
  envelopes: { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: Array(6).fill(0) },
  audioEnabled: true, audioSensitivity: 1, audioOscillation: .4, audioPitchRange: 2, audioKey: 0, audioTimbre: 0,
  audioEffects: { echo: false, space: false, chorus: false },
  gains: { exposure: .35, grow: .60, threshold: .12, dither: .20, speed: 60 },
  timing: { camera: null, tracking: null, cycle: null, bus: null, composition: null, windows: null },
};
const recorder = createRecorder({
  canvas: recordingCanvas,
  fps: deviceProfile.fps,
  getAudioStream: () => state.recordAudioDestination?.stream || null,
});
let recordingSnapshot = { state: 'idle', durationMs: 0, bytes: 0, result: null };
let pendingRecording = null;
let recordingEffect = state.effect;
const saved = loadPreferences();
if (typeof saved.reacting === 'boolean') state.reacting = saved.reacting;
if (typeof saved.effect === 'string' && ['invert','threshold','dither'].includes(saved.effect)) state.effect = saved.effect;
if (Number.isFinite(saved.master)) state.master = clamp(saved.master,0,2);
if (Number.isFinite(saved.bias)) state.bias = clamp(saved.bias,-1,1);
if (Number.isFinite(saved.threshold)) state.threshold = clamp(saved.threshold,0,1);
if (Number.isFinite(saved.trackingWidth)) state.trackingWidth = clamp(saved.trackingWidth,160,deviceProfile.maxWidth);
if (typeof saved.audioEnabled === 'boolean') state.audioEnabled = saved.audioEnabled;
if (Number.isFinite(saved.audioSensitivity)) state.audioSensitivity = clamp(saved.audioSensitivity,0,3);
if (typeof saved.videoWindows === 'boolean') state.videoWindows = saved.videoWindows;
if (typeof saved.trailEffect === 'boolean') state.trailEffect = saved.trailEffect;
if (typeof saved.waveEffect === 'boolean') state.waveEffect = saved.waveEffect;
if (typeof saved.meshEffect === 'boolean') state.meshEffect = saved.meshEffect;
if (typeof saved.gearVr === 'boolean') state.gearVr = saved.gearVr;
if (Number.isFinite(saved.audioOscillation)) state.audioOscillation = clamp(saved.audioOscillation,0,1);
if (Number.isFinite(saved.audioPitchRange)) state.audioPitchRange = clamp(saved.audioPitchRange,0,7);
if (Number.isFinite(saved.audioKey)) state.audioKey = clamp(saved.audioKey,0,11);
if (Number.isFinite(saved.audioTimbre)) state.audioTimbre = clamp(saved.audioTimbre,0,2);
if (saved.audioEffects && typeof saved.audioEffects === 'object') {
  for (const key of ['echo','space','chorus']) if (typeof saved.audioEffects[key] === 'boolean') state.audioEffects[key] = saved.audioEffects[key];
}
let toastTimer, installPrompt, glProgram, texture, posBuffer, uniforms = null;
const maskCanvas = document.createElement('canvas');
const maskContext = maskCanvas.getContext('2d');
let maskImage = null;
const tracker = new BlobTracker();

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
    if (data?.type === 'claim' && (state.active || state.starting || state.sessionReserved)) channel.postMessage({ type: 'active', id: tabId });
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
function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function setStatus(text, on = false) { $('statusText').textContent = text; $('statusLight').parentElement.classList.toggle('on', on); }
function toggle(button, on) { button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); }
function savePreferences() { try { localStorage.setItem('blobtrack-celular-00-preferences',JSON.stringify({reacting:state.reacting,effect:state.effect,master:state.master,bias:state.bias,threshold:state.threshold,trackingWidth:state.trackingWidth,autoQuality:state.autoQuality,focusMode:document.body.classList.contains('focus-mode'),audioEnabled:state.audioEnabled,audioSensitivity:state.audioSensitivity,gearVr:state.gearVr,audioOscillation:state.audioOscillation,audioPitchRange:state.audioPitchRange,audioKey:state.audioKey,audioTimbre:state.audioTimbre,audioEffects:state.audioEffects,videoWindows:state.videoWindows,trailEffect:state.trailEffect,waveEffect:state.waveEffect,meshEffect:state.meshEffect})); } catch {} }
function sendAudioOptions() { state.worklet?.port.postMessage({type:'sound',oscillation:state.audioOscillation,pitchRange:state.audioPitchRange,key:state.audioKey,timbre:state.audioTimbre,soundEffects:state.audioEffects}); }

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

const render = createRender({
  state,
  canvas,
  overlayCanvas,
  gl,
  glProgram: null,
  texture: null,
  uniforms: null,
  fallbackContext,
  overlayContext,
  video,
  maskCanvas,
  maskContext: null,
  maskImage: null,
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
  resize,
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
$('audioTimbre').value=String(state.audioTimbre);
toggle($('audioEchoButton'),state.audioEffects.echo);
toggle($('audioSpaceButton'),state.audioEffects.space);
toggle($('audioChorusButton'),state.audioEffects.chorus);
toggle($('blobWindowButton'),state.videoWindows);
toggle($('trailEffectButton'),state.trailEffect);
toggle($('waveEffectButton'),state.waveEffect);
toggle($('meshEffectButton'),state.meshEffect);
$('motionThreshold').value=String(state.threshold);$('motionValue').textContent=fmt(state.threshold);
$('trackingWidth').max=String(deviceProfile.maxWidth);$('trackingWidth').value=String(state.trackingWidth);$('trackingValue').textContent=`${state.trackingWidth} px`;$('autoQualityButton').classList.toggle('active',state.autoQuality);$('autoQualityButton').setAttribute('aria-pressed',String(state.autoQuality));$('autoQualityButton').textContent=state.autoQuality?'Auto · '+deviceProfile.name:'Auto desligado';
$('master').value=String(state.master);$('masterValue').textContent=fmt(state.master);
$('bias').value=String(state.bias);$('biasValue').textContent=fmt(state.bias);
document.querySelectorAll('[data-effect]').forEach(b=>toggle(b,b.dataset.effect===state.effect));

const vertexSource = `#version 300 es
in vec2 aPosition; out vec2 vUv;
void main(){ vUv=(aPosition+1.0)*0.5; gl_Position=vec4(aPosition,0.0,1.0); }`;
const fragmentSource = `#version 300 es
precision highp float; uniform sampler2D uTexture; uniform int uEffect; uniform float uThreshold; uniform float uBias; uniform float uExposure; uniform float uGrowth; uniform float uSpeed; uniform float uTime; uniform float uImageAspect; uniform float uViewportAspect; uniform bool uFlip; uniform bool uMirror; uniform bool uFit; in vec2 vUv; out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 uv=vUv;if(uFit){if(uImageAspect>uViewportAspect){float contentHeight=uViewportAspect/uImageAspect;if(abs(vUv.y-.5)>contentHeight*.5){outColor=vec4(0.0,0.0,0.0,1.0);return;}uv.y=(vUv.y-.5)/contentHeight+.5;}else{float contentWidth=uImageAspect/uViewportAspect;if(abs(vUv.x-.5)>contentWidth*.5){outColor=vec4(0.0,0.0,0.0,1.0);return;}uv.x=(vUv.x-.5)/contentWidth+.5;}}else if(uImageAspect>uViewportAspect)uv.x=(uv.x-.5)*(uViewportAspect/uImageAspect)+.5;else uv.y=(uv.y-.5)*(uImageAspect/uViewportAspect)+.5;if(uMirror)uv.x=1.0-uv.x;if(uFlip)uv.y=1.0-uv.y;vec4 c=texture(uTexture,uv);float l=dot(c.rgb,vec3(.299,.587,.114));float w=clamp(uExposure*.22+uGrowth*.16,0.0,.45);vec3 rgb=clamp(c.rgb*(1.0+w),0.0,1.0);if(uEffect==0){rgb=1.0-rgb;}else if(uEffect==1){float t=clamp(uThreshold+uBias*.14,0.0,1.0);rgb=vec3(step(t,l));}else{float n=hash(floor(gl_FragCoord.xy*0.75));float t=clamp(uThreshold+uBias*.14+(n-.5)*.18,0.0,1.0);rgb=vec3(step(t,l));}float pulse=1.0+0.012*sin(uTime*min(8.0,1.0+uSpeed*.02));outColor=vec4(clamp(rgb*pulse,0.0,1.0),1.0);}`;
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
    render.glProgram = glProgram; render.texture = texture; render.uniforms = uniforms;
    $('renderInfo').textContent = 'WebGL2 ativo'; return true;
  } catch (e) { log(`Renderizador: ${e.message}`); showToast(fallbackContext ? 'WebGL indisponível · usando modo leve' : 'Renderização indisponível'); $('renderInfo').textContent = fallbackContext ? 'Canvas 2D · modo leve' : 'WebGL2 indisponível'; return Boolean(fallbackContext); }
}
initRenderer();

function cameraScore(label,facing){const name=(label||'').toLocaleLowerCase();const front=/front|user|frontal|selfie|frente/.test(name),rear=/back|rear|environment|traseir|principal|facing back/.test(name);if(facing==='user')return front?100:rear?-100:0;if(front)return-100;let score=rear?20:0;if(/main|primary|principal|wide|camera 0|camera2 0/.test(name))score+=12;if(/ultra|tele|macro|zoom/.test(name))score-=100;return score;}
async function refreshCameraChoices(){if(!navigator.mediaDevices?.enumerateDevices)return;try{const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');for(const facing of ['user','environment']){const pick=devices.map(device=>({device,score:cameraScore(device.label,facing)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)[0];if(pick)state.cameraIds[facing]=pick.device.deviceId;}}catch{}}
async function startCamera() {
  if (state.sessionBlocked) { releaseSession(); showToast('BlobTrack Celular-00 já está aberto em outra aba'); return; }
  if (state.active || state.starting) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { log('Abra em HTTPS ou localhost para liberar câmera e áudio.'); showToast('Câmera precisa de HTTPS ou localhost'); releaseSession(); return; }
  state.starting = true; setStatus('Aguardando câmera'); log('Aguardando permissão da câmera no navegador.'); channel?.postMessage({ type: 'start', id: tabId });
  try {
    const videoConstraints={width:{ideal:deviceProfile.captureWidth},height:{ideal:Math.round(deviceProfile.captureWidth*9/16)},frameRate:{ideal:deviceProfile.fps,max:30}}; const preferred=state.cameraIds[state.camera]; if(preferred)videoConstraints.deviceId={exact:preferred};else videoConstraints.facingMode={ideal:state.camera}; let stream; try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoConstraints});}catch(err){if(!preferred)throw err;state.cameraIds[state.camera]=null;delete videoConstraints.deviceId;videoConstraints.facingMode={ideal:state.camera};stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoConstraints});}
    state.stream = stream; video.srcObject = stream; try { await video.play(); } catch (e) { await new Promise(r => setTimeout(r, 250)); try { await video.play(); } catch {} }
    state.active = true; state.starting = false; state.switching = false;
    void wakeLockService.acquire();
    $('stageMessage').hidden = true; $('switchCamera').disabled = false; $('stopButton').hidden = false; $('startButton2').hidden = true; $('shareButton').hidden = false; setStatus('Sessão ativa', true);
    const track = stream.getVideoTracks()[0]; $('cameraLabel').textContent = state.camera==='environment'?'Traseira principal':'Frontal'; refreshCameraChoices();
    track.addEventListener('ended', () => {
      if (!state.active || state.switching) return;
      log('Câmera desconectada; tentando reconectar.');
      showToast('Câmera desconectada · reconectando');
      recoverCameraStream().catch(error => {
        log(`Câmera: reconexão falhou (${error.message})`);
        showToast('Não foi possível reconectar a câmera');
      });
    }, { once: true });
    updateExposureCapability(track); tracker.reset(); state.priorCentroid = null;
    handleAudioInterruption();
    log('Câmera ativa. O processamento acompanha o movimento da sala.');
    updateRecordingControls(recordingSnapshot);
    requestAnimationFrame(frame); watchAudio();
  } catch (e) { state.starting = false; state.switching = false; await stopMedia(); $('stageMessage').hidden = false; $('stopButton').hidden = true; $('startButton2').hidden = false; $('switchCamera').disabled = true; $('exposureButton').disabled = true; channel?.postMessage({type:'stop',id:tabId}); releaseSession(); setStatus('Câmera indisponível'); log(`Câmera: ${e.name === 'NotAllowedError' ? 'permissão negada.' : e.message}`); showToast(e.name === 'NotAllowedError' ? 'Permita o acesso à câmera para ligar.' : 'Não foi possível abrir a câmera.'); }
}
async function recoverCameraStream() {
  if (state.cameraRecovering || state.switching) return;
  state.cameraRecovering = true;
  try { await stopMedia(); await startCamera(); }
  finally { state.cameraRecovering = false; }
}
async function stopMedia() { state.active = false; updateRecordingControls(recordingSnapshot); clearVideoComposition({ gl, fallbackContext, overlayContext, width:canvas.width, height:canvas.height }); state.stream?.getTracks().forEach(t => t.stop()); state.stream = null; if (video.srcObject) video.srcObject = null; tracker.reset(); }
function releaseSession() { sessionLock.release(); }
async function stopSession() { await wakeLockService.release(); if(recordingSnapshot.state!=='idle')await stopRecording(); await stopMedia(); state.starting = false; state.switching = false; $('stageMessage').hidden = false; $('stopButton').hidden = true; $('startButton2').hidden = false; $('shareButton').hidden = true; $('switchCamera').disabled = true; $('exposureButton').disabled = true; $('cameraLabel').textContent = 'Câmera aguardando'; setStatus('Sessão encerrada'); if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(0,t,.12);} releaseSession(); if(state.audio)setTimeout(()=>{if(!state.active)state.audio.suspend().catch(()=>{});},180); }
async function switchCamera() { if (!state.active || state.switching) return; state.switching = true; state.camera = state.camera === 'environment' ? 'user' : 'environment'; await stopMedia(); await startCamera(); }
function updateExposureCapability(track) { const caps = track.getCapabilities?.() || {}; const ok = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual'); $('exposureButton').disabled = !ok; $('exposureHint').textContent = ok ? 'A câmera aceita exposição manual.' : 'Exposição manual não suportada por esta câmera.'; }
// Blindagem: retoma câmera/vídeo quando a aba volta ao primeiro plano (iOS suspende o stream).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    void wakeLockService.release();
    if (recordingSnapshot.state === 'recording') {
      try {
        if (!recorder.pause()) throw new Error('A gravação não pôde ser pausada.');
      } catch (error) {
        log(`Gravação: pausa em segundo plano falhou (${error.message})`);
        showToast('Gravação encerrada ao ir para segundo plano');
        void stopRecording();
      }
    }
    return;
  }
  if (document.visibilityState !== 'visible') return;
  if (recordingSnapshot.state === 'paused') {
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
  const ratio = Math.min(devicePixelRatio || 1, deviceProfile.pixelRatio); const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (overlayCanvas.width !== w || overlayCanvas.height !== h) { overlayCanvas.width = w; overlayCanvas.height = h; }
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}
new ResizeObserver(resize).observe(canvas);
window.addEventListener('orientationchange', () => requestAnimationFrame(resize), { passive: true });

// One immutable camera snapshot feeds tracking, the main render and raw blob windows.
function captureVideoFrame() {
  if (frameCanvas.width !== video.videoWidth || frameCanvas.height !== video.videoHeight) {
    frameCanvas.width = video.videoWidth; frameCanvas.height = video.videoHeight;
  }
  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  return frameCanvas;
}

function analyze(source = video) {
  const t0 = performance.now();
  const dt = state.lastSignalsAt ? Math.max(0.001, (t0 - state.lastSignalsAt) / 1000) : 1 / deviceProfile.fps;
  state.lastSignalsAt = t0;
  const result = tracker.update(source, ctx, analysisCanvas, state.trackingWidth, state.threshold, dt);
  if (!result) return null;
  state.timing.tracking = performance.now() - t0;
  state.timing.camera = null;
  return { ...result, dt };
}
function followEnvelope(current, target, dt, attack=.06, decay=.45) { const tau = target > current ? attack : decay; return current + (target - current) * (1 - Math.exp(-dt / tau)); }
function updateSignals(raw, dt) {
  const e = state.envelopes;
  for (const key of ['energy','density','speed','coherence','ambient']) e[key] = followEnvelope(e[key], raw[key], dt);
  for (let i = 0; i < e.zones.length; i++) e.zones[i] = followEnvelope(e.zones[i],raw.zones[i],dt,.06,.9);
  const m = state.reacting ? state.master : 0;
  const applied = { exposure:m*state.gains.exposure*e.energy, grow:m*state.gains.grow*(.6*e.density+.4*e.speed), threshold:m*state.gains.threshold*e.coherence, dither:m*state.gains.dither*e.speed, speed:m*state.gains.speed*e.energy };
  state.lastSignal = { ...e, applied };
  const t0 = performance.now();
  state.worklet?.port.postMessage({ type:'signals', signals:{...e,zones:[...e.zones]}, master:m, muted:state.muted, sensitivity:state.audioSensitivity, audioEnabled:state.audioEnabled, oscillation:state.audioOscillation, pitchRange:state.audioPitchRange, key:state.audioKey, timbre:state.audioTimbre, soundEffects:state.audioEffects });
  state.timing.bus = performance.now() - t0;
  return applied;
}
function updateHud(raw, applied, result) {
  const now = performance.now();
  if (now - state.lastHudAt < 100) return;
  state.lastHudAt = now;
  for(const k of ['energy','density','speed','coherence','ambient']){$(`signal-${k}`).textContent=`${Math.round(state.envelopes[k]*100)}%`;$(`bar-${k}`).style.width=`${state.envelopes[k]*100}%`;}
  document.querySelectorAll('.zone').forEach((el,i)=>{const v=state.envelopes.zones[i],percent=Math.round(v*100);el.querySelector('b').textContent=`${percent}%`;el.setAttribute('aria-label',`Zona ${i+1}: ${percent}%`);el.style.background=`linear-gradient(90deg,#15372d ${Math.min(100,v*100)}%,#141a23 ${Math.min(100,v*100)}%)`;});
  const sr=$('statusReadout'); if(sr) sr.textContent=`${Math.round(state.envelopes.energy*100)}% energia · ${Math.round(state.envelopes.density*100)}% dens`;
  const ms=x=>Number.isFinite(x)?x.toFixed(1):'—'; $('timeReadout').textContent=`${ms(state.timing.tracking)} · ${ms(state.timing.cycle)} ms`;
  $('windowCostReadout').textContent=state.videoWindows?`${ms(state.timing.windows)} ms · ${result.blobs.length} recortes`:'Desligada';
  $('frameInfo').textContent=`${result.width}×${result.height} · fps ${Math.round(1/Math.max(result.dt,.001))}`; if($('blobReadout')) $('blobReadout').textContent=`${result.blobs.length} blobs`;
  if (now - state.lastAccessibleAt >= 1500 && result.blobs.length !== state.lastAccessibleCount) {
    state.lastAccessibleAt = now;
    state.lastAccessibleCount = result.blobs.length;
    const count = result.blobs.length;
    $('visualSummary').textContent = count === 1 ? 'Uma região de movimento detectada.' : `${count} regiões de movimento detectadas.`;
  }
}
function updateReactiveEffectQuality(now) {
  const perf = state.performance, elapsed = perf.lastFrameAt ? now - perf.lastFrameAt : 0;
  perf.lastFrameAt = now;
  const fps = elapsed > 0 ? 1000 / elapsed : deviceProfile.fps;
  perf.fpsAverage = perf.fpsAverage ? perf.fpsAverage * .88 + fps * .12 : fps;
  const threshold = Math.max(15, Math.min(28, deviceProfile.fps - 2));
  if (!perf.effectsPaused) {
    perf.lowFpsFrames = perf.fpsAverage < threshold ? perf.lowFpsFrames + 1 : 0;
    if (perf.lowFpsFrames >= 8) { perf.effectsPaused = true; perf.recoveredFrames = 0; showToast('Efeitos reativos pausados para proteger o FPS'); }
  } else {
    perf.recoveredFrames = perf.fpsAverage >= threshold + 2 ? perf.recoveredFrames + 1 : 0;
    if (perf.recoveredFrames >= 45) { perf.effectsPaused = false; perf.lowFpsFrames = 0; showToast('Efeitos reativos retomados'); }
  }
  const hint = $('effectPerformanceHint');
  hint.hidden = !perf.effectsPaused;
  if (perf.effectsPaused) hint.textContent = `Efeitos reativos pausados · ${Math.round(perf.fpsAverage)} fps · a Janela viva continua ativa.`;
}
let frameErrors = 0;
function frame(now) {
  if (!state.active) return;
  try {
    const interval = 1000 / deviceProfile.fps;
    if (video.readyState >= 2 && now - state.lastFrame >= interval) {
      const started = performance.now();
      state.lastFrame = now;
      try {
        const source = captureVideoFrame();
        const result = analyze(source);
        if (result) {
          const applied = updateSignals(result.raw, result.dt);
          render.renderFrame(applied, source); render.drawMaskOverlay(result, source); render.drawRecordingComposite(); updateHud(result.raw, applied, result); updateReactiveEffectQuality(now);
        }
      } catch (e) { if (++frameErrors % 30 === 1) log(`Ciclo: ${e.message}`); }
      if (state.autoQuality) {
        const perf = state.performance, cost = performance.now() - started;
        perf.average = perf.average ? perf.average * 0.9 + cost * 0.1 : cost;
        const budget = interval * 0.7;
        perf.slowFrames = perf.average > budget ? perf.slowFrames + 1 : 0;
        perf.fastFrames = perf.average < budget * 0.42 ? perf.fastFrames + 1 : 0;
        if (perf.slowFrames >= 12 && state.trackingWidth > 160) { setTrackingWidth(Math.max(160, state.trackingWidth - 80)); perf.slowFrames = perf.fastFrames = 0; }
        else if (perf.fastFrames >= 180 && state.trackingWidth < deviceProfile.maxWidth) { setTrackingWidth(Math.min(deviceProfile.maxWidth, state.trackingWidth + 80)); perf.fastFrames = 0; }
      }
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
    try { disconnectRecordingAudio(); }
    catch (error) { log(`Gravação: falha ao liberar saída de áudio (${error.message})`); }
    if (snapshot.result) {
      pendingRecording = snapshot.result;
      const duration = formatRecordingTime(snapshot.result.durationMs);
      const size = (snapshot.result.bytes / (1024 * 1024)).toFixed(1);
      if (snapshot.result.reason === 'max-duration') showToast(`Limite de 10 min · gravado ${duration} · ${size} MB`);
      else if (snapshot.result.reason === 'max-bytes') showToast(`Limite de tamanho · gravado ${duration} · ${size} MB`);
      else if (snapshot.result.reason === 'memory-limit') showToast(`Memória alta · gravação encerrada em ${duration}`);
      else showToast(`Gravado · ${duration} · ${size} MB · use Salvar`);
    }
  }
  const supported = recorder.isSupported();
  const recording = snapshot.state !== 'idle';
  const label = snapshot.state === 'stopping' ? 'Finalizando gravação' : recording ? 'Parar gravação' : 'Iniciar gravação';
  const title = !supported ? 'Gravação não suportada neste navegador.'
    : !recording && !state.active ? 'Inicie a sessão para gravar o palco.'
      : label;
  const disabled = !supported || (!recording && !state.active) || snapshot.state === 'stopping';
  for (const id of ['recordButton', 'recordButtonPanel']) {
    const button = $(id);
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

  const indicator = $('recordIndicator');
  indicator.hidden = !recording;
  indicator.classList.toggle('paused', snapshot.state === 'paused');
  indicator.setAttribute('aria-label', label);
  indicator.setAttribute('aria-pressed', String(recording));
  indicator.title = label;
  $('recordIndicatorLabel').textContent = snapshot.state === 'paused' ? 'PAUSADO' : snapshot.state === 'stopping' ? 'FINALIZANDO' : 'REC';
  $('recordIndicatorTime').textContent = time;

  const hasResult = Boolean(pendingRecording);
  $('recordSaveButton').hidden = !hasResult;
  $('recordSaveButtonPanel').hidden = !hasResult;
}
function releasePendingRecording() {
  if (pendingRecording?.url) URL.revokeObjectURL(pendingRecording.url);
  pendingRecording = null;
}
async function savePendingRecording() {
  if (!pendingRecording) return;
  const filename = recordingFileName({ ...pendingRecording, effect: recordingEffect });
  try {
    const method = await exportRecording(pendingRecording, {
      filename,
      onError: (operation, error) => log(`Gravação: ${operation} falhou (${error.message}); tentando alternativa.`),
    });
    if (method === 'shared') showToast('Gravação compartilhada');
    else if (method === 'saved') showToast('Arquivo de gravação salvo');
    else if (method === 'downloaded') showToast('Download da gravação iniciado');
    else showToast('Salvamento cancelado');
  } catch (error) {
    log(`Gravação: falha ao salvar (${error.message})`);
    showToast('Não foi possível salvar a gravação');
  }
}
async function startRecording() {
  if (!state.active) { showToast('Inicie a sessão antes de gravar'); return; }
  if (!recorder.isSupported()) { showToast('Gravação não suportada neste navegador'); return; }
  if (!recordingContext) { showToast('Composição de gravação indisponível neste navegador'); return; }
  resize();
  if (!canvas.width || !canvas.height) { showToast('Palco indisponível para gravação'); return; }
  const size = recordingCanvasSize(canvas.width, canvas.height);
  recordingCanvas.width = size.width;
  recordingCanvas.height = size.height;
  render.drawRecordingComposite(true);
  recordingEffect = state.effect;
  try {
    const destination = connectRecordingAudio();
    const longEdge = Math.max(recordingCanvas.width, recordingCanvas.height);
    const videoBitsPerSecond = longEdge >= 1920 ? 8_000_000 : longEdge >= 1280 ? 4_000_000 : Math.max(1_000_000, Math.round(longEdge / 1280 * 4_000_000));
    const recordInfo = recorder.start({ audioStream: destination?.stream || null, videoBitsPerSecond });
    releasePendingRecording();
    updateRecordingControls(recordingSnapshot);
    const audioNotice = recordInfo.includesAudio ? '' : ' · áudio indisponível';
    showToast(`Gravando ${recordInfo.extension.toUpperCase()} · ${recordingCanvas.width}×${recordingCanvas.height} · até ${deviceProfile.fps} fps${audioNotice}`);
  } catch (error) {
    try { disconnectRecordingAudio(); }
    catch (cleanupError) { log(`Gravação: falha ao liberar saída de áudio (${cleanupError.message})`); }
    log(`Gravação: ${error.message}`);
    showToast(`Não foi possível iniciar a gravação: ${error.message}`);
  }
}
async function stopRecording() {
  if (recordingSnapshot.state === 'idle' || recordingSnapshot.state === 'stopping') return;
  try { await recorder.stop('user'); }
  catch (error) {
    try { disconnectRecordingAudio(); }
    catch (cleanupError) { log(`Gravação: falha ao liberar saída de áudio (${cleanupError.message})`); }
    log(`Gravação: ${error.message}`);
    showToast('A gravação foi encerrada com erro');
  }
}
async function toggleRecording() {
  if (recordingSnapshot.state === 'idle') await startRecording();
  else await stopRecording();
}
recorder.onState(updateRecordingControls);
recorder.onError(error => {
  log(`Gravação: ${error.message}`);
  showToast('Erro durante a gravação');
});
['recordButton', 'recordButtonPanel', 'recordIndicator'].forEach(id => $(id).addEventListener('click', toggleRecording));
['recordSaveButton', 'recordSaveButtonPanel'].forEach(id => $(id).addEventListener('click', savePendingRecording));
function resetStartButtons(){['startButton','startButton2'].forEach(id=>{const b=$(id);if(b)b.disabled=false;});}
async function beginSession(button){
  if(state.active||state.starting)return;
  if(button)button.disabled=true;
  const reserved=await sessionLock.acquire();
  if(!reserved){resetStartButtons();state.sessionBlocked=true;showToast('BlobTrack Celular-00 já está aberto em outra aba');return;}
  resetStartButtons();
  const audioPromise=makeAudio();
  try { if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(()=>{}); } catch {}
  await audioPromise; if(state.audio?.state==='suspended') await state.audio.resume().catch(()=>{});
  if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.audioEnabled&&!state.muted?1:0,t,.12);}
  await startCamera();
}
$('startButton').addEventListener('click',e=>beginSession(e.currentTarget));
$('startButton2').addEventListener('click',e=>beginSession(e.currentTarget));
$('switchCamera').addEventListener('click',switchCamera);$('exposureButton').addEventListener('click',setManualExposure);$('stopButton').addEventListener('click',stopSession);
/* Painel deslizante: alça e gesto de arrasto */
const dock=$('dock');
function setDock(open){dock.classList.toggle('closed',!open);$('dockHandle').setAttribute('aria-expanded',String(open));$('dockPeek').textContent=open?'▾':'▴';$('dockLabel').textContent=open?'Controles':'Ajustes';}
$('dockHandle').addEventListener('click',()=>setDock(dock.classList.contains('closed')));
let dockDragY=null;
$('dockHandle').addEventListener('touchstart',e=>{dockDragY=e.changedTouches[0].clientY;},{passive:true});
$('dockHandle').addEventListener('touchend',e=>{if(dockDragY===null)return;const dy=dockDragY-e.changedTouches[0].clientY;dockDragY=null;if(Math.abs(dy)>30)setDock(dy>0);},{passive:true});
/* Ocultar interface pelo botão flutuante ◌ */
let uiHidden=false;
function setUiHidden(on){
  uiHidden=on;
  document.body.classList.toggle('ui-hidden',on);
  if(!on)setDock(true);
  showToast(on?'Interface oculta · toque no palco para voltar':'Interface visível');
}
$('hideUiButton').addEventListener('click',()=>setUiHidden(!uiHidden));
function setGearVr(on, persist=true){
  state.gearVr=on;
  document.body.classList.toggle('gear-vr',on);
  $('gearVrButton').classList.toggle('active',on);
  $('gearVrButton').setAttribute('aria-pressed',String(on));
  $('gearVrExit').hidden=!on;
  if(on){state.overlay=false;state.showMask=false;toggle($('overlayButton'),false);toggle($('maskButton'),false);if(persist)enterFullscreen('landscape');showToast('Gear VR ativo · imagem lado a lado');}
  else {if(persist&&isFullscreen())exitFullscreen();showToast('Visualização normal');}
  if(persist)savePreferences();
}
$('gearVrButton').addEventListener('click',()=>setGearVr(!state.gearVr));
$('gearVrExit').addEventListener('click',()=>setGearVr(false));
if(state.gearVr)setGearVr(true,false);
stage.addEventListener('click',e=>{
  if(!uiHidden)return;
  if(e.target===canvas||e.target===overlayCanvas)setUiHidden(false);
});
document.querySelectorAll('[data-effect]').forEach(b=>b.addEventListener('click',()=>{if(state.effect===b.dataset.effect)return;state.effect=b.dataset.effect;document.querySelectorAll('[data-effect]').forEach(x=>toggle(x,x===b));savePreferences();}));
function bindReactiveToggle(id, key) {
  $(id).addEventListener('click', event => { state[key] = !state[key]; toggle(event.currentTarget, state[key]); savePreferences(); });
}
bindReactiveToggle('blobWindowButton', 'videoWindows');
bindReactiveToggle('trailEffectButton', 'trailEffect');
bindReactiveToggle('waveEffectButton', 'waveEffect');
bindReactiveToggle('meshEffectButton', 'meshEffect');
$('motionThreshold').addEventListener('input',e=>{state.threshold=Number(e.target.value);$('motionValue').textContent=fmt(state.threshold);tracker.reset();savePreferences();});
$('trackingWidth').addEventListener('input',e=>{state.autoQuality=false;$('autoQualityButton').classList.remove('active');$('autoQualityButton').textContent='Auto desligado';setTrackingWidth(Number(e.target.value));});
$('autoQualityButton').addEventListener('click',()=>{state.autoQuality=!state.autoQuality;if(state.autoQuality)setTrackingWidth(deviceProfile.startWidth);$('autoQualityButton').classList.toggle('active',state.autoQuality);$('autoQualityButton').setAttribute('aria-pressed',String(state.autoQuality));$('autoQualityButton').textContent=state.autoQuality?'Auto · '+deviceProfile.name:'Auto desligado';savePreferences();});
$('master').addEventListener('input',e=>{state.master=Number(e.target.value);$('masterValue').textContent=fmt(state.master);savePreferences();});
$('bias').addEventListener('input',e=>{state.bias=Number(e.target.value);$('biasValue').textContent=fmt(state.bias);savePreferences();});

$('reactButton').addEventListener('click',e=>{state.reacting=!state.reacting;toggle(e.currentTarget,state.reacting);savePreferences();});
$('muteButton').addEventListener('click',e=>{state.muted=!state.muted;toggle(e.currentTarget,state.muted);if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.muted?0:1,t,.12);}state.worklet?.port.postMessage({type:'mute',muted:state.muted});});
/* ===== Sensibilidade do áudio: liga/desliga + intensidade ===== */
$('audioSensitivityButton').addEventListener('click',e=>{
  state.audioEnabled=!state.audioEnabled;
  toggle(e.currentTarget,state.audioEnabled);
  e.currentTarget.textContent=state.audioEnabled?'Som · ligado':'Som · desligado';
  state.worklet?.port.postMessage({type:'audioEnabled',enabled:state.audioEnabled});
  state.worklet?.port.postMessage({type:'signals',signals:{...state.envelopes,zones:[...state.envelopes.zones]},master:state.reacting?state.master:0,muted:state.muted,sensitivity:state.audioSensitivity,audioEnabled:state.audioEnabled});
  if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.audioEnabled&&!state.muted?1:0,t,.12);}
  showToast(state.audioEnabled?'Som reativo ligado':'Som desligado · imagem continua');
  savePreferences();
});
$('audioSensitivity').addEventListener('input',e=>{
  state.audioSensitivity=clamp(Number(e.target.value),0,3);
  $('audioSensitivityValue').textContent=fmt(state.audioSensitivity);
  state.worklet?.port.postMessage({type:'sensitivity',value:state.audioSensitivity});
  savePreferences();
});
$('audioOscillation').addEventListener('input',e=>{
  state.audioOscillation=clamp(Number(e.target.value),0,1);
  $('audioOscillationValue').textContent=`${Math.round(state.audioOscillation*100)}%`;
  sendAudioOptions();savePreferences();
});
$('audioPitchRange').addEventListener('input',e=>{
  state.audioPitchRange=clamp(Number(e.target.value),0,7);
  $('audioPitchRangeValue').textContent=`${fmt(state.audioPitchRange,1)} semitons`;
  sendAudioOptions();savePreferences();
});
$('audioKey').addEventListener('change',e=>{
  state.audioKey=clamp(Number(e.target.value),0,11);
  sendAudioOptions();savePreferences();
});
$('audioTimbre').addEventListener('change',e=>{
  state.audioTimbre=clamp(Number(e.target.value),0,2);
  sendAudioOptions();savePreferences();
});
function bindAudioEffect(id, key) {
  $(id).addEventListener('click',event=>{
    state.audioEffects[key]=!state.audioEffects[key];
    toggle(event.currentTarget,state.audioEffects[key]);
    sendAudioOptions();savePreferences();
  });
}
bindAudioEffect('audioEchoButton','echo');
bindAudioEffect('audioSpaceButton','space');
bindAudioEffect('audioChorusButton','chorus');
$('flipButton').addEventListener('click',e=>{state.flip=!state.flip;toggle(e.currentTarget,state.flip);});$('overlayButton').addEventListener('click',e=>{state.overlay=!state.overlay;toggle(e.currentTarget,state.overlay);});$('maskButton').addEventListener('click',e=>{state.showMask=!state.showMask;toggle(e.currentTarget,state.showMask);});
$('backgroundButton').addEventListener('click',()=>{tracker.reset();showToast('Fundo refeito');});
$('reseedButton').addEventListener('click',()=>{state.priorCentroid=null;tracker.reset();showToast('Rastreio reiniciado');});
$('rectangleButton').addEventListener('click',e=>{
  state.drawingRect=!state.drawingRect;
  state.dragRect=null;
  state.keyboardPoint=state.drawingRect?{x:.5,y:.5,anchor:null}:null;
  toggle(e.currentTarget,state.drawingRect);
  if(state.drawingRect){$('rectangleKeyboardStatus').textContent='Desenho por teclado ativo. Use as setas, Enter e Escape.';stage.focus({preventScroll:true});}
  else $('rectangleKeyboardStatus').textContent='Criação de região cancelada.';
  showToast(state.drawingRect?'Use as setas e Enter, ou arraste no palco':'Criação cancelada');
});
function setTrackingWidth(value){const next=Math.round(clamp(value,160,deviceProfile.maxWidth)/80)*80;if(next===state.trackingWidth)return;state.trackingWidth=next;tracker.reset();$('trackingWidth').value=String(next);$('trackingValue').textContent=`${next} px`;savePreferences();}
function adjustTracking(delta){state.autoQuality=false;$('autoQualityButton').classList.remove('active');$('autoQualityButton').textContent='Auto desligado';setTrackingWidth(state.trackingWidth+delta);}
$('trackDown').addEventListener('click',()=>adjustTracking(-80));$('trackUp').addEventListener('click',()=>adjustTracking(80));
$('captureButton').addEventListener('click',()=>{if(!canvas.width)return;try{const shot=document.createElement('canvas');shot.width=canvas.width;shot.height=canvas.height;const c=shot.getContext('2d');c.drawImage(canvas,0,0);c.drawImage(overlayCanvas,0,0);const a=document.createElement('a');a.download=`blobtrack-celular-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.href=shot.toDataURL('image/png');a.click();}catch(e){showToast(`Captura: ${e.message}`);}});

/* ===== Tela cheia: entrar e SAIR de qualquer jeito ===== */
function isFullscreen(){return Boolean(document.fullscreenElement||document.webkitFullscreenElement);}
async function exitFullscreen(){
  try{ if(document.exitFullscreen) await document.exitFullscreen(); else if(document.webkitExitFullscreen) document.webkitExitFullscreen(); }catch{}
}
async function enterFullscreen(orientation='portrait'){
  try{
    const el=document.documentElement;
    if(el.requestFullscreen) await el.requestFullscreen({navigationUI:'hide'});
    else if(el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else { showToast(isAppleMobile && !isStandaloneApp ? 'No Safari do iPhone, use Compartilhar → Adicionar à Tela de Início para abrir em tela cheia.' : 'Tela cheia não suportada neste navegador'); return; }
    if(screen.orientation?.lock) screen.orientation.lock(orientation).catch(()=>{});
  }catch{ showToast(isAppleMobile && !isStandaloneApp ? 'No iPhone, adicione o BlobTrack à Tela de Início para abrir sem as barras do Safari.' : 'Tela cheia não suportada aqui'); }
}
async function toggleFullscreen(){ isFullscreen() ? await exitFullscreen() : await enterFullscreen(); }
$('fullscreenButton').addEventListener('click',toggleFullscreen);
document.addEventListener('fullscreenchange',()=>{
  const on=isFullscreen();
  $('fullscreenButton').textContent=on?'⤢':'⛶';
  $('fullscreenButton').setAttribute('aria-label',on?'Sair da tela cheia':'Tela cheia');
});
document.addEventListener('webkitfullscreenchange',()=>$('fullscreenButton').textContent=isFullscreen()?'⤢':'⛶');
/* Esc / gesto de volta do sistema: sempre reflete o estado */
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&isFullscreen())exitFullscreen();});
window.addEventListener('resize',()=>{ if(!isFullscreen()) $('fullscreenButton').textContent='⛶'; });

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

/* ===== Modo palco: prioriza o efeito visual, oculta a interface ===== */
let focusMode=false;
function setFocusMode(on){
  focusMode=on;
  document.body.classList.toggle('focus-mode',on);
  $('focusButton')?.classList.toggle('active',on);
  $('focusButton')?.setAttribute('aria-pressed',String(on));
  $('focusHint').hidden=!on;
  $('focusHint').textContent=on?'Duplo toque para voltar':'Duplo toque para o modo palco';
  if(on){
    if(!isFullscreen())enterFullscreen().catch(()=>{});
    state.overlay=false;$('overlayButton')?.classList.remove('active');$('overlayButton')?.setAttribute('aria-pressed','false');
  } else {
    // Sair do modo palco também sai da tela cheia (facilita voltar)
    if(isFullscreen())exitFullscreen().catch(()=>{});
    state.overlay=true;$('overlayButton')?.classList.add('active');$('overlayButton')?.setAttribute('aria-pressed','true');
  }
  savePreferences();
}
$('focusButton').addEventListener('click',()=>setFocusMode(!focusMode));
let lastTap=0;
stage.addEventListener('touchend',e=>{
  if(e.target!==canvas&&e.target!==overlayCanvas)return;
  const now=Date.now();
  if(now-lastTap<320){
    lastTap=0;
    if(uiHidden)setUiHidden(false);
    else setFocusMode(!focusMode);
  } else lastTap=now;
},{passive:true});
if(saved.focusMode)setFocusMode(true);
const tabButtons=[...document.querySelectorAll('.tab-button')];
function activateTab(button,moveFocus=false){
  tabButtons.forEach(tab=>{const selected=tab===button;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
  document.querySelectorAll('.dock-panel').forEach(panel=>panel.classList.toggle('active',panel.id===button.getAttribute('aria-controls')));
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
let touchStartY=0,touchStartTime=0;
stage.addEventListener('touchstart',e=>{if(e.target===canvas||e.target===overlayCanvas){touchStartY=e.changedTouches[0].clientY;touchStartTime=Date.now();}},{passive:true});
stage.addEventListener('touchend',e=>{
  if(e.target!==canvas&&e.target!==overlayCanvas)return;
  if(uiHidden){setUiHidden(false);return;}
  const dy=e.changedTouches[0].clientY-touchStartY;
  if(!state.drawingRect&&Math.abs(dy)>65&&Date.now()-touchStartTime<600)switchCamera();
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
overlayCanvas.addEventListener('pointerdown',e=>{if(!state.drawingRect)return;state.keyboardPoint=null;const r=overlayCanvas.getBoundingClientRect();state.dragRect={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,w:0,h:0};overlayCanvas.setPointerCapture(e.pointerId);});
overlayCanvas.addEventListener('pointermove',e=>{if(!state.dragRect)return;const r=overlayCanvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;state.dragRect={x:Math.min(x,state.dragRect.x),y:Math.min(y,state.dragRect.y),w:Math.abs(x-state.dragRect.x),h:Math.abs(y-state.dragRect.y)};});
overlayCanvas.addEventListener('pointerup',()=>{if(state.dragRect){if(state.dragRect.w>.015&&state.dragRect.h>.015)state.manualRects.push(state.dragRect);state.dragRect=null;state.drawingRect=false;state.keyboardPoint=null;toggle($('rectangleButton'),false);}});
if(isAppleMobile && !isStandaloneApp){$('installButton').hidden=false;$('installButton').setAttribute('aria-label','Como adicionar à Tela de Início');}
if(isAppleMobile && isStandaloneApp)$('fullscreenButton').hidden=true;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installButton').hidden=false;});$('installButton').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installButton').hidden=true;return;}if(isAppleMobile&&!isStandaloneApp)showToast('No Safari: Compartilhar → Adicionar à Tela de Início.');});
if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(e=>log(`Offline: ${e.message}`));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.active) void wakeLockService.acquire(); });
window.addEventListener('pagehide', () => { void wakeLockService.release(); });

