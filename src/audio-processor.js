import { PRESETS, SpawnPolicy } from './audio/audio.js';
import { applyScaleMessage, degreesForZones } from './audio/scales.js';
const unitAudioSignal = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
function timbreWave(phase, timbre) {
  const fundamental = Math.sin(phase);
  if (timbre === 1) return fundamental * .56 + Math.sin(phase * 2) * .26 + Math.sin(phase * 3) * .13 + Math.sin(phase * 4) * .05;
  if (timbre === 2) return Math.tanh(fundamental * 1.8) * .72 + Math.sin(phase * 2) * .20 + Math.sin(phase * 3) * .08;
  return fundamental * .72 + Math.sin(phase * 2) * .17 + Math.sin(phase * 3) * .04;
}

class BlobTrackAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.signals = { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: [0,0,0,0,0,0] };
    this.latestSignals = this.signals;
    this.signalsPending = false;
    this.policyHistory = {};
    this.engineTime = 0;
    this.preset = null;
    this.polyVoices = Array.from({ length: 16 }, () => ({ active: false, phase: 0, age: 0, envelope: 0, filter: 0, release: 1.5 }));
    this.master = 1;
    this.muted = false;
    this.sensitivity = 1;
    this.audioEnabled = true;
    this.oscillation = .4;
    this.pitchRange = 2;
    this.key = 0;
    this.timbre = 0;
    this.previousTimbre = 0;
    this.timbreFade = 1;
    this.effects = { echo: false, space: false, chorus: false };
    this.phase = new Float64Array(8);
    this.modPhase = new Float64Array(6);
    this.voiceLevel = new Float64Array(6);
    this.baseFrequency = new Float64Array(6);
    this.voiceTargets = new Float64Array(6);
    this.phaseSteps = new Float64Array(6);
    this.delayBuffer = new Float32Array(Math.ceil(sampleRate * .32));
    this.delayIndex = 0;
    this.echoDelay = Math.floor(sampleRate * .24);
    this.spaceDelayA = Math.floor(sampleRate * .029);
    this.spaceDelayB = Math.floor(sampleRate * .041);
    this.spaceDelayC = Math.floor(sampleRate * .053);
    this.chorusBuffer = new Float32Array(Math.ceil(sampleRate * .04));
    this.chorusIndex = 0;
    this.chorusPhase = 0;
    this.gain = 0;
    this.peak = 0;
    this.meterFrames = 0;
    this.updateFrequencies();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'signals') {
        if (data.signals && typeof data.signals === 'object') {
          this.signals = data.signals;
          this.latestSignals = { ...data.signals, master: data.master, muted: data.muted, sensitivity: data.sensitivity, audioEnabled: data.audioEnabled };
        } else {
          this.latestSignals = { ...data, zones: Array.isArray(data.zones) ? data.zones : [0,0,0,0,0,0] };
          this.signals = this.latestSignals;
        }
        this.master = Number.isFinite(data.master) ? data.master : this.master;
        this.muted = data.muted === true;
        this.sensitivity = Number.isFinite(data.sensitivity) ? Math.min(3, Math.max(0, data.sensitivity)) : 1;
        this.audioEnabled = data.audioEnabled !== false;
        if (this.preset) this.signalsPending = true;
        if (data.timbre !== undefined || data.soundEffects) this.setSoundOptions(data);
        if (PRESETS[data.preset]) this.setPreset(data.preset);
      }
      if (data.type === 'scale') this.setScale(data);
      if (data.type === 'preset' && PRESETS[data.preset]) this.setPreset(data.preset);
      if (data.type === 'effects') this.setSoundOptions({ soundEffects: data });
      if (data.type === 'sound') this.setSoundOptions(data);
      if (data.type === 'mute') this.muted = data.muted === true;
      if (data.type === 'audioEnabled') this.audioEnabled = data.enabled !== false;
      if (data.type === 'sensitivity') this.sensitivity = Number.isFinite(data.value) ? Math.min(3, Math.max(0, data.value)) : 1;
    };
  }

  setScale(message) {
    const selection = applyScaleMessage(message, this.key);
    this.scaleId = selection.id;
    this.scaleDegrees = selection.degrees;
    this.baseFrequency.set(selection.frequencies);
  }
  setPreset(name) {
    if (!PRESETS[name]) return;
    if (this.preset !== name) {
      this.preset = name;
      this.policyHistory = {};
      this.signalsPending = true;
    }
  }

  spawn(command) {
    if (command.type === 'releaseAll') {
      for (const voice of this.polyVoices) if (voice.active) { voice.releasing = true; voice.release = command.release || 1.5; }
      return;
    }
    if (command.type === 'release') {
      for (const voice of this.polyVoices) if (voice.active && String(voice.id) === String(command.id)) { voice.releasing = true; voice.release = .06; }
      return;
    }
    const max = PRESETS[this.preset]?.voices || 0;
    const active = this.polyVoices.filter(voice => voice.active && voice.preset === this.preset);
    if (active.length >= max) {
      active.sort((a, b) => a.age - b.age);
      active[0].active = false;
    }
    const voice = this.polyVoices.find(item => !item.active) || this.polyVoices.reduce((oldest, item) => item.age > oldest.age ? item : oldest);
    voice.active = true;
    voice.kind = command.type;
    voice.id = command.id;
    voice.preset = this.preset;
    voice.frequency = Math.max(20, Math.min(12000, Number(command.frequency) || (command.type === 'kick' ? 110 : command.type === 'clap' ? 950 : 220)));
    voice.pan = Math.max(-1, Math.min(1, Number(command.pan) || 0));
    voice.left = Math.cos((voice.pan + 1) * Math.PI / 4);
    voice.right = Math.sin((voice.pan + 1) * Math.PI / 4);
    voice.velocity = Math.max(0, Math.min(1, Number(command.velocity) || .25));
    voice.decay = Math.max(.05, Number(command.decay) || .3);
    voice.release = 1.5;
    voice.releasing = false;
    voice.age = 0;
    voice.envelope = 0;
    voice.filter = 0;
    const cutoff = Math.max(400, Math.min(8000, Number(command.filterHz) || 8000));
    voice.filterCoefficient = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
    voice.wet = Math.max(0, Math.min(1, Number(command.wet) || 0));
  }

  renderPreset(outputs) {
    const left = outputs[0]?.[0], right = outputs[0]?.[1];
    if (!left) return true;
    const frameLength = left.length;
    if (this.signalsPending) {
      const result = SpawnPolicy(this.preset, { ...this.latestSignals, time: this.engineTime }, this.policyHistory);
      this.policyHistory = result.history;
      for (const command of result.commands) {
        if (command.type === 'chord') {
          command.notes.forEach((frequency, index) => this.spawn({ ...command, type: 'pad', id: `chord-${index}`, frequency, pan: command.pan + (index - 1.5) * .13 }));
        } else if (command.type === 'shimmer') this.spawn({ ...command, type: 'shimmer' });
        else this.spawn(command);
      }
      this.signalsPending = false;
    }
    const start = Date.now();
    const target = (this.muted || !this.audioEnabled) ? 0 : Math.min(2, Math.max(0, Number.isFinite(this.master) ? this.master : 1));
    const gainAttack = 1 - Math.exp(-1 / (sampleRate * .035));
    const gainRelease = 1 - Math.exp(-1 / (sampleRate * .12));
    let peak = 0;
    for (let i = 0; i < frameLength; i++) {
      this.gain += (target - this.gain) * (target > this.gain ? gainAttack : gainRelease);
      let outL = 0, outR = 0;
      for (const voice of this.polyVoices) {
        if (!voice.active) continue;
        voice.age += 1 / sampleRate;
        if (voice.releasing) voice.envelope *= Math.exp(-1 / (sampleRate * voice.release));
        else if (voice.kind === 'pad') voice.envelope = Math.min(.48, voice.envelope + 1 / (sampleRate * .22));
        else voice.envelope = Math.exp(-voice.age / voice.decay);
        if (voice.envelope < .0008 || (!voice.releasing && voice.kind !== 'pad' && voice.age > voice.decay * 8)) { voice.active = false; continue; }
        let wave;
        if (voice.kind === 'kick') {
          const frequency = voice.frequency * Math.exp(-voice.age * 11);
          wave = Math.sin(voice.phase) * Math.exp(-voice.age * 9);
          voice.phase += 2 * Math.PI * Math.max(35, frequency) / sampleRate;
        } else if (voice.kind === 'clap') {
          wave = (Math.sin(voice.phase * 17.13) * Math.sin(voice.phase * 31.71) + Math.sin(voice.phase * 53.2)) / 2.5;
          voice.phase += 2 * Math.PI * voice.frequency / sampleRate;
        } else if (voice.kind === 'pad') {
          wave = .7 * Math.sin(voice.phase) + .2 * Math.sin(voice.phase * 2) + .1 * Math.sin(voice.phase * 3);
          voice.phase += 2 * Math.PI * voice.frequency / sampleRate;
        } else if (voice.kind === 'shimmer') {
          wave = .75 * Math.sin(voice.phase) + .25 * Math.sin(voice.phase * 2.01);
          voice.phase += 2 * Math.PI * voice.frequency / sampleRate;
        } else {
          wave = .72 * Math.sin(voice.phase) + .2 * Math.sin(voice.phase * 2.01) + .08 * Math.sin(voice.phase * 3.97);
          voice.phase += 2 * Math.PI * voice.frequency / sampleRate;
        }
        voice.filter += voice.filterCoefficient * (wave - voice.filter);
        const sample = voice.filter * voice.envelope * voice.velocity * this.gain;
        outL += sample * voice.left;
        outR += sample * voice.right;
      }
      let mono = (outL + outR) * .5;
      let echoIndex = this.delayIndex - this.echoDelay; if (echoIndex < 0) echoIndex += this.delayBuffer.length;
      let spaceA = this.delayIndex - this.spaceDelayA; if (spaceA < 0) spaceA += this.delayBuffer.length;
      let spaceB = this.delayIndex - this.spaceDelayB; if (spaceB < 0) spaceB += this.delayBuffer.length;
      let spaceC = this.delayIndex - this.spaceDelayC; if (spaceC < 0) spaceC += this.delayBuffer.length;
      const echo = this.delayBuffer[echoIndex];
      const space = this.delayBuffer[spaceA] + this.delayBuffer[spaceB] + this.delayBuffer[spaceC];
      let chorus = 0;
      if (this.effects.chorus) {
        const length = this.chorusBuffer.length;
        let read = this.chorusIndex - sampleRate * (.018 + .006 * Math.sin(this.chorusPhase)); if (read < 0) read += length;
        const first = Math.floor(read), fraction = read - first, second = first + 1 < length ? first + 1 : 0;
        chorus = this.chorusBuffer[first] * (1 - fraction) + this.chorusBuffer[second] * fraction;
        this.chorusPhase += 2 * Math.PI * .24 / sampleRate;
      }
      if (this.effects.echo) mono += echo * .3;
      if (this.effects.space) mono += space * .075;
      if (this.effects.chorus) mono += chorus * .18;
      const silent = this.muted || !this.audioEnabled;
      this.delayBuffer[this.delayIndex] = silent ? 0 : (outL + outR) * .5;
      this.delayIndex = (this.delayIndex + 1) % this.delayBuffer.length;
      this.chorusBuffer[this.chorusIndex] = silent ? 0 : (outL + outR) * .5;
      this.chorusIndex = (this.chorusIndex + 1) % this.chorusBuffer.length;
      const effectDelta = mono - (outL + outR) * .5;
      outL = Math.tanh((outL + effectDelta) * 1.45);
      outR = Math.tanh((outR + effectDelta) * 1.45);
      left[i] = outL;
      if (right) right[i] = outR;
      peak = Math.max(peak, Math.abs(outL), Math.abs(outR));
    }
    this.engineTime += frameLength / sampleRate;
    this.peak = Math.max(this.peak * .96, peak);
    this.meterFrames += frameLength;
    if (this.meterFrames >= sampleRate * .12) {
      this.port.postMessage({ type: 'meter', peak: this.peak, voices: this.polyVoices.filter(voice => voice.active).length, cost: Math.max(0, Date.now() - start) });
      this.meterFrames = 0;
    }
    return true;
  }

  setSoundOptions(options) {
    if (Number.isFinite(options.oscillation)) this.oscillation = Math.min(1, Math.max(0, options.oscillation));
    if (Number.isFinite(options.pitchRange)) this.pitchRange = Math.min(7, Math.max(0, options.pitchRange));
    if (Number.isFinite(options.timbre)) {
      const timbre = Math.min(2, Math.max(0, Math.round(options.timbre)));
      if (timbre !== this.timbre) { this.previousTimbre = this.timbre; this.timbre = timbre; this.timbreFade = 0; }
    }
    if (options.soundEffects) {
      this.effects.echo = options.soundEffects.echo === true;
      this.effects.space = options.soundEffects.space === true;
      this.effects.chorus = options.soundEffects.chorus === true;
    }
    if (Number.isFinite(options.key)) {
      const key = Math.min(11, Math.max(0, Math.round(options.key)));
      if (key !== this.key) { this.key = key; this.updateFrequencies(); }
    }
  }

  updateFrequencies() {
    const scale = this.scaleDegrees || degreesForZones('live');
    for (let z = 0; z < scale.length; z++) this.baseFrequency[z] = 130.8128 * Math.pow(2, (this.key + scale[z]) / 12);
  }

  process(_inputs, outputs) {
    if (this.preset) return this.renderPreset(outputs);
    const output = outputs[0]?.[0];
    const right = outputs[0]?.[1];
    if (!output) return true;
    const s = this.signals;
    const energy = unitAudioSignal(s.energy), density = unitAudioSignal(s.density), speed = unitAudioSignal(s.speed), ambient = unitAudioSignal(s.ambient);
    const target = (this.muted || !this.audioEnabled) ? 0 : Math.min(2, Math.max(0, Number.isFinite(this.master) ? this.master : 1));
    const gainAttack = 1 - Math.exp(-1 / (sampleRate * .035));
    const gainRelease = 1 - Math.exp(-1 / (sampleRate * .12));
    const attack = 1 - Math.exp(-1 / (sampleRate * .025));
    const release = 1 - Math.exp(-1 / (sampleRate * .11));
    const timbreFadeStep = 1 / (sampleRate * .045);
    const lfoHz = .14 + speed * 2.8 + energy * .55;
    let voices = 0;
    for (let z = 0; z < 6; z++) {
      const zone = unitAudioSignal(s.zones?.[z]);
      this.voiceTargets[z] = Math.min(.46, zone * (.16 + .20 * energy) * (.75 + .5 * speed) * this.sensitivity);
      if (this.voiceTargets[z] > .01) voices++;
      const bend = this.pitchRange * Math.sin(this.modPhase[z]) * (.25 + .75 * speed);
      this.phaseSteps[z] = 2 * Math.PI * this.baseFrequency[z] * Math.pow(2, bend / 12) / sampleRate;
    }
    const processStart = Date.now();
    let peak = 0;
    for (let i = 0; i < output.length; i++) {
      if (this.timbreFade < 1) this.timbreFade = Math.min(1, this.timbreFade + timbreFadeStep);
      this.gain += (target - this.gain) * (target > this.gain ? gainAttack : gainRelease);
      let sample = .055 * ambient * Math.sin(this.phase[6]);
      this.phase[6] += 2 * Math.PI * 55 / sampleRate;
      if (this.phase[6] >= Math.PI * 2) this.phase[6] -= Math.PI * 2;
      for (let z = 0; z < 6; z++) {
        const lfo = Math.sin(this.modPhase[z]);
        const level = this.voiceLevel[z];
        this.voiceLevel[z] += (this.voiceTargets[z] - level) * (this.voiceTargets[z] > level ? attack : release);
        const tremolo = 1 - this.oscillation * .6 + this.oscillation * .6 * (.5 + .5 * lfo);
        const nextWave = timbreWave(this.phase[z], this.timbre);
        const wave = this.timbreFade < 1 ? timbreWave(this.phase[z], this.previousTimbre) * (1 - this.timbreFade) + nextWave * this.timbreFade : nextWave;
        sample += this.voiceLevel[z] * tremolo * wave;
        this.phase[z] += this.phaseSteps[z];
        if (this.phase[z] >= Math.PI * 2) this.phase[z] -= Math.PI * 2;
        this.modPhase[z] += 2 * Math.PI * lfoHz * (1 + z * .045) / sampleRate;
        if (this.modPhase[z] >= Math.PI * 2) this.modPhase[z] -= Math.PI * 2;
      }
      const air = Math.min(.08, speed * .055 * Math.max(.5, this.sensitivity));
      sample += air * Math.sin(this.phase[7]);
      this.phase[7] += 2 * Math.PI * (180 + 620 * speed + 180 * density) / sampleRate;
      if (this.phase[7] >= Math.PI * 2) this.phase[7] -= Math.PI * 2;
      const dry = sample * this.gain / Math.sqrt(Math.max(1, voices));
      const delayLength = this.delayBuffer.length;
      let echoIndex = this.delayIndex - this.echoDelay; if (echoIndex < 0) echoIndex += delayLength;
      let spaceIndexA = this.delayIndex - this.spaceDelayA; if (spaceIndexA < 0) spaceIndexA += delayLength;
      let spaceIndexB = this.delayIndex - this.spaceDelayB; if (spaceIndexB < 0) spaceIndexB += delayLength;
      let spaceIndexC = this.delayIndex - this.spaceDelayC; if (spaceIndexC < 0) spaceIndexC += delayLength;
      const echo = this.delayBuffer[echoIndex];
      const earlyA = this.delayBuffer[spaceIndexA], earlyB = this.delayBuffer[spaceIndexB], earlyC = this.delayBuffer[spaceIndexC];
      let chorus = 0;
      if (this.effects.chorus) {
        const length = this.chorusBuffer.length;
        let read = this.chorusIndex - sampleRate * (.018 + .006 * Math.sin(this.chorusPhase));
        if (read < 0) read += length;
        const first = Math.floor(read), fraction = read - first, second = first + 1 < length ? first + 1 : 0;
        chorus = this.chorusBuffer[first] * (1 - fraction) + this.chorusBuffer[second] * fraction;
        this.chorusPhase += 2 * Math.PI * .24 / sampleRate;
        if (this.chorusPhase >= Math.PI * 2) this.chorusPhase -= Math.PI * 2;
      }
      let wet = dry;
      if (this.effects.echo) wet += echo * .3;
      if (this.effects.space) wet += (earlyA + earlyB + earlyC) * .075;
      if (this.effects.chorus) wet += chorus * .18;
      const silenced = this.muted || !this.audioEnabled;
      this.delayBuffer[this.delayIndex] = silenced ? 0 : dry + (this.effects.echo ? echo * .24 : 0) + (this.effects.space ? (earlyA + earlyB + earlyC) * .073 : 0);
      this.delayIndex++; if (this.delayIndex >= delayLength) this.delayIndex = 0;
      this.chorusBuffer[this.chorusIndex] = silenced ? 0 : dry;
      this.chorusIndex++; if (this.chorusIndex >= this.chorusBuffer.length) this.chorusIndex = 0;
      if (!Number.isFinite(wet)) wet = 0;
      const value = Math.tanh(wet * 1.45);
      output[i] = value;
      if (right) right[i] = value;
      peak = Math.max(peak, Math.abs(value));
    }
    this.peak = Math.max(this.peak * .96, peak);
    this.meterFrames += output.length;
    if (this.meterFrames >= sampleRate * .12) {
      this.port.postMessage({ type: 'meter', peak: this.peak, voices, cost: Math.max(0, Date.now() - processStart) });
      this.meterFrames = 0;
    }
    return true;
  }
}

registerProcessor('blobtrack-audio', BlobTrackAudioProcessor);