import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('renderer factory initializes after all captured values', () => {
  const renderIndex = app.indexOf('const render = createRender(');
  assert.ok(renderIndex > 0);
  for (const declaration of [
    'const maskCanvas =',
    'const cropRect =',
    'const trailIds =',
    'let recordingSnapshot =',
    'function sendAudioOptions()',
  ]) assert.ok(app.indexOf(declaration) < renderIndex, `${declaration} must precede the renderer`);
});

test('recording snapshot retains identity shared with renderer', () => {
  assert.ok(app.includes('Object.assign(recordingSnapshot, snapshot);'));
  assert.ok(!app.includes('recordingSnapshot = snapshot;'));
});

test('production app uses the tested audio and session factories', () => {
  assert.ok(app.includes('const audioService = createAudio('));
  assert.ok(app.includes('sessionLock.acquire()'));
  assert.ok(app.includes('sessionLock.release()'));
  assert.ok(!app.includes('async function acquireSessionLock()'));
  assert.ok(!app.includes('async function makeAudio()'));
});

test('camera loop initializes the device profile factory before using its FPS', () => {
  const factoryIndex = app.indexOf("import { deviceProfile as createDeviceProfile } from './core/deviceProfile.js';");
  const profileIndex = app.indexOf('const deviceProfile = createDeviceProfile();');
  const firstFpsUse = app.indexOf('deviceProfile.fps');
  assert.ok(factoryIndex >= 0);
  assert.ok(profileIndex > factoryIndex && profileIndex < firstFpsUse);
});

test('viewport does not prevent user zoom', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1(?:\.0+)?/i);
});
