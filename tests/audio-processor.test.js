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

test('muted processor writes silence and resumes without restarting the context', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .8, density: .8, speed: .4, ambient: .2, zones: [1,1,1,1,1,1] }, master: 1, sensitivity: 1, audioEnabled: true, muted: true } });
  for (let i = 0; i < 48; i++) {
    for (const channel of processBlock(processor)) {
      for (const sample of channel) assert.equal(sample, 0);
    }
  }
  assert.ok(processor.port.messages.every(message => message.type !== 'meter' || message.peak === 0));
  processor.port.onmessage({ data: { type: 'mute', muted: false } });
  let peak = 0;
  for (let i = 0; i < 24; i++) {
    for (const channel of processBlock(processor)) {
      for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    }
  }
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
  processor.rhythmRandomState = 1;
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
    processor.rhythmRandomState = 1;
    processor.port.onmessage({ data: { type: 'sound', rhythmEnabled: true } });
    processor.port.onmessage({ data: { type: 'signals', signals: { energy: speed, density: speed, speed, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 1, x: .5, y: .5, speed }] }, master: 1, muted: false, audioEnabled: true } });
    processBlock(processor);
    return processor;
  };
  const slow = makeActive(.1), fast = makeActive(.8);
  assert.ok(fast.rhythmBpm > slow.rhythmBpm);

  fast.port.onmessage({ data: { type: 'sound', rhythmEnabled: false } });
  processBlock(fast);
  assert.equal(fast.rhythmActive, false);
});

test('rhythmic phrases contain rests between scale notes', () => {
  const processor = new RegisteredProcessor();
  processor.rhythmRandomState = 1;
  const signals = { blobs: [], energy: .1, density: .05, speed: .04 };
  let rests = 0;
  for (let slot = 0; slot < 32; slot++) {
    processor.rhythmClock = processor.rhythmNextAt;
    processor.rhythmEnvelope = 0;
    processor.scheduleRhythmicNote(signals, signals.energy, signals.speed, signals.density);
    if (processor.rhythmEnvelope === 0) rests++;
  }
  assert.ok(rests > 0);
});

test('instrument mode keeps sustained voices from sweeping between pitches', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'sound', pitchRange: 7, rhythmEnabled: true } });
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .8, density: .5, speed: 1, ambient: 0, zones: [1,1,1,1,1,1], blobs: [{ id: 1, x: .5, y: .5, speed: 1 }] }, master: 1, muted: false, audioEnabled: true } });

  for (let block = 0; block < 12; block++) processBlock(processor);

  for (let zone = 0; zone < processor.phaseSteps.length; zone++) {
    const currentFrequency = processor.phaseSteps[zone] * sampleRate / (2 * Math.PI);
    const pitchDeviation = 12 * Math.log2(currentFrequency / processor.baseFrequency[zone]);
    assert.ok(Math.abs(pitchDeviation) <= .12 + 1e-6);
  }
});

test('instrument mode removes continuous drone when blobs are still', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'sound', rhythmEnabled: true } });
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .6, density: .5, speed: 0, ambient: 1, zones: [1,1,1,1,1,1], blobs: [{ id: 1, x: .5, y: .5, speed: 0 }] }, master: 1, muted: false, audioEnabled: true } });

  const output = processBlock(processor);
  const peak = Math.max(...output[0].map(Math.abs), ...output[1].map(Math.abs));
  assert.equal(peak, 0);
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

test('band mode maps the top of the screen to Hi and the bottom to Low', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'sound', bandMode: true, rhythmEnabled: false, oscillation: 0, pitchRange: 0 } });
  const send = y => processor.port.onmessage({ data: { type: 'signals', signals: { energy: .6, density: .4, speed: .7, coherence: .5, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 1, x: .5, y, size: 600, speed: .7 }] }, master: 1, sensitivity: 1, audioEnabled: true, muted: false } });
  send(.1);
  processBlock(processor);
  assert.equal(processor.blobBands.get('1'), 2);
  assert.ok(processor.bandTargets[4] > 0 && processor.bandTargets[5] > 0);
  assert.equal(processor.bandTargets[0], 0);
  assert.equal(processor.bandTargets[2], 0);
  send(.9);
  processBlock(processor);
  assert.equal(processor.blobBands.get('1'), 0);
  assert.ok(processor.bandTargets[0] > 0 && processor.bandTargets[1] > 0);
  assert.ok(processor.bandFrequency[4] > processor.bandFrequency[2]);
  assert.ok(processor.bandFrequency[2] > processor.bandFrequency[0]);
});

