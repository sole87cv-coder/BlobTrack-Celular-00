const PREFERENCES_KEY = 'blobtrack-celular-00-preferences';

export function loadPreferences(readStoredValue = () => globalThis.localStorage?.getItem(PREFERENCES_KEY)) {
  try {
    const storedValue = readStoredValue();
    if (typeof storedValue !== 'string' || storedValue.length === 0) return {};
    const preferences = JSON.parse(storedValue);
    return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? preferences
      : {};
  } catch {
    return {};
  }
}
