const $ = (id) => document.getElementById(id);
const video = $('camera'), canvas = $('visual'), analysisCanvas = $('analysis');
const overlayCanvas = $('overlay');
const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
const state = {
  active: false, starting: false, camera: 'environment', stream: null, audio: null, worklet: null, audioGain: null,
  effect: 'invert', flip: false, overlay: true, showMask: false, reacting: true, muted: false,
  threshold: .18, trackingWidth: 640, master: 1, bias: 0, background: null, priorCentroid: null,
  lastFrame: 0, lastSignalsAt: 0, lastSignal: null, sessionBlocked: false, drawingRect: false, manualRects: [], dragRect: null,
  envelopes: { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: Array(6).fill(0) },
  gains: { exposure: .35, grow: .60, threshold: .12, dither: .20, speed: 60 },
  timing: { camera: null, tracking: null, cycle: null, bus: null },
};
const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
const fmt = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—';
try {
  const saved = JSON.parse(localStorage.getItem('cv0-preferences') || '{}');
  if (typeof saved.reacting === 'boolean') state.reacting = saved.reacting;
  if (typeof saved.effect === 'string' && ['invert','threshold','dither'].includes(saved.effect)) state.effect = saved.effect;
  if (Number.isFinite(saved.master)) state.master = clamp(saved.master,0,2);
  if (Number.isFinite(saved.bias)) state.bias = clamp(saved.bias,-1,1);
  if (Number.isFinite(saved.threshold)) state.threshold = clamp(saved.threshold,0,1);
  if (Number.isFinite(saved.trackingWidth)) state.trackingWidth = clamp(saved.trackingWidth,160,1280);
} catch {}
let toastTimer, installPrompt, glProgram, texture, posBuffer, lastViewport = '';
const maskCanvas = document.createElement('canvas');

// One tab owns capture and audio. An existing active session answers the probe.
const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('cv0') : null;
if (channel) {
  let replied = false;
  channel.onmessage = ({ data }) => {
    if (data?.type === 'probe' && (state.active || state.starting)) channel.postMessage({ type: 'active' });
    if (data?.type === 'active' && !state.active) { replied = true; state.sessionBlocked = true; showToast('Ctrl-v-0 já está aberto em outra aba'); $('startButton').disabled = true; log('Sessão ativa em outra aba.'); }
    if (data?.type === 'start' && data.id !== tabId) { state.sessionBlocked = true; stopMedia(); $('startButton').disabled = true; showToast('Ctrl-v-0 já está aberto em outra aba'); }
    if (data?.type === 'stop' && data.id !== tabId) { state.sessionBlocked = false; $('startButton').disabled = false; }
  };
  channel.postMessage({ type: 'probe' });
  setTimeout(() => { if (!replied && !state.sessionBlocked) channel.postMessage({ type: 'ready', id: tabId }); }, 180);
}
const tabId = Math.random().toString(36).slice(2);

function log(message) { $('logLine').textContent = message; }
function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function setStatus(text, on = false) { $('statusText').textContent = text; $('statusLight').parentElement.classList.toggle('on', on); }
function toggle(button, on) { button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); }
function savePreferences() { try { localStorage.setItem('cv0-preferences',JSON.stringify({reacting:state.reacting,effect:state.effect,master:state.master,bias:state.bias,threshold:state.threshold,trackingWidth:state.trackingWidth})); } catch {} }

toggle($('reactButton'),state.reacting);
$('motionThreshold').value=String(state.threshold);$('motionValue').textContent=fmt(state.threshold);
$('trackingWidth').value=String(state.trackingWidth);$('trackingValue').textContent=`${state.trackingWidth} px`;
$('master').value=String(state.master);$('masterValue').textContent=fmt(state.master);
$('bias').value=String(state.bias);$('biasValue').textContent=fmt(state.bias);
document.querySelectorAll('[data-effect]').forEach(b=>b.classList.toggle('active',b.dataset.effect===state.effect));