test('band boundaries use hysteresis so a blob on the line does not flicker', () => {
  const processor = new RegisteredProcessor();
  assert.equal(processor.bandForBlob('a', .33), 2);
  assert.equal(processor.bandForBlob('a', .35), 2);
  assert.equal(processor.bandForBlob('a', .38), 1);
  assert.equal(processor.bandForBlob('a', .66), 1);
  assert.equal(processor.bandForBlob('a', .64), 1);
  assert.equal(processor.bandForBlob('a', .70), 0);
  assert.equal(processor.bandForBlob('a', .65), 0);
});

test('Tom base transposes all three bands by the same interval', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'sound', bandMode: true } });
  const before = [...processor.bandFrequency];
  processor.port.onmessage({ data: { type: 'sound', key: 5 } });
  const after = [...processor.bandFrequency];
  const expected = Math.pow(2, 5 / 12);
  for (let index = 0; index < after.length; index++) {
    assert.ok(Math.abs(after[index] / before[index] - expected) < 1e-9);
  }
});

test('band mode sounds only while blobs move', () => {
  const signal = speed => ({ data: { type: 'signals', signals: { energy: .5, density: .4, speed, coherence: .4, ambient: 1, zones: [1,1,1,1,1,1], blobs: [{ id: 1, x: .4, y: .5, size: 800, speed }] }, master: 1, sensitivity: 1, audioEnabled: true, muted: false } });
  const options = { data: { type: 'sound', bandMode: true, rhythmEnabled: false, oscillation: 0, pitchRange: 0 } };
  const peakOf = speed => {
    const processor = new RegisteredProcessor();
    processor.port.onmessage(options);
    processor.port.onmessage(signal(speed));
    let peak = 0;
    for (let block = 0; block < 24; block++) {
      for (const channel of processBlock(processor)) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    }
    return peak;
  };
  assert.ok(peakOf(.8) > 0);
  assert.equal(peakOf(0), 0);
});

test('band rhythm fires on every moving step without random rests', () => {
  const processor = new RegisteredProcessor();
  processor.rhythmRandomState = 12345;
  processor.port.onmessage({ data: { type: 'sound', bandMode: true, rhythmEnabled: true } });
  let beats = 0;
  for (let step = 0; step < 16; step++) {
    processor.port.onmessage({ data: { type: 'signals', signals: { energy: .5, density: .4, speed: .8, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 1, x: .2 + (step % 2) * .02, y: .5, size: 600, speed: .8 }] }, master: 1, muted: false, audioEnabled: true } });
    processor.rhythmClock = processor.rhythmNextAt;
    processor.rhythmEnvelope = 0;
    processor.scheduleRhythmicNote(processor.signals, .5, .8, .4);
    if (processor.rhythmEnvelope > 0) beats++;
  }
  assert.equal(beats, 16);
});

test('band rhythm takes pitch from the moving blob band and never repeats at random', () => {
  const makeProcessor = seed => {
    const processor = new RegisteredProcessor();
    processor.rhythmRandomState = seed;
    processor.port.onmessage({ data: { type: 'sound', bandMode: true, rhythmEnabled: true } });
    processor.port.onmessage({ data: { type: 'signals', signals: { energy: .6, density: .5, speed: .7, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 7, x: .8, y: .1, size: 900, speed: .7 }] }, master: 1, muted: false, audioEnabled: true } });
    processBlock(processor);
    return processor;
  };
  const first = makeProcessor(11), second = makeProcessor(987654);
  assert.equal(first.rhythmFrequency, first.bandFrequency[5]);
  assert.equal(first.rhythmFrequency, second.rhythmFrequency);
  assert.equal(first.rhythmVelocity, second.rhythmVelocity);
  assert.ok(first.rhythmBpm > 58 && first.rhythmBpm <= 132);
});

