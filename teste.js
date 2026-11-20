// Página de teste isolada — valida blob tracking + áudio reativo sem tocar no app principal.
import { BlobTracker } from './src/blob-tracker.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const ctx = view.getContext('2d', { alpha: false });
const tracker = new BlobTracker();
const trackerCanvas = document.createElement('canvas');
const trackerCtx = trackerCanvas.getContext('2d', { willReadFrequently: true });
const state = { active: false, audio: null, worklet: null, lastFrame: 0, fps: 0, trackCost: 0, envelopes: { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: [0, 0, 0, 0, 0, 0] } };
const TARGET_FPS = 24;

const set = (id, text, cls) => { const el = $(id); el.textContent = text; if (cls) el.className = cls; };
set('d-secure', window.isSecureContext ? 'OK' : 'FALHOU', window.isSecureContext ? 'ok' : 'bad');
set('d-gum', navigator.mediaDevices?.getUserMedia ? 'OK' : 'INDISPONÍVEL', navigator.mediaDevices?.getUserMedia ? 'ok' : 'bad');
set('d-worklet', 'AudioWorkletNode' in window ? 'OK' : 'INDISPONÍVEL', 'AudioWorkletNode' in window ? 'ok' : 'warn');

const zonesEl = $('zones');
for (let i = 0; i < 6; i++) {
  const div = document.createElement('div');
  div.innerHTML = `<span>Zona ${String(i + 1).padStart(2, '0')}</span><b>—</b>`;
  zonesEl.appendChild(div);
}

function drawOverlay(result) {
  const w = view.width, h = view.height;
  ctx.drawImage(video, 0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6ee7bc'; ctx.lineWidth = 1;
  const cw = w / 3, ch = h / 2;
  for (let i = 0; i < 6; i++) {
    const x = (i % 3) * cw, y = Math.floor(i / 3) * ch;
    ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    ctx.fillStyle = `rgba(110,231,188,${state.envelopes.zones[i] * .5})`;
    ctx.fillRect(x + 4, y + 4, cw - 8, ch - 8);
  }
  ctx.strokeStyle = '#b9a1ff'; ctx.lineWidth = 2; ctx.fillStyle = '#f0eaff';
  for (const b of result.blobs) {
    ctx.strokeRect(b.left * w, b.top * h, (b.right - b.left) * w, (b.bottom - b.top) * h);
    ctx.fillText(`B${b.id}`, b.left * w + 4, Math.max(12, b.top * h - 4));
  }
}

const video = document.createElement('video');
video.playsInline = true; video.muted = true;

async function startAudio() {
  if (state.audio) { state.audio.resume(); return; }
  state.audio = new AudioContext({ latencyHint: 'interactive' });
  await state.audio.audioWorklet.addModule('./src/audio-processor.js');
  state.worklet = new AudioWorkletNode(state.audio, 'blobtrack-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  state.worklet.connect(state.audio.destination);
  state.worklet.port.onmessage = ({ data }) => {
    if (data.type === 'meter') set('d-audio', `${data.voices} vozes · ${data.peak.toFixed(3)} pico`, 'ok');
  };
  await state.audio.resume();
}

function frame(now) {
  if (!state.active) return;
  const interval = 1000 / TARGET_FPS;
  if (video.readyState >= 2 && now - state.lastFrame >= interval) {
    state.lastFrame = now;
    const t0 = performance.now();
    const dt = Math.max(0.001, (t0 - (state.lastSignalsAt || t0)) / 1000);
    state.lastSignalsAt = t0;
    const result = tracker.update(video, trackerCtx, trackerCanvas, 320, 0.18, dt);
    state.trackCost = performance.now() - t0;
    const follow = (cur, tgt, a = .06, d = .45) => cur + (tgt - cur) * (1 - Math.exp(-dt / (tgt > cur ? a : d)));
    const e = state.envelopes;
    for (const k of ['energy', 'density', 'speed', 'coherence', 'ambient']) e[k] = follow(e[k], result.raw[k]);
    e.zones = e.zones.map((v, i) => follow(v, result.raw.zones[i], .06, .9));
    state.worklet?.port.postMessage({ type: 'signals', signals: { ...e, zones: [...e.zones] }, master: 1, muted: false });
    drawOverlay(result);
    state.fps = 1 / dt;
    set('d-fps', `${Math.round(state.fps)} fps`, 'ok');
    set('d-track', `${state.trackCost.toFixed(1)} ms`, state.trackCost > interval * .7 ? 'warn' : 'ok');
    set('d-blobs', String(result.blobs.length), 'ok');
    set('d-energy', `E ${Math.round(e.energy * 100)}% · D ${Math.round(e.density * 100)}% · V ${Math.round(e.speed * 100)}% · C ${Math.round(e.coherence * 100)}%`, 'ok');
    zonesEl.querySelectorAll('b').forEach((el, i) => { el.textContent = `${Math.round(e.zones[i] * 100)}%`; });
  }
  requestAnimationFrame(frame);
}

$('startBtn').addEventListener('click', async () => {
  $('startBtn').disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 960 } } });
    video.srcObject = stream; await video.play();
    const track = stream.getVideoTracks()[0];
    const s = track.getSettings?.() || {};
    view.width = Math.min(960, s.width || 960); view.height = Math.round(view.width * (s.height || 720) / (s.width || 960));
    set('d-cam', `${s.width || '?'}×${s.height || '?'} · ${track.label || 'traseira'}`, 'ok');
    state.active = true; $('stopBtn').disabled = false; $('audioBtn').disabled = false;
    requestAnimationFrame(frame);
  } catch (e) {
    set('d-cam', e.name === 'NotAllowedError' ? 'permissão negada' : e.message, 'bad');
    $('startBtn').disabled = false;
  }
});

$('audioBtn').addEventListener('click', async () => {
  if (!state.audio) { try { await startAudio(); } catch (e) { set('d-audio', e.message, 'bad'); return; } }
  else await state.audio.resume();
  $('audioBtn').textContent = 'Áudio: ligado';
});

$('stopBtn').addEventListener('click', async () => {
  state.active = false;
  video.srcObject?.getTracks().forEach(t => t.stop());
  video.srcObject = null; tracker.reset();
  if (state.audio) { await state.audio.suspend().catch(() => { }); $('audioBtn').textContent = 'Áudio: suspenso'; }
  $('stopBtn').disabled = true; $('startBtn').disabled = false;
});