const vertexSource = `#version 300 es
in vec2 aPosition; out vec2 vUv;
void main(){ vUv=(aPosition+1.0)*0.5; gl_Position=vec4(aPosition,0.0,1.0); }`;
const fragmentSource = `#version 300 es
precision highp float; uniform sampler2D uTexture; uniform int uEffect; uniform float uThreshold; uniform float uBias; uniform float uExposure; uniform float uGrowth; uniform float uSpeed; uniform float uTime; uniform float uImageAspect; uniform float uViewportAspect; uniform bool uFlip; uniform bool uMirror; in vec2 vUv; out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 uv=vUv;if(uImageAspect>uViewportAspect)uv.x=(uv.x-.5)*(uViewportAspect/uImageAspect)+.5;else uv.y=(uv.y-.5)*(uImageAspect/uViewportAspect)+.5;if(uMirror)uv.x=1.0-uv.x;if(uFlip)uv.y=1.0-uv.y;vec4 c=texture(uTexture,uv);float l=dot(c.rgb,vec3(.299,.587,.114));float w=clamp(uExposure*.22+uGrowth*.16,0.0,.45);vec3 rgb=clamp(c.rgb*(1.0+w),0.0,1.0);if(uEffect==0){rgb=1.0-rgb;}else if(uEffect==1){float t=clamp(uThreshold+uBias*.14,0.0,1.0);rgb=vec3(step(t,l));}else{float n=hash(floor(gl_FragCoord.xy)+floor(uTime*8.0));float t=clamp(uThreshold+uBias*.14+(n-.5)*.18,0.0,1.0);rgb=vec3(step(t,l));}float pulse=1.0+0.012*sin(uTime*min(8.0,1.0+uSpeed*.02));outColor=vec4(clamp(rgb*pulse,0.0,1.0),1.0);}`;
function shader(type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function initRenderer() {
  if (!gl) { $('renderInfo').textContent = 'WebGL2 indisponível'; return false; }
  try {
    glProgram = gl.createProgram(); gl.attachShader(glProgram, shader(gl.VERTEX_SHADER, vertexSource)); gl.attachShader(glProgram, shader(gl.FRAGMENT_SHADER, fragmentSource)); gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProgram));
    gl.useProgram(glProgram); posBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(glProgram, 'aPosition'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    $('renderInfo').textContent = 'WebGL2 ativo'; return true;
  } catch (e) { log(`Renderizador: ${e.message}`); $('renderInfo').textContent = 'WebGL2 com erro'; return false; }
}
initRenderer();

async function makeAudio() {
  if (state.audio) return;
  if (!('AudioWorkletNode' in window) || !window.isSecureContext) { log('Áudio exige navegador compatível e HTTPS.'); return; }
  try {
    state.audio = new AudioContext({ latencyHint: 'interactive' });
    await state.audio.audioWorklet.addModule('./src/audio-processor.js');
    state.worklet = new AudioWorkletNode(state.audio, 'cv0-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    state.audioGain = state.audio.createGain(); state.audioGain.gain.value = 1;
    state.worklet.connect(state.audioGain).connect(state.audio.destination);
    state.worklet.port.onmessage = ({ data }) => { if (data.type === 'meter') { $('audioReadout').textContent = `WebAudio · ${fmt(data.peak, 3)} pico · ag — · ${data.voices} vozes · ceif — · perd — · ${fmt(data.cost, 2)} ms`; } };
    await state.audio.resume();
  } catch (e) { log(`Áudio indisponível: ${e.message}`); }
}

async function startCamera() {
  if (state.sessionBlocked) { showToast('Ctrl-v-0 já está aberto em outra aba'); return; }
  if (state.active || state.starting) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { log('Abra em HTTPS para liberar câmera e áudio.'); showToast('Câmera precisa de HTTPS'); return; }
  state.starting = true; channel?.postMessage({ type: 'start', id: tabId });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: state.camera }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } } });
    state.stream = stream; video.srcObject = stream; await video.play();
    state.active = true; state.starting = false;
    $('stageMessage').hidden = true; $('switchCamera').disabled = false; setStatus('Sessão ativa', true);
    const track = stream.getVideoTracks()[0]; $('cameraLabel').textContent = track.label || `Câmera ${state.camera === 'environment' ? 'traseira' : 'frontal'}`;
    updateExposureCapability(track); state.background = null; state.priorCentroid = null;
    log('Câmera ativa. O processamento acompanha o movimento da sala.');
    requestAnimationFrame(frame);
  } catch (e) { state.starting = false; channel?.postMessage({type:'stop',id:tabId}); setStatus('Câmera indisponível'); log(`Câmera: ${e.name === 'NotAllowedError' ? 'permissão negada.' : e.message}`); showToast(e.name === 'NotAllowedError' ? 'Permita o acesso à câmera para ligar.' : 'Não foi possível abrir a câmera.'); }
}
async function stopMedia() { state.active = false; state.stream?.getTracks().forEach(t => t.stop()); state.stream = null; if (video.srcObject) video.srcObject = null; }
async function switchCamera() { if (!state.active) return; state.camera = state.camera === 'environment' ? 'user' : 'environment'; await stopMedia(); await startCamera(); }
function updateExposureCapability(track) { const caps = track.getCapabilities?.() || {}; const ok = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual'); $('exposureButton').disabled = !ok; $('exposureHint').textContent = ok ? 'A câmera aceita exposição manual.' : 'Exposição manual não suportada por esta câmera.'; }
async function setManualExposure() { const track = state.stream?.getVideoTracks()[0]; if (!track) return; const caps = track.getCapabilities?.() || {}; if (!Array.isArray(caps.exposureMode) || !caps.exposureMode.includes('manual')) return; try { const settings = track.getSettings?.() || {}; const range = caps.exposureTime; const current = settings.exposureTime ?? range?.min; await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: clamp(current, range?.min ?? 0, range?.max ?? 1) }] }); showToast('Exposição manual aplicada'); } catch (e) { log(`Exposição: ${e.message}`); } }

