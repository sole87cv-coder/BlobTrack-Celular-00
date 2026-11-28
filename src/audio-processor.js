// PRESETS/SpawnPolicy: caminho legado/testado, n?o usado pelo app principal (modo cont?nuo/band).
import { PRESETS, SpawnPolicy } from './audio/audio.js';
import { applyScaleMessage, degreesForZones } from './audio/scales.js';
const unitAudioSignal = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
// Efeitos: subida/descida suave (40/80 ms) para ligar sem estalo e sem salto de volume.
const FX_FADE_UP = 1 - Math.exp(-1 / (sampleRate * .04));
const FX_FADE_DOWN = 1 - Math.exp(-1 / (sampleRate * .08));
const FX_CHORUS_RATE = .6;
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
    this.rhythmEnabled = true;
    this.rhythmClock = 0;
    this.rhythmNextAt = 0;
    this.rhythmActive = false;
    this.rhythmPhase = 0;
    this.rhythmEnvelope = 0;
    this.rhythmDropAge = 0;
    this.rhythmDropFrequency = 0;
    this.rhythmFrequency = 220;
    this.rhythmVelocity = .7;
    this.rhythmStep = 0;
    this.rhythmBpm = 62;
    this.rhythmLastDegree = -1;
    this.rhythmRandomState = (Math.random() * 0xffffffff) >>> 0 || 1;
    // Ritmo do modo faixas: pulso gerado pelo movimento real dos blobs.
    this.blobMotion = new Map();
    this.blobMotionSeen = false;
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
    // Sala: três chegadas espaçadas e decrescentes, em vez de três toques grudados.
    this.spaceDelayA = Math.floor(sampleRate * .072);
    this.spaceDelayB = Math.floor(sampleRate * .113);
    this.spaceDelayC = Math.floor(sampleRate * .167);
    this.chorusBuffer = new Float32Array(Math.ceil(sampleRate * .04));
    this.chorusIndex = 0;
    this.chorusPhase = 0;
    this.effectMix = { echo: 0, space: 0, chorus: 0 };
    this.spaceLevel = 0;
    this.gain = 0;
    this.peak = 0;
    this.meterFrames = 0;
    this.silenceLatched = false;
    this.scaleDegrees = degreesForZones('live');
    this.updateFrequencies();
    // Instrumento de faixas: topo da tela = Hi, meio = Mid, baixo = Low.
    this.bandMode = false;
    this.bandHysteresis = .035;
    this.bandFrequency = new Float64Array(6);
    this.bandTargets = new Float64Array(6);
    this.blobBands = new Map();
    this.signalAudioTime = null;
    this.signalAgeMs = 0;
    this.updateBandFrequencies();
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
        // P0: o quadro foi capturado neste instante do AudioContext. Alinhar o
        // agendamento a esse relógio evita empilhar o atraso dos dois rAFs.
        if (Number.isFinite(data.audioTime)) {
          this.signalAudioTime = data.audioTime;
          this.rhythmClock = Math.max(this.rhythmClock, data.audioTime);
        }
        if (this.bandMode && this.rhythmEnabled) this.trackBlobMotion(data.signals);
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
    this.updateBandFrequencies();
  }

  nextRhythmRandom() {
    let value = this.rhythmRandomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.rhythmRandomState = value >>> 0 || 1;
    return this.rhythmRandomState / 0x100000000;
  }

  // O modo faixas não sorteia nota nem pausa: o pulso só existe quando um blob
  // andou desde o último quadro. A posição e a velocidade do blob mandam no som.
  trackBlobMotion(signals) {
    const blobs = Array.isArray(signals?.blobs) ? signals.blobs : [];
    const seen = new Set();
    for (const blob of blobs) {
      if (!blob || !Number.isFinite(blob.x) || !Number.isFinite(blob.y)) continue;
      const id = blob.id === undefined ? `x${blob.x.toFixed(3)}y${blob.y.toFixed(3)}` : String(blob.id);
      seen.add(id);
      const x = unitAudioSignal(blob.x), y = unitAudioSignal(blob.y);
      const previous = this.blobMotion.get(id);
      if (!previous) {
        this.blobMotion.set(id, { x, y });
        this.blobMotionSeen = true;
        continue;
      }
      if (Math.abs(x - previous.x) + Math.abs(y - previous.y) > .004) this.blobMotionSeen = true;
      previous.x = x;
      previous.y = y;
    }
    for (const id of this.blobMotion.keys()) if (!seen.has(id)) this.blobMotion.delete(id);
  }

  // Relógio determinístico: andar do blob abre a janela, a velocidade dá o andamento,
  // a faixa do blob dá a nota. Sem sorteado, sem descanso aleatório.
  scheduleBlobRhythm(signals, energy, speed, density) {
    if (!this.rhythmEnabled || this.muted || !this.audioEnabled || this.master <= .001) {
      this.rhythmEnvelope = 0;
      this.rhythmActive = false;
      return;
    }
    const blobs = Array.isArray(signals?.blobs) ? signals.blobs : [];
    let moving = false;
    for (const blob of blobs) {
      if (blob && Number(blob.speed) > .02) { moving = true; break; }
    }
    if (!moving || !this.blobMotionSeen) {
      this.rhythmActive = false;
      this.rhythmNextAt = this.rhythmClock + .05;
      return;
    }
    const bpm = Math.min(132, Math.max(58, 58 + energy * 22 + speed * 50 + density * 12));
    this.rhythmBpm = bpm;
    if (!this.rhythmActive) {
      this.rhythmActive = true;
      this.rhythmNextAt = this.rhythmClock;
    }
    if (this.rhythmClock + 1 / sampleRate < this.rhythmNextAt) return;
    let chosen = null;
    for (const blob of blobs) {
      if (!blob || !Number.isFinite(blob.x) || !Number.isFinite(blob.y)) continue;
      if (!chosen || Number(blob.speed) > Number(chosen.speed)) chosen = blob;
    }
    if (!chosen) return;
    const id = chosen.id === undefined ? `x${chosen.x.toFixed(3)}y${chosen.y.toFixed(3)}` : String(chosen.id);
    const band = this.bandForBlob(id, unitAudioSignal(chosen.y));
    const voice = unitAudioSignal(chosen.x) >= .5 ? 1 : 0;
    this.rhythmFrequency = this.bandFrequency[band * 2 + voice] || this.bandFrequency[0];
    this.rhythmVelocity = Math.min(1, .62 + unitAudioSignal(chosen.speed) * .34 + (this.rhythmStep % 4 === 0 ? .08 : 0));
    this.rhythmEnvelope = .72;
    this.rhythmDropAge = 0;
    this.rhythmPhase = 0;
    this.rhythmStep++;
    this.blobMotionSeen = false;
    this.rhythmNextAt = this.rhythmClock + 30 / bpm;
  }

  scheduleRhythmicNote(signals, energy, speed, density) {
    if (this.bandMode) {
      this.scheduleBlobRhythm(signals, energy, speed, density);
      return;
    }
    if (!this.rhythmEnabled || this.muted || !this.audioEnabled || this.master <= .001) {
      this.rhythmActive = false;
      return;
    }
    const blobs = Array.isArray(signals.blobs) ? signals.blobs : [];
    let movingBlob = false;
    for (let index = 0; index < blobs.length; index++) {
      if (blobs[index] && Number(blobs[index].speed) > .025) { movingBlob = true; break; }
    }
    const active = speed > .035 || movingBlob;
    if (!active) {
      this.rhythmActive = false;
      this.rhythmNextAt = this.rhythmClock + .08;
      return;
    }
    const bpm = Math.min(126, Math.max(56, 62 + energy * 28 + speed * 22 + density * 14));
    this.rhythmBpm = bpm;
    if (!this.rhythmActive) {
      this.rhythmActive = true;
      this.rhythmNextAt = this.rhythmClock;
    }
    if (this.rhythmClock + 1 / sampleRate < this.rhythmNextAt) return;

    const stepIndex = this.rhythmStep++;
    const stepDuration = 30 / bpm;
    const probability = Math.min(.9, .52 + energy * .2 + speed * .12 + density * .13);
    const accentedRest = stepIndex % 6 === 0 && energy + speed > .65;
    if (this.nextRhythmRandom() >= probability && !accentedRest) {
      const restSteps = this.nextRhythmRandom() < .7 ? 1 : 2;
      this.rhythmNextAt = this.rhythmClock + stepDuration * (restSteps + 1);
      return;
    }

    const scale = this.scaleDegrees?.length ? this.scaleDegrees : degreesForZones('live');
    const blob = blobs.length ? blobs[Math.floor(this.nextRhythmRandom() * blobs.length)] : null;
    const anchor = blob && Number.isFinite(blob.x) ? Math.round(Math.max(0, Math.min(1, blob.x)) * (scale.length - 1)) : Math.floor(this.nextRhythmRandom() * scale.length);
    const nearbyStep = Math.floor(this.nextRhythmRandom() * 3) - 1;
    let degreeIndex = (anchor + nearbyStep + scale.length) % scale.length;
    if (degreeIndex === this.rhythmLastDegree && scale.length > 1) {
      degreeIndex = (degreeIndex + 1 + Math.floor(this.nextRhythmRandom() * (scale.length - 1))) % scale.length;
    }
    this.rhythmLastDegree = degreeIndex;
    const jitterOctave = this.nextRhythmRandom() < .16 ? -1 : this.nextRhythmRandom() > .84 ? 1 : 0;
    const y = blob && Number.isFinite(blob.y) ? unitAudioSignal(blob.y) : .5;
    const bandOctave = y < .34 ? 1 : y > .66 ? -1 : 0;
    const key = Number.isFinite(this.key) ? this.key : 0;
    this.rhythmFrequency = Math.max(60, Math.min(3600, 130.8128 * 2 ** ((key + scale[degreeIndex] + (jitterOctave + bandOctave) * 12) / 12)));
    this.rhythmVelocity = Math.min(1, .76 + this.nextRhythmRandom() * .2 + (stepIndex % 4 === 0 ? .08 : 0));
    this.rhythmEnvelope = .62;
    this.rhythmPhase = 0;
    const spacing = this.nextRhythmRandom() < .56 ? 1 : this.nextRhythmRandom() < .78 ? 2 : 3;
    this.rhythmNextAt = this.rhythmClock + stepDuration * spacing;
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

  renderSilence(outputs) {
    const channels = outputs[0];
    if (!channels || !channels.length) return;
    for (const channel of channels) channel.fill(0);
    if (!this.silenceLatched) {
      this.delayBuffer.fill(0);
      this.chorusBuffer.fill(0);
      for (const voice of this.polyVoices) voice.active = false;
      this.rhythmEnvelope = 0;
      this.rhythmDropAge = 0;
      this.rhythmActive = false;
      this.gain = 0;
      this.peak = 0;
      this.silenceLatched = true;
    }
    this.meterFrames += channels[0].length;
    if (this.meterFrames >= sampleRate * .12) {
      this.port.postMessage({ type: 'meter', peak: 0, voices: 0, cost: 0 });
      this.meterFrames = 0;
    }
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
      const mix = this.effectMix;
      mix.echo += ((this.effects.echo ? 1 : 0) - mix.echo) * (this.effects.echo ? FX_FADE_UP : FX_FADE_DOWN);
      mix.space += ((this.effects.space ? 1 : 0) - mix.space) * (this.effects.space ? FX_FADE_UP : FX_FADE_DOWN);
      mix.chorus += ((this.effects.chorus ? 1 : 0) - mix.chorus) * (this.effects.chorus ? FX_FADE_UP : FX_FADE_DOWN);
      const mixNorm = 1 / Math.max(1, (mix.echo + mix.space + mix.chorus) * .5);
      const spaceTarget = this.effects.space ? .55 + .45 * unitAudioSignal(this.signals.speed) : 0;
      this.spaceLevel += (spaceTarget - this.spaceLevel) * (spaceTarget > this.spaceLevel ? FX_FADE_UP : FX_FADE_DOWN);
      let echo = 0, earlyA = 0, earlyB = 0, earlyC = 0;
      if (mix.echo > .0001 || mix.space > .0001) {
        let echoIndex = this.delayIndex - this.echoDelay; if (echoIndex < 0) echoIndex += this.delayBuffer.length;
        let spaceA = this.delayIndex - this.spaceDelayA; if (spaceA < 0) spaceA += this.delayBuffer.length;
        let spaceB = this.delayIndex - this.spaceDelayB; if (spaceB < 0) spaceB += this.delayBuffer.length;
        let spaceC = this.delayIndex - this.spaceDelayC; if (spaceC < 0) spaceC += this.delayBuffer.length;
        echo = this.delayBuffer[echoIndex];
        earlyA = this.delayBuffer[spaceA]; earlyB = this.delayBuffer[spaceB]; earlyC = this.delayBuffer[spaceC];
      }
      let chorusL = 0, chorusR = 0;
      if (mix.chorus > .0001) {
        const length = this.chorusBuffer.length;
        const sweep = .005 * Math.sin(this.chorusPhase);
        let readL = this.chorusIndex - sampleRate * (.018 + sweep); if (readL < 0) readL += length;
        let readR = this.chorusIndex - sampleRate * (.024 - sweep); if (readR < 0) readR += length;
        const firstL = Math.floor(readL), fracL = readL - firstL, nextL = firstL + 1 < length ? firstL + 1 : 0;
        const firstR = Math.floor(readR), fracR = readR - firstR, nextR = firstR + 1 < length ? firstR + 1 : 0;
        chorusL = this.chorusBuffer[firstL] * (1 - fracL) + this.chorusBuffer[nextL] * fracL;
        chorusR = this.chorusBuffer[firstR] * (1 - fracR) + this.chorusBuffer[nextR] * fracR;
        this.chorusPhase += 2 * Math.PI * FX_CHORUS_RATE / sampleRate;
      }
      let effectL = 0, effectR = 0;
      if (mix.echo > .0001) {
        const level = echo * .3 * mix.echo * mixNorm;
        effectL += level; effectR += level;
      }
      if (mix.space > .0001) {
        const room = (earlyA * .13 + earlyB * .09 + earlyC * .06) * this.spaceLevel * mix.space * mixNorm;
        effectL += room; effectR += room;
      }
      if (mix.chorus > .0001) {
        effectL += chorusL * .18 * mix.chorus * mixNorm;
        effectR += chorusR * .18 * mix.chorus * mixNorm;
      }
      const silent = this.muted || !this.audioEnabled;
      if (mix.echo > .0001 || mix.space > .0001) {
        this.delayBuffer[this.delayIndex] = silent ? 0 : (outL + outR) * .5 + echo * .24 * mix.echo;
        this.delayIndex = (this.delayIndex + 1) % this.delayBuffer.length;
      }
      if (mix.chorus > .0001) {
        this.chorusBuffer[this.chorusIndex] = silent ? 0 : (outL + outR) * .5;
        this.chorusIndex = (this.chorusIndex + 1) % this.chorusBuffer.length;
      }
      outL = Math.tanh((outL + effectL) * 1.45);
      outR = Math.tanh((outR + effectR) * 1.45);
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
    if (typeof options.bandMode === 'boolean' && options.bandMode !== this.bandMode) {
      this.bandMode = options.bandMode;
      this.blobBands.clear();
      this.updateBandFrequencies();
    }
    if (typeof options.rhythmEnabled === 'boolean' && options.rhythmEnabled !== this.rhythmEnabled) {
      this.rhythmEnabled = options.rhythmEnabled;
      // Troca de regime: nada do som anterior pode ecoar junto com o novo.
      // Sem isso, o tom contínuo demorava ~110 ms a desaparecer e o delay
      // devolvia o rastro por mais 320 ms, misturando os dois estados.
      this.delayBuffer.fill(0);
      this.chorusBuffer.fill(0);
      this.voiceLevel.fill(0);
      this.rhythmEnvelope = 0;
      this.rhythmDropAge = 0;
      this.rhythmActive = false;
      this.blobMotionSeen = false;
    }
    if (Number.isFinite(options.oscillation)) this.oscillation = Math.min(1, Math.max(0, options.oscillation));
    if (Number.isFinite(options.pitchRange)) this.pitchRange = Math.min(7, Math.max(0, options.pitchRange));
    if (Number.isFinite(options.timbre)) {
      const timbre = Math.min(2, Math.max(0, Math.round(options.timbre)));
      if (timbre !== this.timbre) { this.previousTimbre = this.timbre; this.timbre = timbre; this.timbreFade = 0; }
    }
    if (options.soundEffects) {
      const echo = options.soundEffects.echo === true;
      const space = options.soundEffects.space === true;
      const chorus = options.soundEffects.chorus === true;
      if (echo !== this.effects.echo || space !== this.effects.space || chorus !== this.effects.chorus) {
        // Nenhum efeito pode "acordar" com o rastro do estado anterior.
        this.delayBuffer.fill(0);
        this.chorusBuffer.fill(0);
      }
      this.effects.echo = echo;
      this.effects.space = space;
      this.effects.chorus = chorus;
    }
    if (Number.isFinite(options.key)) {
      const key = Math.min(11, Math.max(0, Math.round(options.key)));
      if (key !== this.key) { this.key = key; this.updateFrequencies(); this.updateBandFrequencies(); }
    }
  }

  updateFrequencies() {
    const scale = this.scaleDegrees || degreesForZones('live');
    for (let z = 0; z < scale.length; z++) this.baseFrequency[z] = 130.8128 * Math.pow(2, (this.key + scale[z]) / 12);
  }

  // Low = uma oitava abaixo do Tom base, Mid = o Tom base, Hi = uma acima.
  // As três faixas transpõem juntas quando a tecla muda.
  updateBandFrequencies() {
    const scale = this.scaleDegrees?.length >= 6 ? this.scaleDegrees : degreesForZones('live');
    const key = Number.isFinite(this.key) ? this.key : 0;
    for (let band = 0; band < 3; band++) {
      const octave = -12 + band * 12;
      for (let voice = 0; voice < 2; voice++) {
        const index = band * 2 + voice;
        const degree = scale[index] ?? scale[scale.length - 1];
        this.bandFrequency[index] = 130.8128 * Math.pow(2, (key + degree + octave) / 12);
      }
    }
  }

  // 0 = Low (baixo da tela), 1 = Mid (meio), 2 = Hi (topo).
  // Histerese evita que um blob parado sobre a fronteira troque de faixa a cada quadro.
  bandForBlob(id, y) {
    const low = .34, high = .66, h = this.bandHysteresis;
    const previous = this.blobBands.get(id);
    let band;
    if (previous === 2) band = y < low + h ? 2 : y <= high ? 1 : 0;
    else if (previous === 0) band = y > high - h ? 0 : y >= low ? 1 : 2;
    else if (previous === 1) band = y < low - h ? 2 : y > high + h ? 0 : 1;
    else band = y < low ? 2 : y > high ? 0 : 1;
    this.blobBands.set(id, band);
    return band;
  }

  updateBandVoices(signals) {
    const blobs = Array.isArray(signals.blobs) ? signals.blobs : [];
    const seen = new Set();
    const weights = [new Float64Array(2), new Float64Array(2), new Float64Array(2)];
    for (const blob of blobs) {
      if (!blob || !Number.isFinite(blob.x) || !Number.isFinite(blob.y)) continue;
      const id = blob.id === undefined ? `x${blob.x.toFixed(3)}y${blob.y.toFixed(3)}` : String(blob.id);
      seen.add(id);
      const band = this.bandForBlob(id, unitAudioSignal(blob.y));
      const x = unitAudioSignal(blob.x);
      const speed = unitAudioSignal(blob.speed);
      const size = Math.max(1, Number(blob.size) || 1);
      const sizeNorm = unitAudioSignal(Math.log2(size) / 12);
      if (speed <= .02) continue; // blob parado não vira drone
      const level = Math.min(1, (.1 + .9 * speed) * (.55 + .45 * sizeNorm));
      weights[band][0] += level * (1 - x);
      weights[band][1] += level * x;
    }
    for (const id of this.blobBands.keys()) if (!seen.has(id)) this.blobBands.delete(id);
    // Ritmo ligado = só a gota. As seis vozes contínuas ficam mudas para não
    // misturar o tom de quando o Ritmo está desligado com o pulso d'água.
    const bandGain = this.rhythmEnabled ? 0 : (.3 + .7 * this.sensitivity) * .5;
    for (let band = 0; band < 3; band++) {
      for (let voice = 0; voice < 2; voice++) {
        this.bandTargets[band * 2 + voice] = Math.min(.42, weights[band][voice] * bandGain);
      }
    }
  }

  process(_inputs, outputs) {
    if (this.muted || !this.audioEnabled) {
      this.renderSilence(outputs);
      return true;
    }
    this.silenceLatched = false;
    if (this.preset) return this.renderPreset(outputs);
    const output = outputs[0]?.[0];
    const right = outputs[0]?.[1];
    if (!output) return true;
    const s = this.signals;
    const energy = unitAudioSignal(s.energy), density = unitAudioSignal(s.density), speed = unitAudioSignal(s.speed), ambient = unitAudioSignal(s.ambient);
    if (this.rhythmEnabled) this.scheduleRhythmicNote(s, energy, speed, density);
    else { this.rhythmEnvelope = 0; this.rhythmActive = false; }
    const target = (this.muted || !this.audioEnabled) ? 0 : Math.min(2, Math.max(0, Number.isFinite(this.master) ? this.master : 1));
    const gainAttack = 1 - Math.exp(-1 / (sampleRate * .035));
    const gainRelease = 1 - Math.exp(-1 / (sampleRate * .12));
    const attack = 1 - Math.exp(-1 / (sampleRate * .025));
    const release = 1 - Math.exp(-1 / (sampleRate * .11));
    const timbreFadeStep = 1 / (sampleRate * .045);
    const lfoHz = .14 + speed * 2.8 + energy * .55;
    const instrumentBed = this.rhythmEnabled ? 0 : .24;
    const bendRange = Math.min(this.pitchRange, .12);
    const frequency = this.bandMode ? this.bandFrequency : this.baseFrequency;
    if (this.bandMode) this.updateBandVoices(s);
    let voices = 0;
    for (let z = 0; z < 6; z++) {
      if (!this.bandMode) {
        const zone = unitAudioSignal(s.zones?.[z]);
        this.voiceTargets[z] = Math.min(.46, zone * (.16 + .20 * energy) * (.75 + .5 * speed) * this.sensitivity * instrumentBed);
      }
      const voiceTarget = this.bandMode ? this.bandTargets[z] : this.voiceTargets[z];
      if (voiceTarget > .01) voices++;
      const bend = bendRange * Math.sin(this.modPhase[z]) * (.25 + .75 * speed);
      this.phaseSteps[z] = 2 * Math.PI * frequency[z] * Math.pow(2, bend / 12) / sampleRate;
    }
    if (this.signalAudioTime !== null && typeof currentTime === 'number') {
      this.signalAgeMs = Math.max(0, (currentTime - this.signalAudioTime) * 1000);
    }
    const processStart = Date.now();
    let peak = 0;
    for (let i = 0; i < output.length; i++) {
      if (this.timbreFade < 1) this.timbreFade = Math.min(1, this.timbreFade + timbreFadeStep);
      this.gain += (target - this.gain) * (target > this.gain ? gainAttack : gainRelease);
      const ambientLevel = (this.rhythmEnabled || this.bandMode) ? 0 : .055 * ambient;
      let sample = ambientLevel * Math.sin(this.phase[6]);
      this.phase[6] += 2 * Math.PI * 55 / sampleRate;
      if (this.phase[6] >= Math.PI * 2) this.phase[6] -= Math.PI * 2;
      for (let z = 0; z < 6; z++) {
        const lfo = Math.sin(this.modPhase[z]);
        const voiceTarget = this.bandMode ? this.bandTargets[z] : this.voiceTargets[z];
        const level = this.voiceLevel[z];
        this.voiceLevel[z] += (voiceTarget - level) * (voiceTarget > level ? attack : release);
        const tremolo = 1 - this.oscillation * .6 + this.oscillation * .6 * (.5 + .5 * lfo);
        const nextWave = timbreWave(this.phase[z], this.timbre);
        const wave = this.timbreFade < 1 ? timbreWave(this.phase[z], this.previousTimbre) * (1 - this.timbreFade) + nextWave * this.timbreFade : nextWave;
        sample += this.voiceLevel[z] * tremolo * wave;
        this.phase[z] += this.phaseSteps[z];
        if (this.phase[z] >= Math.PI * 2) this.phase[z] -= Math.PI * 2;
        this.modPhase[z] += 2 * Math.PI * lfoHz * (1 + z * .045) / sampleRate;
        if (this.modPhase[z] >= Math.PI * 2) this.modPhase[z] -= Math.PI * 2;
      }
      if (this.rhythmEnabled && this.rhythmEnvelope > .0005) {
        const beat = Math.sin(this.rhythmPhase) * .76 + Math.sin(this.rhythmPhase * 2) * .24;
        if (this.bandMode) {
          // Gota d'água: ataque de 3,5 ms (sem clique), a altura cai de ~1,75x
          // para ~0,7x da nota da faixa em 22 ms e o rastro some em 30 ms.
          this.rhythmDropAge += 1 / sampleRate;
          const attack = Math.min(1, this.rhythmDropAge / .0035);
          const dropFrequency = this.rhythmFrequency * (.7 + 1.05 * Math.exp(-this.rhythmDropAge / .022));
          this.rhythmDropFrequency = dropFrequency;
          sample += beat * this.rhythmEnvelope * attack * .52 * this.rhythmVelocity;
          this.rhythmPhase += 2 * Math.PI * dropFrequency / sampleRate;
          this.rhythmEnvelope *= Math.exp(-1 / (sampleRate * .03));
        } else {
          sample += beat * this.rhythmEnvelope * .26 * this.rhythmVelocity;
          this.rhythmPhase += 2 * Math.PI * this.rhythmFrequency / sampleRate;
          this.rhythmEnvelope *= Math.exp(-1 / (sampleRate * .06));
        }
        if (this.rhythmPhase >= Math.PI * 2) this.rhythmPhase -= Math.PI * 2;
      }
      const air = (this.rhythmEnabled || this.bandMode) ? 0 : Math.min(.08, speed * .055 * Math.max(.5, this.sensitivity));
      sample += air * Math.sin(this.phase[7]);
      this.phase[7] += 2 * Math.PI * (180 + 620 * speed + 180 * density) / sampleRate;
      if (this.phase[7] >= Math.PI * 2) this.phase[7] -= Math.PI * 2;
      const dry = sample * this.gain / Math.sqrt(Math.max(1, voices));
      const mix = this.effectMix;
      mix.echo += ((this.effects.echo ? 1 : 0) - mix.echo) * (this.effects.echo ? FX_FADE_UP : FX_FADE_DOWN);
      mix.space += ((this.effects.space ? 1 : 0) - mix.space) * (this.effects.space ? FX_FADE_UP : FX_FADE_DOWN);
      mix.chorus += ((this.effects.chorus ? 1 : 0) - mix.chorus) * (this.effects.chorus ? FX_FADE_UP : FX_FADE_DOWN);
      const mixNorm = 1 / Math.max(1, (mix.echo + mix.space + mix.chorus) * .5);
      const spaceTarget = this.effects.space ? .55 + .45 * unitAudioSignal(this.signals.speed) : 0;
      this.spaceLevel += (spaceTarget - this.spaceLevel) * (spaceTarget > this.spaceLevel ? FX_FADE_UP : FX_FADE_DOWN);
      const delayLength = this.delayBuffer.length;
      let echo = 0, earlyA = 0, earlyB = 0, earlyC = 0;
      if (mix.echo > .0001 || mix.space > .0001) {
        let echoIndex = this.delayIndex - this.echoDelay; if (echoIndex < 0) echoIndex += delayLength;
        let spaceA = this.delayIndex - this.spaceDelayA; if (spaceA < 0) spaceA += delayLength;
        let spaceB = this.delayIndex - this.spaceDelayB; if (spaceB < 0) spaceB += delayLength;
        let spaceC = this.delayIndex - this.spaceDelayC; if (spaceC < 0) spaceC += delayLength;
        echo = this.delayBuffer[echoIndex];
        earlyA = this.delayBuffer[spaceA]; earlyB = this.delayBuffer[spaceB]; earlyC = this.delayBuffer[spaceC];
      }
      let chorusL = 0, chorusR = 0;
      if (mix.chorus > .0001) {
        const length = this.chorusBuffer.length;
        const sweep = .005 * Math.sin(this.chorusPhase);
        let readL = this.chorusIndex - sampleRate * (.018 + sweep); if (readL < 0) readL += length;
        let readR = this.chorusIndex - sampleRate * (.024 - sweep); if (readR < 0) readR += length;
        const firstL = Math.floor(readL), fracL = readL - firstL, nextL = firstL + 1 < length ? firstL + 1 : 0;
        const firstR = Math.floor(readR), fracR = readR - firstR, nextR = firstR + 1 < length ? firstR + 1 : 0;
        chorusL = this.chorusBuffer[firstL] * (1 - fracL) + this.chorusBuffer[nextL] * fracL;
        chorusR = this.chorusBuffer[firstR] * (1 - fracR) + this.chorusBuffer[nextR] * fracR;
        this.chorusPhase += 2 * Math.PI * FX_CHORUS_RATE / sampleRate;
        if (this.chorusPhase >= Math.PI * 2) this.chorusPhase -= Math.PI * 2;
      }
      let wetL = dry, wetR = dry;
      if (mix.echo > .0001) {
        const level = echo * .3 * mix.echo * mixNorm;
        wetL += level; wetR += level;
      }
      if (mix.space > .0001) {
        const room = (earlyA * .13 + earlyB * .09 + earlyC * .06) * this.spaceLevel * mix.space * mixNorm;
        wetL += room; wetR += room;
      }
      if (mix.chorus > .0001) {
        wetL += chorusL * .18 * mix.chorus * mixNorm;
        wetR += chorusR * .18 * mix.chorus * mixNorm;
      }
      const silenced = this.muted || !this.audioEnabled;
      if (mix.echo > .0001 || mix.space > .0001) {
        // Só o Eco realimenta: o Espaço é um quarto, não um segundo eco.
        this.delayBuffer[this.delayIndex] = silenced ? 0 : dry + echo * .24 * mix.echo;
        this.delayIndex++; if (this.delayIndex >= delayLength) this.delayIndex = 0;
      }
      if (mix.chorus > .0001) {
        this.chorusBuffer[this.chorusIndex] = silenced ? 0 : dry;
        this.chorusIndex++; if (this.chorusIndex >= this.chorusBuffer.length) this.chorusIndex = 0;
      }
      if (!Number.isFinite(wetL)) wetL = 0;
      if (!Number.isFinite(wetR)) wetR = 0;
      const valueL = Math.tanh(wetL * 1.45), valueR = right ? Math.tanh(wetR * 1.45) : valueL;
      output[i] = valueL;
      if (right) right[i] = valueR;
      peak = Math.max(peak, Math.abs(valueL), Math.abs(valueR));
    }
    this.peak = Math.max(this.peak * .96, peak);
    this.rhythmClock += output.length / sampleRate;
    this.meterFrames += output.length;
    if (this.meterFrames >= sampleRate * .12) {
      this.port.postMessage({ type: 'meter', peak: this.peak, voices, cost: Math.max(0, Date.now() - processStart), lag: Math.round(this.signalAgeMs) });
      this.meterFrames = 0;
    }
    return true;
  }
}

registerProcessor('blobtrack-audio', BlobTrackAudioProcessor);
