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
        this.signals = data.signals || this.signals;
        this.master = data.master;
        this.muted = data.muted;
        this.sensitivity = Number.isFinite(data.sensitivity) ? Math.min(3, Math.max(0, data.sensitivity)) : 1;
        this.audioEnabled = data.audioEnabled !== false;
        this.setSoundOptions(data);
      }
      if (data.type === 'sound') this.setSoundOptions(data);
      if (data.type === 'mute') this.muted = data.muted;
      if (data.type === 'audioEnabled') this.audioEnabled = data.enabled !== false;
      if (data.type === 'sensitivity') this.sensitivity = Number.isFinite(data.value) ? Math.min(3, Math.max(0, data.value)) : 1;
    };
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
    // Pentatônica menor em duas oitavas: mantém as seis zonas consonantes.
    const scale = [0, 3, 7, 12, 15, 19];
    for (let z = 0; z < scale.length; z++) this.baseFrequency[z] = 130.8128 * Math.pow(2, (this.key + scale[z]) / 12);
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const s = this.signals;
    const energy = unitAudioSignal(s.energy), density = unitAudioSignal(s.density), speed = unitAudioSignal(s.speed), ambient = unitAudioSignal(s.ambient);
    const target = (this.muted || !this.audioEnabled) ? 0 : Math.min(2, Math.max(0, Number.isFinite(this.master) ? this.master : 1));
    const sens = Number.isFinite(this.sensitivity) ? Math.min(3, Math.max(0, this.sensitivity)) : 1;
    const gainAttack = 1 - Math.exp(-1 / (sampleRate * .035));
    const gainRelease = 1 - Math.exp(-1 / (sampleRate * .12));
    const attack = 1 - Math.exp(-1 / (sampleRate * .025));
    const release = 1 - Math.exp(-1 / (sampleRate * .11));
    const timbreFadeStep = 1 / (sampleRate * .045);
    const lfoHz = .14 + speed * 2.8 + energy * .55;
    let voices = 0;

    for (let z = 0; z < 6; z++) {
      const zone = unitAudioSignal(s.zones?.[z]);
      this.voiceTargets[z] = Math.min(.46, zone * (.16 + .20 * energy) * (.75 + .5 * speed) * sens);
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

      const air = Math.min(.08, speed * .055 * Math.max(.5, sens));
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
      output[i] = Math.tanh(wet * 1.45);
      peak = Math.max(peak, Math.abs(output[i]));
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
