import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { onmessage: null, messages: [], postMessage(message) { this.messages.push(message); } }; }
};
let RegisteredProcessor;
globalThis.registerProcessor = (_name, Processor) => { RegisteredProcessor = Processor; };
await import('../src/audio-processor.js?test=phase-b');
const processBlock = (processor, channelCount = 2) => {
  const channels = Array.from({ length: channelCount }, () => new Float32Array(128));
  processor.process([], [channels]);
  return channels;
};

test('legacy zone signals without blobs still produce six-voice sound', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .6, density: .6, speed: .2, coherence: .5, ambient: .1, zones: [1, .8, .6, .4, .2, .1] }, master: 1, sensitivity: 1, audioEnabled: true, muted: false } });
  let peak = 0;
  for (let i = 0; i < 24; i++) for (const channel of processBlock(processor)) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  assert.ok(peak > 0);
});

test('legacy sound message still updates timbre and effects', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'sound', oscillation: .7, pitchRange: 3, key: 2, timbre: 2, soundEffects: { echo: true, space: true, chorus: false } } });
  assert.equal(processor.timbre, 2);
  assert.equal(processor.effects.echo, true);
  assert.equal(processor.effects.space, true);
  assert.equal(processor.effects.chorus, false);
});

test('rhythmic notes stay in the selected key and scale', () => {
  const processor = new RegisteredProcessor();
  const degrees = [0, 2, 3, 7, 8, 10];
  processor.port.onmessage({ data: { type: 'scale', id: 'minor', degrees } });
  processor.port.onmessage({ data: { type: 'sound', key: 2, rhythmEnabled: true } });
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .5, density: .3, speed: .4, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 1, x: .5, y: .5, speed: .4 }] }, master: 1, muted: false, audioEnabled: true } });

  processBlock(processor);

  const semitones = Math.round(12 * Math.log2(processor.rhythmFrequency / 130.8128));
  assert.ok(degrees.includes(((semitones - 2) % 12 + 12) % 12));
  assert.ok(processor.rhythmEnvelope > 0);
});

test('rhythmic layer can be disabled and its tempo follows blob activity', () => {
  const makeActive = speed => {
    const processor = new RegisteredProcessor();
    processor.port.onmessage({ data: { type: 'sound', rhythmEnabled: true } });
    processor.port.onmessage({ data: { type: 'signals', signals: { energy: speed, density: speed, speed, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 1, x: .5, y: .5, speed }] }, master: 1, muted: false, audioEnabled: true } });
    processBlock(processor);
    return processor;
  };
  const slow = makeActive(.1), fast = makeActive(.8);
  assert.ok(fast.rhythmNextAt < slow.rhythmNextAt);

  fast.port.onmessage({ data: { type: 'sound', rhythmEnabled: false } });
  processBlock(fast);
  assert.equal(fast.rhythmActive, false);
});

test('new mallet signals spawn a panned note after blob movement', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'preset', preset: 'easy-mallet' } });
  const send = (x, time) => processor.port.onmessage({ data: { type: 'signals', energy: .5, density: .2, speed: .8, coherence: .5, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 1, x, y: .5, size: 600, speed: .8 }], master: 1, sensitivity: 1, audioEnabled: true, muted: false } });
  send(.05, 0); processBlock(processor);
  send(.4, .1); const channels = processBlock(processor);
  assert.ok(processor.polyVoices.some(voice => voice.active && voice.kind === 'note'));
  assert.notDeepEqual(channels[0], channels[1]);
});
test('scale messages change only the six base frequencies and key changes preserve the selected scale', () => {
  const processor = new RegisteredProcessor();
  const live = [0, 3, 7, 12, 15, 19];
  assert.deepEqual([...processor.baseFrequency], live.map(degree => 130.8128 * 2 ** (degree / 12)));
  const originalPhase = [...processor.phase];
  const originalEffects = { ...processor.effects };
  const originalTimbre = processor.timbre;
  const scales = {
    minor: [0, 2, 3, 7, 8, 10],
    strange: [0, 2, 3, 7, 9, 10],
    tense: [0, 2, 3, 7, 8, 11],
  };
  for (const [id, degrees] of Object.entries(scales)) {
    processor.port.onmessage({ data: { type: 'scale', id, degrees } });
    assert.deepEqual([...processor.baseFrequency], degrees.map(degree => 130.8128 * 2 ** (degree / 12)));
    assert.deepEqual([...processor.phase], originalPhase);
    assert.deepEqual(processor.effects, originalEffects);
    assert.equal(processor.timbre, originalTimbre);
  }
  const tenseDegrees = scales.tense;
  processor.port.onmessage({ data: { type: 'sound', key: 2 } });
  assert.deepEqual([...processor.baseFrequency], tenseDegrees.map(degree => 130.8128 * 2 ** ((2 + degree) / 12)));
  processor.port.onmessage({ data: { type: 'scale', id: 'not-valid', degrees: [0, 1, 2, 3, 4, 5] } });
  assert.deepEqual([...processor.baseFrequency], live.map(degree => 130.8128 * 2 ** ((2 + degree) / 12)));
});
