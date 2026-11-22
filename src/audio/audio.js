export const PRESETS = Object.freeze({
  'easy-mallet': Object.freeze({ name: 'Mallet', voices: 8, style: 'plucked' }),
  'fun-pulse': Object.freeze({ name: 'Pulso', voices: 16, style: 'drum' }),
  'float-chords': Object.freeze({ name: 'Flutuação', voices: 16, style: 'pad' }),
});
const AUDIO_SCALE = Object.freeze([0, 3, 7, 12, 15, 19]);
const audioClamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function SpawnPolicy(preset, signals = {}, history = {}) {
  const time = audioClamp(signals.time, 0, Number.MAX_SAFE_INTEGER);
  const blobs = Array.isArray(signals.blobs) ? signals.blobs : [];
  const commands = [];
  let nextHistory = { ...history };

  if (preset === 'easy-mallet') {
    const previous = history.blobs || {};
    const current = {};
    for (const blob of blobs) {
      if (!blob || blob.id === undefined || !Number.isFinite(blob.x) || !Number.isFinite(blob.y)) continue;
      const id = String(blob.id);
      const x = audioClamp(blob.x, 0, 1), y = audioClamp(blob.y, 0, 1);
      const old = previous[id];
      if (!old) { current[id] = { x, y, nextAt: time }; continue; }
      const distance = Math.hypot(x - old.x, y - old.y);
      const speed = audioClamp(blob.speed, 0, 1);
      const interval = 1 / (4 + speed * 12);
      if (distance >= .3 && time >= old.nextAt) {
        const degree = AUDIO_SCALE[Math.round(x * (AUDIO_SCALE.length - 1))];
        const octave = Math.round((.5 - y) * 4);
        const base = audioClamp(signals.key, 0, 11);
        const semitones = degree + octave * 12 + base;
        const area = Math.max(1, Number(blob.size) || 1);
        const size = audioClamp(Math.log2(area) / 12, 0, 1);
        commands.push({ type: 'note', id: blob.id, frequency: 130.8128 * Math.pow(2, semitones / 12), pan: x * 2 - 1, velocity: .35 + .45 * audioClamp(blob.speed, 0, 1), decay: .08 + size * .52, filterHz: 400 + audioClamp(signals.energy, 0, 1) * 7600 });
        current[id] = { x, y, nextAt: time + interval };
      } else current[id] = { x: old.x, y: old.y, nextAt: old.nextAt };
    }
    for (const id of Object.keys(previous)) if (!current[id]) commands.push({ type: 'release', id });
    nextHistory = { ...history, blobs: current };
    return { commands: commands.slice(0, PRESETS['easy-mallet'].voices), history: nextHistory };
  }

  if (preset === 'fun-pulse') {
    const energy = audioClamp(signals.energy, 0, 1);
    const bpm = 70 * Math.pow(2, energy);
    const stepDuration = 60 / bpm / 4;
    const active = blobs.length > 0 || audioClamp(signals.speed, 0, 1) > .02;
    const wasActive = history.wasActive === true;
    let step = Number.isInteger(history.step) ? history.step : 0;
    let nextStepAt = Number.isFinite(history.nextStepAt) ? history.nextStepAt : time;
    if (active && !wasActive) {
      commands.push({ type: 'kick', velocity: .6 + energy * .35, pan: 0, decay: .3 });
      nextStepAt = time + stepDuration;
      step = 1;
    } else if (active && time >= nextStepAt) {
      const zones = Array.isArray(signals.zones) ? signals.zones : [];
      const density = audioClamp(signals.density, 0, 1);
      const speed = audioClamp(signals.speed, 0, 1);
      if (step % 4 === 0 && (audioClamp(zones[0], 0, 1) > .08 || audioClamp(zones[1], 0, 1) > .08 || blobs.length > 0)) commands.push({ type: 'kick', velocity: .45 + energy * .45, pan: -.15, decay: .28 });
      if (step % 8 === 4 && (audioClamp(zones[4], 0, 1) > .08 || audioClamp(zones[5], 0, 1) > .08) && density > .1) commands.push({ type: 'clap', velocity: .25 + density * .6, pan: .15, decay: .22 });
      const probability = speed * Math.min(1, .25 + density);
      const roll = ((step * 1103515245 + 12345) >>> 16) / 65535;
      if (roll < probability) commands.push({ type: 'bass', frequency: 55 * Math.pow(2, Math.round(audioClamp(signals.key, 0, 11) / 12)), velocity: .3 + speed * .5, pan: 0, decay: .2 });
      const swing = audioClamp(signals.coherence, 0, 1) * .3;
      nextStepAt = time + stepDuration * (step % 2 ? 1 + swing : 1 - swing);
      step++;
    }
    if (!active && wasActive) commands.push({ type: 'releaseAll', release: 1.5 });
    nextHistory = { ...history, step, nextStepAt, wasActive: active, bpm, lastActiveAt: active ? time : history.lastActiveAt };
    return { commands: commands.slice(0, 4), history: nextHistory, bpm };
  }

  if (preset === 'float-chords') {
    const energy = audioClamp(signals.energy, 0, 1);
    const coherence = audioClamp(signals.coherence, 0, 1);
    const highest = blobs.reduce((top, blob) => !top || blob.y < top.y ? blob : top, null);
    const root = highest ? AUDIO_SCALE[Math.round(audioClamp(highest.x, 0, 1) * (AUDIO_SCALE.length - 1))] : 0;
    const changedQuickly = Number.isFinite(history.energy) && time - history.energyAt <= .2 && Math.abs(energy - history.energy) > .15;
    const initialChord = !history.initialized && blobs.length > 0;
    const chordChanged = root !== history.root;
    if (initialChord || (chordChanged && changedQuickly)) {
      const intervals = coherence < .3 ? [0, 2, 9, 19] : [0, 3, 7, 10];
      const y = highest ? audioClamp(highest.y, 0, 1) : .5;
      const octave = Math.round((.5 - y) * 2);
      const key = audioClamp(signals.key, 0, 11);
      const size = blobs.reduce((max, blob) => Math.max(max, Number(blob.size) || 1), 1);
      commands.push({ type: 'chord', root, chaotic: coherence < .3, notes: intervals.map(interval => 130.8128 * Math.pow(2, (root + key + octave * 12 + interval) / 12)), pan: highest ? audioClamp(highest.x, 0, 1) * 2 - 1 : 0, wet: .2 + audioClamp(Math.log2(size) / 12, 0, 1) * .6, filterHz: 400 + energy * 7600, velocity: .12 + energy * .28 });
    }
    const nextHistoryState = { ...history, root, energy, energyAt: time, initialized: history.initialized || blobs.length > 0 };
    if (!signals.reducedSound && energy > .45 && coherence > .55 && time >= (history.nextShimmerAt || 0)) {
      commands.push({ type: 'shimmer', frequency: 880 * Math.pow(2, root / 12), velocity: .08 });
      nextHistoryState.nextShimmerAt = time + 8;
    }
    return { commands, history: nextHistoryState };
  }

  return { commands: [], history: nextHistory };
}
export function createAudioBus({
  getPort,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle),
} = {}) {
  let latestSignals = null;
  let frameHandle = null;
  let pendingOptions = null;
  let optionsTimer = null;
  let pendingMessage = null;
  let messageTimer = null;
  let lastOptions = null;

  const post = message => {
    const port = getPort?.();
    if (!port || typeof port.postMessage !== 'function') return false;
    port.postMessage(message);
    return true;
  };
  const sameOptions = (a, b) => Boolean(a && b
    && a.oscillation === b.oscillation && a.pitchRange === b.pitchRange
    && a.key === b.key && a.timbre === b.timbre
    && a.soundEffects?.echo === b.soundEffects?.echo
    && a.soundEffects?.space === b.soundEffects?.space
    && a.soundEffects?.chorus === b.soundEffects?.chorus);
  const sendOptions = options => {
    const snapshot = { ...options, soundEffects: { ...options.soundEffects } };
    if (sameOptions(lastOptions, snapshot)) return false;
    const sent = post({ type: 'sound', ...snapshot });
    if (sent) lastOptions = snapshot;
    return sent;
  };

  return {
    queueSignals(message) {
      latestSignals = message;
      if (frameHandle !== null) return;
      frameHandle = requestFrame(() => {
        frameHandle = null;
        const latest = latestSignals;
        latestSignals = null;
        if (latest) post(latest);
      });
    },
    sendOptions,
    scheduleOptions(options, delay = 80) {
      pendingOptions = { ...options, soundEffects: { ...options.soundEffects } };
      if (optionsTimer !== null) clearTimer(optionsTimer);
      optionsTimer = setTimer(() => {
        optionsTimer = null;
        const latest = pendingOptions;
        pendingOptions = null;
        if (latest) sendOptions(latest);
      }, delay);
    },
    send(message) { return post(message); },
    scheduleMessage(message, delay = 80) {
      pendingMessage = message;
      if (messageTimer !== null) clearTimer(messageTimer);
      messageTimer = setTimer(() => {
        messageTimer = null;
        const latest = pendingMessage;
        pendingMessage = null;
        if (latest) post(latest);
      }, delay);
    },
    flush() {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      const latest = latestSignals;
      latestSignals = null;
      if (latest) post(latest);
      if (optionsTimer !== null) clearTimer(optionsTimer);
      optionsTimer = null;
      if (pendingOptions) sendOptions(pendingOptions);
      pendingOptions = null;
      if (messageTimer !== null) clearTimer(messageTimer);
      messageTimer = null;
      if (pendingMessage) post(pendingMessage);
      pendingMessage = null;
    },
  };
}
export function createAudio({
  state,
  log,
  showToast,
  sendAudioOptions,
  fmt,
  onMeter,
}) {
  async function makeAudio() {
    if (state.audio) return;
    if (!('AudioWorkletNode' in globalThis) || !globalThis.isSecureContext) {
      log('Áudio exige navegador compatível e HTTPS.');
      showToast('Áudio precisa de navegador compatível e HTTPS');
      return;
    }
    try {
      state.audio = new AudioContext({ latencyHint: 'interactive' });
      await state.audio.audioWorklet.addModule('./src/audio-processor.js');
      state.worklet = new AudioWorkletNode(state.audio, 'blobtrack-audio', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      state.audioGain = state.audio.createGain();
      state.audioGain.gain.value = 1;
      state.worklet.connect(state.audioGain).connect(state.audio.destination);
      state.worklet.port.onmessage = ({ data }) => {
        if (data.type === 'meter' && typeof onMeter === 'function') {
          onMeter(data.peak, data.voices, data.cost);
        }
      };
      sendAudioOptions();
      await state.audio.resume();
    } catch (e) {
      log(`Áudio indisponível: ${e.message}`);
      showToast('Não foi possível iniciar o áudio');
    }
  }

  function connectRecordingAudio() {
    if (!state.audio || !state.audioGain || typeof state.audio.createMediaStreamDestination !== 'function') return null;
    if (state.recordAudioDestination) return state.recordAudioDestination;
    const destination = state.audio.createMediaStreamDestination();
    state.audioGain.connect(destination);
    state.recordAudioDestination = destination;
    return destination;
  }

  function disconnectRecordingAudio(destination = state.recordAudioDestination) {
    if (!destination) return;
    try {
      state.audioGain?.disconnect(destination);
    } finally {
      for (const track of destination.stream.getAudioTracks()) track.stop();
      if (state.recordAudioDestination === destination) state.recordAudioDestination = null;
    }
  }

  async function ensureAudioAlive() {
    if (!state.active) return;
    try {
      if (!state.audio) { await makeAudio(); return; }
      if (state.audio.state === 'suspended' || state.audio.state === 'interrupted') {
        await state.audio.resume();
        if (state.audioGain && state.audio) {
          const t = state.audio.currentTime;
          state.audioGain.gain.cancelScheduledValues(t);
          state.audioGain.gain.setTargetAtTime(state.muted ? 0 : 1, t, .12);
        }
      }
    } catch (e) {
      log(`Áudio: retomada falhou (${e.message})`);
    }
  }

  async function watchAudio() {
    while (state.active) {
      await ensureAudioAlive();
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  function handleAudioInterruption() {
    if (!state.audio || state.audioHandlersRegistered) return;
    state.audioHandlersRegistered = true;
    state.audio.addEventListener('statechange', () => {
      if (state.active && state.audio.state !== 'running') ensureAudioAlive();
    });
    state.audio.addEventListener('interrupted', () => ensureAudioAlive());
  }

  return { makeAudio, connectRecordingAudio, disconnectRecordingAudio, ensureAudioAlive, watchAudio, handleAudioInterruption };
}
