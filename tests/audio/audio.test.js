import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudio } from '../../src/audio/audio.js';

function makeState(overrides = {}) {
  return {
    audio: null,
    worklet: null,
    audioGain: null,
    recordAudioDestination: null,
    active: true,
    muted: false,
    audioHandlersRegistered: false,
    ...overrides,
  };
}

class FakeGain {
  constructor() {
    this.gain = { value: 1, cancelScheduledValues: () => {}, setTargetAtTime: () => {} };
    this._destinations = [];
  }
  connect(dest) { this._destinations.push(dest); }
  disconnect(dest) {
    const i = this._destinations.indexOf(dest);
    if (i >= 0) this._destinations.splice(i, 1);
  }
}

class FakeAudioDestination {
  constructor() {
    this.stream = { getAudioTracks: () => [{ stop: () => {} }] };
  }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.audioWorklet = { addModule: async () => {} };
    this.createGain = () => new FakeGain();
    this.createMediaStreamDestination = () => new FakeAudioDestination();
    this.resume = async () => { this.state = 'running'; };
    this.addEventListener = () => {};
    this.suspend = async () => {};
  }
}

class FakeAudioWorkletNode {
  constructor(ctx, name, opts) {
    this.port = { onmessage: null, postMessage: () => {} };
    this.connect = (dest) => dest;
  }
}

function setupAudioGlobals() {
  const origAudioContext = globalThis.AudioContext;
  const origAudioWorkletNode = globalThis.AudioWorkletNode;
  const origSecure = globalThis.isSecureContext;
  globalThis.AudioContext = FakeAudioContext;
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  globalThis.isSecureContext = true;
  return () => {
    globalThis.AudioContext = origAudioContext;
    globalThis.AudioWorkletNode = origAudioWorkletNode;
    globalThis.isSecureContext = origSecure;
  };
}

test('makeAudio initializes AudioContext and worklet', async (t) => {
  const restore = setupAudioGlobals();
  const origSecure = globalThis.isSecureContext;
  globalThis.isSecureContext = true;
  try {
    const state = makeState();
    const logMessages = [];
    const toastMessages = [];
    let optionsSent = null;
    const audio = createAudio({
      state,
      log: (m) => logMessages.push(m),
      showToast: (m) => toastMessages.push(m),
      sendAudioOptions: (opts) => { optionsSent = opts; },
      fmt: (v, d) => Number.isFinite(v) ? v.toFixed(d ?? 2).replace('.', ',') : '—',
      onMeter: () => {},
    });
    await audio.makeAudio();
    assert.ok(state.audio);
    assert.ok(state.worklet);
    assert.ok(state.audioGain);
    assert.equal(logMessages.length, 0);
    assert.equal(toastMessages.length, 0);
  } finally {
    restore();
    globalThis.isSecureContext = origSecure;
  }
});

test('makeAudio skips if AudioWorkletNode not available', async (t) => {
  const origWorklet = globalThis.AudioWorkletNode;
  const origSecure = globalThis.isSecureContext;
  delete globalThis.AudioWorkletNode;
  globalThis.isSecureContext = true;
  try {
    const state = makeState();
    const logMessages = [];
    const toastMessages = [];
    const audio = createAudio({
      state,
      log: (m) => logMessages.push(m),
      showToast: (m) => toastMessages.push(m),
      sendAudioOptions: () => {},
      fmt: (v) => String(v),
      onMeter: () => {},
    });
    await audio.makeAudio();
    assert.equal(state.audio, null);
    assert.equal(toastMessages.length, 1);
    assert.ok(toastMessages[0].includes('navegador compatível'));
  } finally {
    globalThis.AudioWorkletNode = origWorklet;
    globalThis.isSecureContext = origSecure;
  }
});

test('connectRecordingAudio creates and returns destination', (t) => {
  const ctx = new FakeAudioContext();
  const state = makeState({ audio: ctx, audioGain: ctx.createGain() });
  const audio = createAudio({
    state, log: () => {}, showToast: () => {}, sendAudioOptions: () => {},
    fmt: (v) => String(v), onMeter: () => {},
  });
  const dest = audio.connectRecordingAudio();
  assert.ok(dest);
  assert.equal(dest, state.recordAudioDestination);
  const dest2 = audio.connectRecordingAudio();
  assert.equal(dest2, dest);
});

test('connectRecordingAudio returns null when AudioContext missing', (t) => {
  const state = makeState({ audio: null });
  const audio = createAudio({
    state, log: () => {}, showToast: () => {}, sendAudioOptions: () => {},
    fmt: (v) => String(v), onMeter: () => {},
  });
  assert.equal(audio.connectRecordingAudio(), null);
});

test('disconnectRecordingAudio stops tracks and clears destination', (t) => {
  const state = makeState({ audio: new FakeAudioContext() });
  const audio = createAudio({
    state, log: () => {}, showToast: () => {}, sendAudioOptions: () => {},
    fmt: (v) => String(v), onMeter: () => {},
  });
  const dest = audio.connectRecordingAudio();
  assert.equal(state.recordAudioDestination, dest);
  audio.disconnectRecordingAudio();
  assert.equal(state.recordAudioDestination, null);
});

test('ensureAudioAlive does nothing when not active', async (t) => {
  const state = makeState({ active: false });
  let called = false;
  const audio = createAudio({
    state, log: () => {}, showToast: () => {}, sendAudioOptions: () => {},
    fmt: (v) => String(v),
    onMeter: () => {},
    makeAudio: async () => { called = true; },
  });
  await audio.ensureAudioAlive();
  assert.equal(called, false);
});
