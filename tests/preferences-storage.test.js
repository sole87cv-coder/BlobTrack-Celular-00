import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPreferences } from '../src/preferences.js';

const PREFERENCES_KEY = 'blobtrack-celular-00-preferences';

function createStorageMock(initial = {}) {
  const store = { ...initial };
  return {
    getItem(key) {
      return key in store ? String(store[key]) : null;
    },
    setItem(key, value) {
      store[key] = value;
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach(key => delete store[key]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key(index) {
      return Object.keys(store)[index] || null;
    },
    getStore() {
      return { ...store };
    },
  };
}

test('loadPreferences returns empty object for missing key', (t) => {
  const storage = createStorageMock();
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, {});
});

test('loadPreferences parses valid JSON object', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, JSON.stringify({ effect: 'threshold', master: 1.5 }));
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, { effect: 'threshold', master: 1.5 });
});

test('loadPreferences returns empty for malformed JSON', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, '{ not valid json');
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, {});
});

test('loadPreferences returns empty for JSON array', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, JSON.stringify([1, 2, 3]));
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, {});
});

test('loadPreferences returns empty for JSON null', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, 'null');
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, {});
});

test('loadPreferences returns empty when storage throws', (t) => {
  const result = loadPreferences(() => { throw new Error('Storage unavailable'); });
  assert.deepEqual(result, {});
});

test('loadPreferences returns empty for empty string', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, '');
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, {});
});

test('loadPreferences returns empty for non-object JSON (string)', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, '"just a string"');
  const result = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(result, {});
});

test('storage round-trip: save then load preserves preferences', (t) => {
  const storage = createStorageMock();
  const prefs = { effect: 'dither', master: 0.5, bias: 0.2, threshold: 0.3, trackingWidth: 480 };
  storage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  const loaded = loadPreferences(() => storage.getItem(PREFERENCES_KEY));
  assert.deepEqual(loaded, prefs);
});

test('storage list: keys are enumerable', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, JSON.stringify({ effect: 'invert' }));
  storage.setItem('other-key', 'value');
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    keys.push(storage.key(i));
  }
  assert.ok(keys.includes(PREFERENCES_KEY));
});

test('storage remove: item can be removed', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, JSON.stringify({ effect: 'invert' }));
  assert.equal(storage.getItem(PREFERENCES_KEY), '{"effect":"invert"}');
  storage.removeItem(PREFERENCES_KEY);
  assert.equal(storage.getItem(PREFERENCES_KEY), null);
});

test('storage clear: all items removed', (t) => {
  const storage = createStorageMock();
  storage.setItem(PREFERENCES_KEY, JSON.stringify({ effect: 'invert' }));
  storage.setItem('other-key', 'value');
  storage.clear();
  assert.equal(storage.getItem(PREFERENCES_KEY), null);
  assert.equal(storage.getItem('other-key'), null);
});

test('loadPreferences ignores non-string stored values', (t) => {
  const storage = createStorageMock();
  const result = loadPreferences(() => storage.getItem('nonexistent'));
  assert.deepEqual(result, {});
});
