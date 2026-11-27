import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioBus } from '../src/audio/audio.js';

test('audio bus keeps only the latest signals until the next frame', () => {
  const sent = [];
  let frameCallback;
  const bus = createAudioBus({
    getPort: () => ({ postMessage: message => sent.push(message) }),
    requestFrame: callback => { frameCallback = callback; return 1; },
    cancelFrame: () => {},
  });
  bus.queueSignals({ type: 'signals', value: 1 });
  bus.queueSignals({ type: 'signals', value: 2 });
  bus.queueSignals({ type: 'signals', value: 3 });
  assert.equal(sent.length, 0);
  frameCallback();
  assert.deepEqual(sent, [{ type: 'signals', value: 3 }]);
});

test('flushSignals posts in the same frame and keeps option debouncing intact', () => {
  const sent = [];
  const timers = new Map();
  let nextId = 0;
  let frameCancelled = 0;
  let frameCallback;
  const bus = createAudioBus({
    getPort: () => ({ postMessage: message => sent.push(message) }),
    requestFrame: callback => { frameCallback = callback; return 1; },
    cancelFrame: () => { frameCancelled++; frameCallback = null; },
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimer: id => timers.delete(id),
  });
  bus.scheduleOptions({ oscillation: .1, pitchRange: 2, key: 0, timbre: 0, soundEffects: {} }, 80);
  bus.queueSignals({ type: 'signals', value: 1 });
  bus.queueSignals({ type: 'signals', value: 2 });
  assert.equal(frameCancelled, 0);
  bus.flushSignals();
  assert.deepEqual(sent, [{ type: 'signals', value: 2 }]);
  assert.equal(frameCancelled, 1);
  assert.equal(frameCallback, null);
  assert.equal(timers.size, 1, 'debounced options must survive a signal flush');
  bus.flushSignals();
  assert.equal(sent.length, 1, 'a second flush must not duplicate the packet');
});

test('audio options are posted once until a shallow sound value changes', () => {
  const sent = [];
  const bus = createAudioBus({ getPort: () => ({ postMessage: message => sent.push(message) }) });
  const options = { oscillation: 0.4, pitchRange: 2, key: 0, timbre: 0, soundEffects: { echo: false, space: false, chorus: false } };
  assert.equal(bus.sendOptions(options), true);
  assert.equal(bus.sendOptions({ ...options, soundEffects: { ...options.soundEffects } }), false);
  assert.equal(bus.sendOptions({ ...options, key: 1 }), true);
  assert.equal(sent.length, 2);
});

test('debounced options retain only the last slider value', () => {
  const sent = [];
  const timers = new Map();
  let nextId = 0;
  const bus = createAudioBus({
    getPort: () => ({ postMessage: message => sent.push(message) }),
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimer: id => timers.delete(id),
  });
  bus.scheduleOptions({ oscillation: 0.1, pitchRange: 2, key: 0, timbre: 0, soundEffects: {} }, 80);
  bus.scheduleOptions({ oscillation: 0.9, pitchRange: 2, key: 0, timbre: 0, soundEffects: {} }, 80);
  assert.equal(timers.size, 1);
  const [timer] = timers.values();
  assert.equal(timer.delay, 80);
  timer.callback();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].oscillation, 0.9);
});