test('band rhythm stops pulsing when blobs stop but keeps the frequency when disabled', () => {
  const moving = { type: 'signals', signals: { energy: .6, density: .5, speed: .8, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 3, x: .4, y: .5, size: 800, speed: .8 }] }, master: 1, muted: false, audioEnabled: true };
  const still = { type: 'signals', signals: { ...moving.signals, speed: 0, blobs: [{ id: 3, x: .4, y: .5, size: 800, speed: 0 }] }, master: 1, muted: false, audioEnabled: true };
  const warmup = { type: 'signals', signals: { ...moving.signals, speed: 0, blobs: [{ id: 3, x: .3, y: .5, size: 800, speed: 0 }] }, master: 1, muted: false, audioEnabled: true };
  const peakOf = (rhythmEnabled, packet) => {
    const processor = new RegisteredProcessor();
    processor.port.onmessage({ data: { type: 'sound', bandMode: true, rhythmEnabled, oscillation: 0, pitchRange: 0 } });
    // O ganho principal sobe em 35 ms; no app ele já está estabilizado quando o blob se mexe.
    processor.port.onmessage({ data: warmup });
    for (let block = 0; block < 24; block++) processBlock(processor);
    processor.port.onmessage({ data: packet });
    let peak = 0;
    for (let block = 0; block < 12; block++) {
      for (const channel of processBlock(processor)) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    }
    return { processor, peak };
  };
  const pulsing = peakOf(true, moving);
  assert.ok(pulsing.processor.rhythmEnvelope > 0);
  const stopped = peakOf(true, still);
  assert.equal(stopped.processor.rhythmEnvelope, 0);
  assert.equal(stopped.processor.rhythmActive, false);
  const frequencyOnly = peakOf(false, moving);
  assert.equal(frequencyOnly.processor.rhythmEnvelope, 0);
  assert.ok(frequencyOnly.peak > 0, 'a frequência das faixas continua com o ritmo desligado');
  assert.ok(pulsing.peak > frequencyOnly.peak, 'o pulso do blob aumenta o nível do som');
});

test('band beat is a water drop: pitch falls fast and the tail is short', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'sound', bandMode: true, rhythmEnabled: true, oscillation: 0, pitchRange: 0 } });
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .6, density: .5, speed: .9, ambient: 0, zones: [0,0,0,0,0,0], blobs: [{ id: 9, x: .5, y: .1, size: 800, speed: .9 }] }, master: 1, muted: false, audioEnabled: true } });
  processBlock(processor);
  const startFrequency = processor.rhythmDropFrequency;
  const startEnvelope = processor.rhythmEnvelope;
  assert.ok(startFrequency > processor.rhythmFrequency * 1.2, 'a gota começa aguda');
  for (let block = 0; block < 18; block++) processBlock(processor);
  assert.ok(processor.rhythmDropFrequency < processor.rhythmFrequency, 'a altura cai abaixo da nota da faixa');
  assert.ok(processor.rhythmEnvelope < startEnvelope * .25, 'o rastro some rápido');
  assert.ok(processor.rhythmDropAge > .04 && processor.rhythmDropAge < .06);
});

test('audioTime from the captured frame aligns the schedule to the AudioContext clock', () => {
  const processor = new RegisteredProcessor();
  processor.port.onmessage({ data: { type: 'signals', signals: { energy: .5, density: .3, speed: .5, ambient: 0, zones: [0,0,0,0,0,0], blobs: [] }, master: 1, muted: false, audioEnabled: true, audioTime: 2.5 } });
  assert.equal(processor.signalAudioTime, 2.5);
  assert.equal(processor.rhythmClock, 2.5);
});
