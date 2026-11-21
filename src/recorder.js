const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const DEFAULT_MAX_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_MAX_BYTES = 350 * 1024 * 1024;
const MEMORY_LIMIT_BYTES = 500 * 1024 * 1024;

function supportedRecordingMimeTypes(MediaRecorderClass) {
  if (typeof MediaRecorderClass !== 'function' || typeof MediaRecorderClass.isTypeSupported !== 'function') return null;
  return MIME_TYPES.filter(type => MediaRecorderClass.isTypeSupported(type));
}

export function selectRecordingMimeType(MediaRecorderClass = globalThis.MediaRecorder) {
  return supportedRecordingMimeTypes(MediaRecorderClass)?.[0] || null;
}

export function recordingExtension(mimeType) {
  return mimeType?.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

export function createRecorder({
  canvas,
  fps = 30,
  getAudioStream = () => null,
  MediaRecorderClass = globalThis.MediaRecorder,
  MediaStreamClass = globalThis.MediaStream,
  URLClass = globalThis.URL,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  getMemoryUsage = () => globalThis.performance?.memory?.usedJSHeapSize ?? null,
} = {}) {
  let state = 'idle';
  let recorder = null;
  let mediaStream = null;
  let canvasStream = null;
  let videoTracks = [];
  let clonedAudioTracks = [];
  let chunks = [];
  let listeners = new Set();
  let errorListeners = new Set();
  let timer = null;
  let stopPromise = null;
  let resolveStop = null;
  let rejectStop = null;
  let mimeType = '';
  let totalBytes = 0;
  let startedAt = 0;
  let elapsedBeforeStart = 0;
  let finalDurationMs = 0;
  let lastReportedSecond = -1;
  let maxDurationMs = DEFAULT_MAX_DURATION_MS;
  let maxBytes = DEFAULT_MAX_BYTES;
  let stopReason = null;
  let lastError = null;
  let lastResult = null;
  let isDisposed = false;

  function isSupported() {
    return !isDisposed
      && typeof canvas?.captureStream === 'function'
      && typeof MediaStreamClass === 'function'
      && selectRecordingMimeType(MediaRecorderClass) !== null;
  }

  function elapsed() {
    if (state === 'paused' || state === 'stopping' || state === 'idle') return finalDurationMs || elapsedBeforeStart;
    return elapsedBeforeStart + Math.max(0, now() - startedAt);
  }

  function snapshot() {
    return {
      state,
      durationMs: elapsed(),
      bytes: totalBytes,
      mimeType,
      reason: stopReason,
      error: lastError,
      result: lastResult,
    };
  }

  function emitState() {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  }

  function emitError(error) {
    for (const listener of errorListeners) listener(error);
  }

  function setState(next) {
    state = next;
    emitState();
  }

  function clearTimer() {
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
  }

  function releaseTracks() {
    for (const track of videoTracks) track.stop();
    for (const track of clonedAudioTracks) track.stop();
    videoTracks = [];
    clonedAudioTracks = [];
    mediaStream = null;
    canvasStream = null;
  }

  function cleanup() {
    clearTimer();
    releaseTracks();
    recorder = null;
  }

  function finish() {
    const durationMs = state === 'stopping' ? finalDurationMs : elapsed();
    finalDurationMs = durationMs;
    if (state !== 'stopping' && state !== 'idle') stopReason = stopReason || 'ended';
    const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
    let url = null;
    if (blob && typeof URLClass?.createObjectURL === 'function') {
      try {
        url = URLClass.createObjectURL(blob);
      } catch (error) {
        lastError = error;
        emitError(error);
      }
    }
    lastResult = blob ? {
      blob,
      url,
      durationMs,
      mimeType,
      bytes: totalBytes,
      extension: recordingExtension(mimeType),
      reason: stopReason,
    } : null;
    cleanup();
    setState('idle');
    const resolve = resolveStop;
    resolveStop = null;
    rejectStop = null;
    stopPromise = null;
    if (resolve) resolve(lastResult);
  }

  function rejectStopWith(error) {
    cleanup();
    setState('idle');
    const reject = rejectStop;
    resolveStop = null;
    rejectStop = null;
    stopPromise = null;
    if (reject) reject(error);
  }

  function stop(reason = null) {
    if (state === 'idle') return Promise.resolve(lastResult);
    if (state === 'stopping') return stopPromise;
    stopReason = reason || stopReason;
    finalDurationMs = elapsed();
    clearTimer();
    setState('stopping');
    const pending = new Promise((resolve, reject) => {
      resolveStop = resolve;
      rejectStop = reject;
    });
    stopPromise = pending;
    try {
      if (!recorder || recorder.state === 'inactive') finish();
      else recorder.stop();
    } catch (error) {
      lastError = error;
      emitError(error);
      if (chunks.length) finish();
      else rejectStopWith(error);
    }
    return pending;
  }

  function onDataAvailable(event) {
    if (!event.data || event.data.size === 0) return;
    chunks.push(event.data);
    totalBytes += event.data.size;
    emitState();
    if (totalBytes >= maxBytes && state !== 'idle' && state !== 'stopping') {
      void stop('max-bytes');
    }
  }

  function onRecorderError(event) {
    const error = event.error || new Error('Falha durante a gravação.');
    lastError = error;
    stopReason = 'error';
    emitError(error);
    if (state !== 'stopping' && state !== 'idle') void stop('error');
  }

  function start({
    audioStream = null,
    maxDurationMs: durationLimit = DEFAULT_MAX_DURATION_MS,
    maxBytes: byteLimit = DEFAULT_MAX_BYTES,
    videoBitsPerSecond = null,
    audioBitsPerSecond = 128_000,
  } = {}) {
    if (isDisposed) throw new Error('O gravador já foi liberado.');
    if (state !== 'idle') throw new Error('Já existe uma gravação em andamento.');
    if (!isSupported()) throw new Error('Gravação não suportada neste navegador.');
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('A taxa de quadros deve ser maior que zero.');
    if (!Number.isFinite(durationLimit) || durationLimit <= 0) throw new RangeError('A duração máxima deve ser maior que zero.');
    if (!Number.isFinite(byteLimit) || byteLimit <= 0) throw new RangeError('O limite de bytes deve ser maior que zero.');

    maxDurationMs = durationLimit;
    maxBytes = byteLimit;
    chunks = [];
    totalBytes = 0;
    elapsedBeforeStart = 0;
    finalDurationMs = 0;
    lastReportedSecond = -1;
    stopReason = null;
    lastError = null;
    lastResult = null;

    try {
      const supportedTypes = supportedRecordingMimeTypes(MediaRecorderClass);
      if (!supportedTypes?.length) throw new Error('Gravação não suportada neste navegador.');
      canvasStream = canvas.captureStream(fps);
      videoTracks = canvasStream.getVideoTracks();
      if (!videoTracks.length) throw new Error('O canvas não forneceu faixa de vídeo.');

      const tracks = [...videoTracks];
      const sourceAudioTracks = (audioStream || getAudioStream())?.getAudioTracks?.() || [];
      for (const track of sourceAudioTracks) {
        if (typeof track.clone === 'function') {
          const clone = track.clone();
          clonedAudioTracks.push(clone);
          tracks.push(clone);
        }
      }
      mediaStream = new MediaStreamClass(tracks);

      const options = { audioBitsPerSecond };
      if (Number.isFinite(videoBitsPerSecond) && videoBitsPerSecond > 0) options.videoBitsPerSecond = videoBitsPerSecond;
      let constructionError = null;
      for (const type of supportedTypes) {
        try {
          recorder = new MediaRecorderClass(mediaStream, { ...options, mimeType: type });
          mimeType = recorder.mimeType || type;
          break;
        } catch (error) {
          if (!['NotSupportedError', 'TypeError'].includes(error.name)) throw error;
          constructionError = error;
        }
      }
      if (!recorder) throw constructionError || new Error('Não foi possível iniciar um formato de gravação compatível.');
      recorder.ondataavailable = onDataAvailable;
      recorder.onerror = onRecorderError;
      recorder.onstop = finish;
      recorder.start(1000);
      startedAt = now();
      setState('recording');
      timer = setIntervalFn(() => {
        if (state !== 'recording') return;
        const durationMs = elapsed();
        const currentSecond = Math.floor(durationMs / 1000);
        if (currentSecond !== lastReportedSecond) {
          lastReportedSecond = currentSecond;
          emitState();
        }
        if (durationMs >= maxDurationMs) {
          void stop('max-duration');
          return;
        }
        const memoryUsage = getMemoryUsage();
        if (Number.isFinite(memoryUsage) && memoryUsage > MEMORY_LIMIT_BYTES) void stop('memory-limit');
      }, 250);
      return { mimeType, extension: recordingExtension(mimeType), includesAudio: clonedAudioTracks.length > 0 };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  function pause() {
    if (state !== 'recording' || !recorder) return false;
    recorder.pause();
    elapsedBeforeStart = elapsed();
    finalDurationMs = elapsedBeforeStart;
    setState('paused');
    return true;
  }

  function resume() {
    if (state !== 'paused' || !recorder) return false;
    recorder.resume();
    startedAt = now();
    finalDurationMs = 0;
    setState('recording');
    return true;
  }

  function onState(listener) {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function onError(listener) {
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  }

  async function dispose() {
    if (state !== 'idle') await stop('disposed');
    cleanup();
    isDisposed = true;
    listeners.clear();
    errorListeners.clear();
  }

  return {
    isSupported,
    start,
    stop,
    pause,
    resume,
    onState,
    onError,
    dispose,
  };
}
