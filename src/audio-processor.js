class BlobTrackAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.signals = { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: [0,0,0,0,0,0] };
    this.master = 1; this.muted = false; this.sensitivity = 1; this.audioEnabled = true; this.phase = new Float64Array(8); this.gain = 0; this.peak = 0; this.meterFrames = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'signals') {
        this.signals = data.signals; this.master = data.master; this.muted = data.muted;
        this.sensitivity = Number.isFinite(data.sensitivity) ? Math.min(3, Math.max(0, data.sensitivity)) : 1;
        this.audioEnabled = data.audioEnabled !== false;
      }
      if (data.type === 'mute') this.muted = data.muted;
      if (data.type === 'audioEnabled') this.audioEnabled = data.enabled !== false;
      if (data.type === 'sensitivity') this.sensitivity = Number.isFinite(data.value) ? Math.min(3, Math.max(0, data.value)) : 1;
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0]?.[0]; if (!output) return true;
    const s = this.signals || { energy: 0, density: 0, speed: 0, coherence: 0, ambient: 0, zones: [0,0,0,0,0,0] };
    const target = (this.muted || !this.audioEnabled) ? 0 : Math.min(2, Math.max(0, Number.isFinite(this.master) ? this.master : 1));
    const sens = Number.isFinite(this.sensitivity) ? Math.min(3, Math.max(0, this.sensitivity)) : 1;
    if (!s.zones || s.zones.length !== 6) s.zones = [0,0,0,0,0,0];
    const ramp = 1 - Math.exp(-128 / (sampleRate * .12));
    let peak = 0;
    let voices = 0;
    for (let z = 0; z < 6; z++) if (s.zones[z] * (.10 + .07*s.energy) > .01) voices++;
    const processStart = Date.now();
    for (let i = 0; i < output.length; i++) {
      this.gain += (target - this.gain) * ramp;
      let sample = .12 * s.ambient * Math.sin(this.phase[6]); this.phase[6] += 2*Math.PI*55/sampleRate;
      for (let z = 0; z < 6; z++) {
        const amp = Math.min(.42, s.zones[z] * (.10 + .07*s.energy) * sens);
        const col = z%3, row = Math.floor(z/3), semitone = [0,3,7][col] + (1-row)*12;
        const hz = 220*Math.pow(2,(semitone-9)/12); this.phase[z] += 2*Math.PI*hz/sampleRate; if(this.phase[z]>Math.PI*2)this.phase[z]-=Math.PI*2;
        sample += amp * (Math.sin(this.phase[z])*.65 + Math.sin(this.phase[z]*2)*.12);
      }
      if (!Number.isFinite(sample)) sample = 0;
      const air = Math.min(.09, s.speed * .035 * Math.max(.5, sens)); sample += air * Math.sin(this.phase[7]); this.phase[7] += 2*Math.PI*(180+700*s.speed)/sampleRate;
      sample *= this.gain; output[i] = Math.tanh(sample); peak = Math.max(peak,Math.abs(output[i]));
    }
    this.peak = Math.max(this.peak*.96,peak); this.meterFrames += output.length;
    if(this.meterFrames >= sampleRate*.12){this.port.postMessage({type:'meter',peak:this.peak,voices:Math.min(6,voices),cost:Math.max(0,Date.now()-processStart)});this.meterFrames=0;}
    return true;
  }
}
registerProcessor('blobtrack-audio', BlobTrackAudioProcessor);
