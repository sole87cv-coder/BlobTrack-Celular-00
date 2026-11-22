import { SCALE_DEFINITIONS, SCALE_IDS, degreesForZones, frequencies as scaleFrequencies } from '../audio/scales.js';

export function attachScalesUI({ root, router, onSelect, getAudioContext = () => null, getKey = () => 0, isAudible = () => true } = {}) {
  if (!root || !router) return { cancelPreview() {}, destroy() {} };
  const radios = [...root.querySelectorAll('[role="radio"][data-scale-id]')];
  let previewOscillator = null;
  let previewGain = null;
  let previewTimer = null;
  const stopPreview = () => {
    if (previewTimer !== null) clearTimeout(previewTimer);
    previewTimer = null;
    const context = getAudioContext();
    if (previewGain && context?.state === 'running') {
      const now = context.currentTime;
      try { previewGain.gain.cancelScheduledValues(now); previewGain.gain.setTargetAtTime(0, now, .008); } catch {}
      try { previewOscillator?.stop(now + .04); } catch {}
    }
    previewOscillator = null;
    previewGain = null;
  };
  const playPreview = id => {
    stopPreview();
    const context = getAudioContext();
    if (!context || context.state !== 'running' || !isAudible()) return false;
    const key = getKey();
    const notes = scaleFrequencies(key, id);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(notes[0], now);
    for (let index = 1; index < notes.length; index++) oscillator.frequency.setValueAtTime(notes[index], now + index * .25);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.025, now + .035);
    gain.gain.setValueAtTime(.025, now + 1.88);
    gain.gain.linearRampToValueAtTime(0, now + 2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 2);
    previewOscillator = oscillator;
    previewGain = gain;
    previewTimer = setTimeout(() => { previewOscillator = null; previewGain = null; previewTimer = null; }, 2050);
    return true;
  };
  const sync = focusId => {
    const selected = router.getId();
    for (const radio of radios) {
      const active = radio.dataset.scaleId === selected;
      radio.setAttribute('aria-checked', String(active));
      radio.tabIndex = active ? 0 : -1;
    }
    if (focusId) radios.find(radio => radio.dataset.scaleId === focusId)?.focus();
  };
  const select = radio => {
    const id = radio?.dataset.scaleId;
    if (!SCALE_IDS.includes(id) || !router.setScale(id)) return;
    sync();
    const scale = { ...SCALE_DEFINITIONS[id], degrees: degreesForZones(id) };
    onSelect?.(scale);
    playPreview(id);
  };
  const onClick = event => select(event.currentTarget);
  for (const radio of radios) radio.addEventListener('click', onClick);
  const onKeydown = event => {
    const currentIndex = radios.indexOf(event.target);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % radios.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + radios.length) % radios.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = radios.length - 1;
    else return;
    event.preventDefault();
    const target = radios[nextIndex];
    target.focus();
    select(target);
  };
  root.addEventListener('keydown', onKeydown);
  sync();
  return {
    cancelPreview: stopPreview,
    destroy() {
      stopPreview();
      for (const radio of radios) radio.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
    },
  };
}