function resize() {
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const ratio = Math.min(devicePixelRatio || 1, 2); const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (overlayCanvas.width !== w || overlayCanvas.height !== h) { overlayCanvas.width = w; overlayCanvas.height = h; }
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  lastViewport = `${innerWidth}x${innerHeight}:${state.trackingWidth}`;
}
new ResizeObserver(resize).observe(canvas);
window.addEventListener('orientationchange', () => { setTimeout(() => { resize(); if (video.videoWidth) prepareAnalysis(); }, 100); });
function prepareAnalysis() { const w = Math.min(state.trackingWidth, video.videoWidth || state.trackingWidth); const h = Math.max(1, Math.round(w * (video.videoHeight || 1) / (video.videoWidth || 1))); if (analysisCanvas.width !== w || analysisCanvas.height !== h) { analysisCanvas.width = w; analysisCanvas.height = h; state.background = null; } }

function analyze() {
  const t0 = performance.now(); prepareAnalysis(); const w = analysisCanvas.width, h = analysisCanvas.height;
  ctx.drawImage(video, 0, 0, w, h); const image = ctx.getImageData(0, 0, w, h); const pix = image.data; const n = w * h;
  const zones = Array(6).fill(0), zoneTotal = Array(6).fill(0); let changed = 0, lumaSum = 0, cx = 0, cy = 0;
  const mask = new Uint8Array(n), bg = state.background;
  for (let p = 0, i = 0; p < pix.length; p += 4, i++) {
    const l = (pix[p] * .299 + pix[p + 1] * .587 + pix[p + 2] * .114) / 255; lumaSum += l;
    const delta = bg ? Math.abs(l - bg[i]) : 0;
    const moving = delta > state.threshold; if (moving) { mask[i] = 1; changed++; cx += (i % w); cy += Math.floor(i / w); }
    const col = Math.min(2, Math.floor((i % w) * 3 / w)), row = Math.min(1, Math.floor(Math.floor(i / w) * 2 / h)), z = row * 3 + col; zoneTotal[z]++; if (moving) zones[z]++;
  }
  if (!state.background) { state.background = new Float32Array(n); for (let p = 0, i = 0; p < pix.length; p += 4, i++) state.background[i] = (pix[p] * .299 + pix[p + 1] * .587 + pix[p + 2] * .114) / 255; }
  else { const a = .006; for (let p = 0, i = 0; p < pix.length; p += 4, i++) { if (!mask[i]) { const l = (pix[p] * .299 + pix[p + 1] * .587 + pix[p + 2] * .114) / 255; state.background[i] += (l - state.background[i]) * a; } } }
  const energy = changed / n; const density = zoneValuesForDensity(zones, zoneTotal); const centroid = changed ? [cx / changed / w, cy / changed / h] : null;
  const dt = state.lastSignalsAt ? Math.max(.001, (t0 - state.lastSignalsAt) / 1000) : .033; state.lastSignalsAt = t0;
  let speed = 0; if (centroid && state.priorCentroid) speed = clamp(Math.hypot(centroid[0] - state.priorCentroid[0], centroid[1] - state.priorCentroid[1]) / dt / 2); if (centroid) state.priorCentroid = centroid;
  const zoneValues = zones.map((v, i) => zoneTotal[i] ? v / zoneTotal[i] : 0); const mean = zoneValues.reduce((a,b)=>a+b,0)/6; const variance = zoneValues.reduce((a,b)=>a+(b-mean)**2,0)/6; const coherence = mean ? clamp(1 - Math.sqrt(variance) / (mean + .0001)) : 0;
  const ambient = lumaSum / n; const raw = { energy: clamp(energy * 5), density: clamp(density * 5), speed, coherence, ambient: clamp(ambient), zones: zoneValues.map(v=>clamp(v * 5)) };
  const t1 = performance.now(); state.timing.tracking = t1 - t0; state.timing.bus = t1 - t0; state.timing.camera = null;
  return { raw, mask, w, h, dt };
}
function followEnvelope(current, target, dt, attack=.06, decay=.45) { const tau = target > current ? attack : decay; return current + (target - current) * (1 - Math.exp(-dt / tau)); }
function zoneValuesForDensity(zones, totals) { let occupied=0; for(let i=0;i<6;i++) if(totals[i] && zones[i]/totals[i] > 0) occupied++; return occupied/6; }
function updateSignals(raw, dt) {
  const e = state.envelopes;
  for (const key of ['energy','density','speed','coherence','ambient']) e[key] = followEnvelope(e[key], raw[key], dt);
  e.zones = e.zones.map((v,i)=>followEnvelope(v,raw.zones[i],dt,.06,.9));
  const m = state.reacting ? state.master : 0;
  const applied = { exposure:m*state.gains.exposure*e.energy, grow:m*state.gains.grow*(.6*e.density+.4*e.speed), threshold:m*state.gains.threshold*e.coherence, dither:m*state.gains.dither*e.speed, speed:m*state.gains.speed*e.energy };
  state.lastSignal = { ...e, applied };
  state.worklet?.port.postMessage({ type:'signals', signals:{...e,zones:[...e.zones]}, master:m, muted:state.muted });
  return applied;
}
function render(applied) {
  if (!gl || !glProgram || !video.videoWidth) return;
  const t0 = performance.now(); resize(); gl.useProgram(glProgram); gl.bindTexture(gl.TEXTURE_2D,texture);
  try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video); } catch { return; }
  const uniform=(name,val)=>gl.uniform1f(gl.getUniformLocation(glProgram,name),val);
  gl.uniform1i(gl.getUniformLocation(glProgram,'uTexture'),0); gl.uniform1i(gl.getUniformLocation(glProgram,'uEffect'),({invert:0,threshold:1,dither:2})[state.effect]);
  uniform('uThreshold',.5+applied.threshold); uniform('uBias',state.bias); uniform('uExposure',applied.exposure); uniform('uGrowth',applied.grow); uniform('uSpeed',applied.speed); uniform('uTime',performance.now()/1000); uniform('uImageAspect',video.videoWidth/video.videoHeight); uniform('uViewportAspect',canvas.width/canvas.height);
  gl.uniform1i(gl.getUniformLocation(glProgram,'uMirror'),state.camera==='user'?1:0);gl.uniform1i(gl.getUniformLocation(glProgram,'uFlip'),state.flip?1:0); gl.drawArrays(gl.TRIANGLE_STRIP,0,4); state.timing.cycle=performance.now()-t0;
}
function drawMaskOverlay(result) {
  const c=overlayCanvas.getContext('2d'); if(!c)return; const rect=overlayCanvas.getBoundingClientRect(); c.clearRect(0,0,overlayCanvas.width,overlayCanvas.height); if(!state.showMask&&!state.overlay)return; c.save(); c.scale(Math.min(devicePixelRatio||1,2),Math.min(devicePixelRatio||1,2));
  if(state.showMask){const small=maskCanvas;small.width=result.w;small.height=result.h;const s=small.getContext('2d');const im=s.createImageData(result.w,result.h);for(let i=0;i<result.mask.length;i++){const q=i*4;const v=result.mask[i]?255:0;im.data[q]=v;im.data[q+1]=v;im.data[q+2]=v;im.data[q+3]=255;}s.putImageData(im,0,0);const targetAspect=rect.width/rect.height,sourceAspect=result.w/result.h;let sx=0,sy=0,sw=result.w,sh=result.h;if(sourceAspect>targetAspect){sw=result.h*targetAspect;sx=(result.w-sw)/2;}else{sh=result.w/targetAspect;sy=(result.h-sh)/2;}c.globalAlpha=.7;c.drawImage(small,sx,sy,sw,sh,0,0,rect.width,rect.height);}
  if(state.overlay && state.lastSignal){c.globalAlpha=.9;c.lineWidth=1;c.strokeStyle='#6ee7bc';c.fillStyle='#6ee7bc';const cw=rect.width/3,ch=rect.height/2;for(let i=0;i<6;i++){const x=(i%3)*cw,y=Math.floor(i/3)*ch;c.strokeRect(x+4,y+4,cw-8,ch-8);c.font='10px monospace';c.fillText(`${String(i+1).padStart(2,'0')} ${Math.round(state.lastSignal.zones[i]*100)}%`,x+10,y+18);}}
  if(state.overlay){c.globalAlpha=.95;c.strokeStyle='#b9a1ff';c.lineWidth=2;for(const r of [...state.manualRects,...(state.dragRect?[state.dragRect]:[])])c.strokeRect(r.x*rect.width,r.y*rect.height,r.w*rect.width,r.h*rect.height);}
  c.restore();
}
function updateHud(raw, applied, result) {
  for(const k of ['energy','density','speed','coherence','ambient']){$(`signal-${k}`).textContent=`${Math.round(state.envelopes[k]*100)}%`;$(`bar-${k}`).style.width=`${state.envelopes[k]*100}%`;}
  document.querySelectorAll('.zone').forEach((el,i)=>{const v=state.envelopes.zones[i];el.querySelector('b').textContent=`${Math.round(v*100)}%`;el.style.background=`linear-gradient(90deg,#15372d ${Math.min(100,v*100)}%,#141a23 ${Math.min(100,v*100)}%)`;});
  $('measureStamp').textContent=`${Math.round(1/Math.max(result.dt,.001))} fps`;
  const ms=x=>Number.isFinite(x)?x.toFixed(1):'—'; $('timeReadout').textContent=`${ms(state.timing.camera)} · ${ms(state.timing.tracking)} · ${ms(state.timing.cycle)} ms`; $('busReadout').textContent=`${ms(state.timing.bus)} ms`;
  const rows=[applied.exposure,applied.grow,applied.threshold,applied.dither,applied.speed];document.querySelectorAll('#gainList b').forEach((el,i)=>el.textContent=fmt(rows[i],2));
  $('frameInfo').textContent=`${result.w}×${result.h} rastreio`;
}
function frame(now) {
  if(!state.active)return;
  const cameraStart=performance.now();
  if(video.readyState>=2 && now-state.lastFrame>15){state.lastFrame=now;const result=analyze();const applied=updateSignals(result.raw,result.dt);render(applied);drawMaskOverlay(result);updateHud(result.raw,applied,result);}
  requestAnimationFrame(frame);
}

