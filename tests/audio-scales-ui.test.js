import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createScaleRouter } from '../src/audio/scale-router.js';
import { attachScalesUI } from '../src/ui/scales-ui.js';

class FakeButton {
  constructor(id) { this.dataset = { scaleId: id }; this.attributes = new Map(); this.listeners = new Map(); this.tabIndex = -1; this.focused = false; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  focus() { this.focused = true; }
  click() { this.listeners.get('click')?.({ currentTarget: this }); }
}
class FakeRoot {
  constructor(radios) { this.radios = radios; this.listeners = new Map(); }
  querySelectorAll() { return this.radios; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
}
function setup(audioContext = null) {
  const radios = ['live', 'minor', 'strange', 'tense'].map(id => new FakeButton(id));
  const root = new FakeRoot(radios);
  const writes = [];
  const router = createScaleRouter({ storage: { getItem: () => null, setItem: (...args) => writes.push(args) } });
  const selections = [];
  const ui = attachScalesUI({ root, router, onSelect: scale => selections.push(scale), getAudioContext: () => audioContext, getKey: () => 0 });
  return { radios, root, router, writes, selections, ui };
}

test('scale UI marks only Livre initially and updates its radio selection on click', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="audioScales"[^>]*role="radiogroup" aria-label="Escala musical"/);
  for (const id of ['live', 'minor', 'strange', 'tense']) assert.match(html, new RegExp(`id="scale-${id}"[^>]*role="radio"`));
  assert.equal((html.match(/role="radio" aria-checked="true"/g) || []).length, 1);
  assert.match(html, /id="audioTimbre"/);
  const { radios, router, writes, selections } = setup();
  assert.equal(radios.filter(button => button.getAttribute('aria-checked') === 'true').length, 1);
  assert.deepEqual(selections, []);
  assert.equal(radios[0].tabIndex, 0);
  radios[2].click();
  assert.equal(router.getId(), 'strange');
  assert.equal(radios[2].getAttribute('aria-checked'), 'true');
  assert.equal(radios[0].getAttribute('aria-checked'), 'false');
  assert.deepEqual(writes, [['blobtrack-celular-00-scale', 'strange']]);
  assert.equal(selections[0].id, 'strange');
});

test('radio keyboard navigation moves, selects and focuses the next scale', () => {
  const { root, radios, router, writes } = setup();
  let prevented = false;
  root.listeners.get('keydown')({ target: radios[0], key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(radios[1].focused, true);
  assert.equal(router.getId(), 'minor');
  assert.equal(writes.at(-1)[1], 'minor');
});

test('preview only uses a running existing context and cancels the previous two-second tone', () => {
  const stopped = [];
  let oscillatorCount = 0;
  const context = {
    state: 'running', currentTime: 10, destination: {},
    createOscillator() { oscillatorCount++; return { frequency: { setValueAtTime() {} }, connect(node) { return node; }, start() {}, stop(time) { stopped.push(time); } }; },
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() { return this; } }; },
  };
  const { radios, ui } = setup(context);
  radios[0].click();
  radios[1].click();
  assert.equal(oscillatorCount, 2);
  assert.equal(stopped[0], 12);
  assert.equal(stopped[1], 10.04);
  assert.equal(stopped[2], 12);
  ui.destroy();
});

test('preview does not start while the existing context is suspended and creates no context', () => {
  let oscillatorCount = 0;
  const context = { state: 'suspended', currentTime: 0, createOscillator() { oscillatorCount++; }, createGain() { oscillatorCount++; } };
  const { radios, ui } = setup(context);
  radios[1].click();
  assert.equal(oscillatorCount, 0);
  ui.destroy();
});