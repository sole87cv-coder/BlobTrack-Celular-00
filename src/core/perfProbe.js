// Kit de medição do BlobTrack. Desligado por padrão: só ativa com ?perf=1.
// Não altera window.__blobtrackMetrics; publica window.__blobtrackPerf à parte.

const MAX_SAMPLES = 1200;
const ETAPAS = [
  'captura', 'readback', 'readbackDraw', 'readbackPixels', 'analise', 'estipple', 'renderWebGL',
  'overlay', 'composicao', 'janelas', 'audio', 'gravacao', 'glReadback',
];

function quantile(sorted, q) {
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index), high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function summarize(samples) {
  if (!samples.length) return { n: 0, p50: null, p95: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const round = value => Number(value.toFixed(3));
  return { n: sorted.length, p50: round(quantile(sorted, .5)), p95: round(quantile(sorted, .95)), max: round(sorted[sorted.length - 1]) };
}

export function createPerfProbe({
  enabled = false,
  performanceApi = globalThis.performance,
  observerClass = globalThis.PerformanceObserver,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  const active = enabled === true && Boolean(performanceApi?.mark);
  const samples = new Map();
  const events = new Map();
  const heap = [];
  let limiteMB = null;
  let seq = 0;

  function push(name, value) {
    if (!active || !Number.isFinite(value)) return;
    let list = samples.get(name);
    if (!list) { list = []; samples.set(name, list); }
    list.push(value);
    if (list.length > MAX_SAMPLES) list.shift();
  }

  // performance.mark/measure deixa cada etapa visível no flame chart do chrome://inspect.
  function stage(name, fn) {
    if (!active) return fn();
    const t0 = now();
    const id = ++seq;
    const startMark = `blobtrack:${name}:${id}:start`;
    const endMark = `blobtrack:${name}:${id}:end`;
    const measure = `blobtrack:${name}:${id}`;
    performanceApi.mark(startMark);
    let out;
    try {
      out = fn();
    } finally {
      performanceApi.mark(endMark);
      performanceApi.measure(measure, startMark, endMark);
      push(name, now() - t0);
      performanceApi.clearMarks(startMark);
      performanceApi.clearMarks(endMark);
      performanceApi.clearMeasures(measure);
    }
    return out;
  }

  function event(name) {
    if (active) events.set(name, now());
  }

  function memory() {
    if (!active) return null;
    const info = performanceApi.memory;
    if (!info) return null;
    const usedMB = info.usedJSHeapSize / 1048576;
    heap.push(usedMB);
    if (heap.length > MAX_SAMPLES) heap.shift();
    limiteMB = info.jsHeapSizeLimit ? Number((info.jsHeapSizeLimit / 1048576).toFixed(2)) : null;
    return Number(usedMB.toFixed(2));
  }

  function observe() {
    if (!active || typeof observerClass !== 'function') return false;
    const callback = list => {
      for (const entry of list.getEntries()) {
        push(entry.entryType === 'gc' ? 'gc' : 'longtask', entry.duration);
      }
    };
    try {
      const observer = new observerClass(callback);
      observer.observe({ entryTypes: ['longtask', 'gc'] });
      return true;
    } catch {
      try {
        const observer = new observerClass(callback);
        observer.observe({ entryTypes: ['longtask'] });
        return true;
      } catch {
        return false;
      }
    }
  }

  function etapas() {
    const result = {};
    for (const name of ETAPAS) result[name] = summarize(samples.get(name) || []);
    return result;
  }

  function report(meta = {}) {
    const saveStart = events.get('saveStart'), saveEnd = events.get('saveEnd');
    return {
      instrumentado: active,
      coletadoEm: new Date().toISOString(),
      ...meta,
      etapas: etapas(),
      longTasks: summarize(samples.get('longtask') || []),
      gc: summarize(samples.get('gc') || []),
      memoria: { usadoMB: summarize(heap), limiteMB },
      eventos: Object.fromEntries(events),
      salvamentoMs: Number.isFinite(saveStart) && Number.isFinite(saveEnd) && saveEnd >= saveStart
        ? Number((saveEnd - saveStart).toFixed(1)) : null,
    };
  }

  function reset() {
    samples.clear();
    events.clear();
    heap.length = 0;
    seq = 0;
  }

  return { active, stage, push, event, memory, observe, etapas, report, reset };
}
