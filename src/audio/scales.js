export const SCALE_IDS = Object.freeze(['live', 'minor', 'strange', 'tense']);
export const SCALE_DEFINITIONS = Object.freeze({
  live: Object.freeze({ id: 'live', label: 'Livre', description: 'pentatônica menor', sourceDegrees: Object.freeze([0, 3, 7, 12, 15, 19]) }),
  minor: Object.freeze({ id: 'minor', label: 'Menor', description: 'menor natural', sourceDegrees: Object.freeze([0, 2, 3, 5, 7, 8, 10]) }),
  strange: Object.freeze({ id: 'strange', label: 'Estranho', description: 'dórico', sourceDegrees: Object.freeze([0, 2, 3, 5, 7, 9, 10]) }),
  tense: Object.freeze({ id: 'tense', label: 'Tenso', description: 'menor harmônica', sourceDegrees: Object.freeze([0, 2, 3, 5, 7, 8, 11]) }),
});
export const LIVE_DEGREES = SCALE_DEFINITIONS.live.sourceDegrees;
const ZONE_COUNT = 6;
const isScaleId = id => SCALE_IDS.includes(id);

export function degreesForZones(id) {
  const scale = SCALE_DEFINITIONS[isScaleId(id) ? id : 'live'].sourceDegrees;
  if (id === 'live' || scale.length === ZONE_COUNT) return [...scale];
  return Array.from({ length: ZONE_COUNT }, (_unused, zone) => scale[Math.round(zone * (scale.length - 1) / (ZONE_COUNT - 1))]);
}

export function frequency(key, semitone) {
  const baseKey = Number.isFinite(key) ? Math.max(0, Math.min(11, key)) : 0;
  const degree = Number.isFinite(semitone) ? semitone : 0;
  return 130.8128 * 2 ** ((baseKey + degree) / 12);
}

export function applyScaleMessage(message, key = 0) {
  const selection = resolveScaleMessage(message);
  return { ...selection, frequencies: selection.degrees.map(degree => frequency(key, degree)) };
}
export function frequencies(key, id = 'live') {
  return degreesForZones(id).map(degree => frequency(key, degree));
}

export function resolveScaleMessage(message = {}) {
  if (!isScaleId(message.id) || message.id === 'live') return { id: 'live', degrees: [...LIVE_DEGREES] };
  const degrees = message.degrees;
  if (!Array.isArray(degrees) || degrees.length !== ZONE_COUNT || degrees.some(value => !Number.isInteger(value) || value < 0 || value > 36)) {
    return { id: 'live', degrees: [...LIVE_DEGREES] };
  }
  return { id: message.id, degrees: [...degrees] };
}