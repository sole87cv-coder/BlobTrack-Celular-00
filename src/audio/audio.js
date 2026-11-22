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
        outputChannelCount: [1],
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