$('startButton').addEventListener('click', async () => {
  if(state.sessionBlocked)return;
  const audioPromise = makeAudio();
  try { if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(()=>{}); } catch {}
  try { if('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch {}
  await audioPromise; if(state.audio?.state==='suspended') await state.audio.resume().catch(()=>{});
  await startCamera();
});
$('switchCamera').addEventListener('click',switchCamera);$('exposureButton').addEventListener('click',setManualExposure);
document.querySelectorAll('[data-effect]').forEach(b=>b.addEventListener('click',()=>{if(state.effect===b.dataset.effect)return;state.effect=b.dataset.effect;document.querySelectorAll('[data-effect]').forEach(x=>x.classList.toggle('active',x===b));savePreferences();}));
$('motionThreshold').addEventListener('input',e=>{state.threshold=Number(e.target.value);$('motionValue').textContent=fmt(state.threshold);savePreferences();});
$('trackingWidth').addEventListener('input',e=>{state.trackingWidth=Number(e.target.value);$('trackingValue').textContent=`${state.trackingWidth} px`;state.background=null;savePreferences();});
$('master').addEventListener('input',e=>{state.master=Number(e.target.value);$('masterValue').textContent=fmt(state.master);savePreferences();});
$('bias').addEventListener('input',e=>{state.bias=Number(e.target.value);$('biasValue').textContent=fmt(state.bias);savePreferences();});
$('masterDown').addEventListener('click',()=>{state.master=clamp(state.master-.25,0,2);$('master').value=String(state.master);$('masterValue').textContent=fmt(state.master);savePreferences();});$('masterUp').addEventListener('click',()=>{state.master=clamp(state.master+.25,0,2);$('master').value=String(state.master);$('masterValue').textContent=fmt(state.master);savePreferences();});
$('reactButton').addEventListener('click',e=>{state.reacting=!state.reacting;toggle(e.currentTarget,state.reacting);savePreferences();});
$('muteButton').addEventListener('click',e=>{state.muted=!state.muted;toggle(e.currentTarget,state.muted);if(state.audioGain&&state.audio){const t=state.audio.currentTime;state.audioGain.gain.cancelScheduledValues(t);state.audioGain.gain.setTargetAtTime(state.muted?0:1,t,.12);}state.worklet?.port.postMessage({type:'mute',muted:state.muted});});
$('flipButton').addEventListener('click',e=>{state.flip=!state.flip;toggle(e.currentTarget,state.flip);});$('overlayButton').addEventListener('click',e=>{state.overlay=!state.overlay;toggle(e.currentTarget,state.overlay);});$('maskButton').addEventListener('click',e=>{state.showMask=!state.showMask;toggle(e.currentTarget,state.showMask);});
$('backgroundButton').addEventListener('click',()=>{state.background=null;showToast('Fundo refeito');});$('reseedButton').addEventListener('click',()=>{state.priorCentroid=null;state.background=null;showToast('Rastreio reiniciado');});$('rectangleButton').addEventListener('click',()=>{state.drawingRect=!state.drawingRect;showToast(state.drawingRect?'Arraste no palco para criar o retângulo':'Criação cancelada');});
function adjustTracking(delta){const next=clamp(state.trackingWidth+delta,160,1280);if(next===state.trackingWidth)return;state.trackingWidth=next;$('trackingWidth').value=String(next);$('trackingValue').textContent=`${next} px`;state.background=null;}
$('trackDown').addEventListener('click',()=>adjustTracking(-160));$('trackUp').addEventListener('click',()=>adjustTracking(160));
$('captureButton').addEventListener('click',()=>{if(!canvas.width)return;try{const shot=document.createElement('canvas');shot.width=canvas.width;shot.height=canvas.height;const c=shot.getContext('2d');c.drawImage(canvas,0,0);c.drawImage(overlayCanvas,0,0);const a=document.createElement('a');a.download=`cv0_${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.href=shot.toDataURL('image/png');a.click();}catch(e){showToast(`Captura: ${e.message}`);}});
document.querySelectorAll('.tab-button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab-button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.panel));}));
let touchStartY=0;const stage=$('stage');stage.addEventListener('touchstart',e=>{if(e.target===canvas||e.target===overlayCanvas)touchStartY=e.changedTouches[0].clientY;},{passive:true});stage.addEventListener('touchend',e=>{if(e.target!==canvas&&e.target!==overlayCanvas)return;const dy=e.changedTouches[0].clientY-touchStartY;if(!state.drawingRect&&Math.abs(dy)>65)switchCamera();},{passive:true});
overlayCanvas.addEventListener('pointerdown',e=>{if(!state.drawingRect)return;const r=overlayCanvas.getBoundingClientRect();state.dragRect={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,w:0,h:0};overlayCanvas.setPointerCapture(e.pointerId);});
overlayCanvas.addEventListener('pointermove',e=>{if(!state.dragRect)return;const r=overlayCanvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;state.dragRect={x:Math.min(x,state.dragRect.x),y:Math.min(y,state.dragRect.y),w:Math.abs(x-state.dragRect.x),h:Math.abs(y-state.dragRect.y)};});
overlayCanvas.addEventListener('pointerup',()=>{if(state.dragRect){if(state.dragRect.w>.015&&state.dragRect.h>.015)state.manualRects.push(state.dragRect);state.dragRect=null;state.drawingRect=false;}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installButton').hidden=false;});$('installButton').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installButton').hidden=true;});
if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(e=>log(`Offline: ${e.message}`));

