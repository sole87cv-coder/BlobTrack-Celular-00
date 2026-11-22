import { SCALE_IDS, degreesForZones, frequencies } from './scales.js';
export const SCALE_STORAGE_KEY = 'blobtrack-celular-00-scale';

export function createScaleRouter(options = {}) {
  let storage = options.storage;
  if (!Object.prototype.hasOwnProperty.call(options, 'storage')) { try { storage = globalThis.localStorage; } catch {} }
  let selected = 'live';
  let storedChoice = false;
  try {
    const saved = storage?.getItem(SCALE_STORAGE_KEY);
    if (SCALE_IDS.includes(saved)) { selected = saved; storedChoice = true; }
  } catch {}

  return {
    getScale() { return { id: selected, degrees: degreesForZones(selected) }; },
    getId() { return selected; },
    hasStoredChoice() { return storedChoice; },
    setScale(id) {
      if (!SCALE_IDS.includes(id)) return false;
      selected = id;
      storedChoice = true;
      try { storage?.setItem(SCALE_STORAGE_KEY, id); } catch {}
      return true;
    },
    frequencies(key) { return frequencies(key, selected); },
  };
}