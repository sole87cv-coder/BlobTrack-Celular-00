import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPerfProbe } from '../../src/core/perfProbe.js';

function fakePerformance(times = []) {
  const calls = [];
  return {
    calls,
    now: () => times.shift() ?? 0,
    mark(name) { calls.push(['mark', name]); },
    measure(name, start, end) { calls.push(['measure', name, start, end]); },
    clearMarks(name) { calls.push(['clearMarks', name]); },
    clearMeasures(name) { calls.push(['clearMeasures', name]); },
  };
}

function probeWith(times = [], enabled = true, extra = {}) {
  const api = fakePerformance(times);
  const probe = createPerfProbe({ enabled, performanceApi: api, now: () => api.now(), ...extra });
  return { api, probe };
}

test('probe desligada não instrumenta e devolve o valor original', () => {
  const { api, probe } = probeWith([], false);
  assert.equal(probe.active, false);
  assert.equal(probe.stage('captura', () => 42), 42);
  assert.equal(probe.report().etapas.captura.n, 0);
  assert.equal(probe.observe(), false);
  assert.deepEqual(api.calls, []);
});

test('probe ligada mede a etapa com mark/measure e limpa os marks', () => {
  const { api, probe } = probeWith([100, 112.5]);
  assert.equal(probe.stage('captura', () => 'ok'), 'ok');
  const report = probe.report();
  assert.equal(report.instrumentado, true);
  assert.deepEqual(report.etapas.captura, { n: 1, p50: 12.5, p95: 12.5, max: 12.5 });
  assert.deepEqual(probe.etapas().captura, report.etapas.captura);
  assert.ok(api.calls.some(call => call[0] === 'measure' && call[1] === 'blobtrack:captura:1'));
  assert.equal(api.calls.filter(call => call[0] === 'clearMarks').length, 2);
});

test('relatório traz p50, p95 e máximo por etapa', () => {
  const { probe } = probeWith();
  for (const value of [10, 20, 30, 40]) probe.push('overlay', value);
  assert.deepEqual(probe.report().etapas.overlay, { n: 4, p50: 25, p95: 38.5, max: 40 });
});

test('relatório separa a cópia do readback do getImageData', () => {
  const { probe } = probeWith();
  probe.push('readbackDraw', 25);
  probe.push('readbackPixels', 6);
  const report = probe.report();
  assert.deepEqual(report.etapas.readbackDraw, { n: 1, p50: 25, p95: 25, max: 25 });
  assert.deepEqual(report.etapas.readbackPixels, { n: 1, p50: 6, p95: 6, max: 6 });
});

test('eventos de salvamento, memória e reset', () => {
  const { api, probe } = probeWith([5, 125]);
  api.memory = { usedJSHeapSize: 1048576, jsHeapSizeLimit: 104857600 };
  probe.event('saveStart');
  probe.event('saveEnd');
  assert.equal(probe.memory(), 1);
  const report = probe.report();
  assert.equal(report.salvamentoMs, 120);
  assert.equal(report.memoria.limiteMB, 100);
  assert.deepEqual(report.memoria.usadoMB, { n: 1, p50: 1, p95: 1, max: 1 });
  probe.reset();
  assert.equal(probe.report().memoria.usadoMB.n, 0);
  assert.equal(probe.report().salvamentoMs, null);
});

test('observer usa apenas longtask quando gc não é suportado', () => {
  const seen = [];
  class FakeObserver {
    observe(options) {
      seen.push(options.entryTypes.slice());
      if (options.entryTypes.includes('gc')) throw new Error('gc unsupported');
      this.cb({ getEntries: () => [{ entryType: 'longtask', duration: 60 }] });
    }
    constructor(cb) { this.cb = cb; }
  }
  const { probe } = probeWith([], true, { observerClass: FakeObserver });
  assert.equal(probe.observe(), true);
  assert.deepEqual(seen, [['longtask', 'gc'], ['longtask']]);
  assert.deepEqual(probe.report().longTasks, { n: 1, p50: 60, p95: 60, max: 60 });
});

test('app publica kit separado e o service worker precacheia o módulo', async () => {
  const app = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.ok(app.includes("import { createPerfProbe } from './core/perfProbe.js';"));
  assert.ok(app.includes("new URLSearchParams(location.search).get('perf') === '1'"));
  assert.ok(app.includes('window.__blobtrackPerf = {'));
  for (const key of ['fps:', 'tAnalysis:', 'tRender:', 'effectsPaused:']) assert.ok(app.includes(key), key);
  for (const key of ['pauseReason: state.performance.pauseReason', 'pauseCount: state.performance.pauseCount', 'tPorEfeito: perfProbe.active ? perfProbe.etapas() : null']) assert.ok(app.includes(key), key);
  for (const key of ["perfProbe.stage('readbackDraw'", "perfProbe.stage('readbackPixels'", 'fps: Number((state.performance.fpsAverage || 0).toFixed(2))', 'trackingWidth: state.trackingWidth']) assert.ok(app.includes(key), key);
  assert.match(sw, /\.\/src\/core\/perfProbe\.js/);
});
