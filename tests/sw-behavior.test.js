import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);

async function collectAppModules(asset, found = new Set()) {
  if (found.has(asset)) return found;
  found.add(asset);
  const source = await readFile(new URL(asset, projectRoot), 'utf8');
  const imports = /\b(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g;
  for (const [, specifier] of source.matchAll(imports)) {
    const target = new URL(specifier, new URL(asset, projectRoot));
    const relativePath = path.relative(fileURLToPath(projectRoot), fileURLToPath(target)).replaceAll('\\', '/');
    const childAsset = `./${relativePath}`;
    if (childAsset.startsWith('./src/')) await collectAppModules(childAsset, found);
  }
  return found;
}

function cacheKey(request) {
  return new URL(typeof request === 'string' ? request : request.url, 'https://app.test/').href;
}

function makeCacheStore(names = []) {
  const stores = new Map(names.map(name => [name, new Map()]));
  const cacheFor = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async addAll(assets) { for (const asset of assets) entries.set(cacheKey(asset), new Response(asset)); },
      async match(request) { return entries.get(cacheKey(request))?.clone() || undefined; },
      async put(request, response) { entries.set(cacheKey(request), response.clone()); },
    };
  };
  return {
    stores,
    async open(name) { cacheFor(name); return cacheFor(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
}

async function loadWorker({ names = [], fetchImpl = async () => new Response('network') } = {}) {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const caches = makeCacheStore(names);
  const self = {
    location: { origin: 'https://app.test' },
    clients: { claim: async () => {} },
    skipWaiting() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise });
  return { listeners, caches };
}

function dispatchFetch(handler, request) {
  const waits = [];
  let responsePromise;
  handler({
    request,
    respondWith(promise) { responsePromise = promise; },
    waitUntil(promise) { waits.push(promise); },
  });
  return { responsePromise, waits };
}

test('service worker cache version and shell are present, unique and readable', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const cache = sw.match(/const CACHE = '([^']+)';/);
  const shellMatch = sw.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(cache && cache[1].length > 0);
  assert.ok(shellMatch);
  const shell = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(([, asset]) => asset);
  assert.equal(shell.length, new Set(shell).size);
  for (const asset of shell) await readFile(new URL(asset, projectRoot));
});

test('service worker shell includes the complete app import graph', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const shellMatch = sw.match(/const SHELL = \[(.*?)\];/s);
  const shell = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(([, asset]) => asset);
  for (const asset of await collectAppModules('./src/app.js')) assert.ok(shell.includes(asset), `${asset} must be precached`);
});

test('service worker install precaches the shell and activates immediately', async () => {
  const { listeners, caches } = await loadWorker();
  const waits = [];
  listeners.get('install')({ waitUntil(promise) { waits.push(promise); } });
  await Promise.all(waits);
  assert.ok(caches.stores.has('blobtrack-celular-00-v76'));
});

test('activation removes only previous BlobTrack caches', async () => {
  const { listeners, caches } = await loadWorker({ names: ['blobtrack-celular-00-v25', 'another-app-v1'] });
  const waits = [];
  listeners.get('activate')({ waitUntil(promise) { waits.push(promise); } });
  await Promise.all(waits);
  assert.deepEqual(await caches.keys(), ['another-app-v1']);
});

test('activation preserves current cache and deletes only older BlobTrack caches', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const current = sw.match(/const CACHE = '([^']+)';/)?.[1];
  const { listeners, caches } = await loadWorker({
    names: ['blobtrack-celular-00-v25', current, 'another-app-v1'],
  });
  const waits = [];
  listeners.get('activate')({ waitUntil(promise) { waits.push(promise); } });
  await Promise.all(waits);
  assert.deepEqual(await caches.keys(), [current, 'another-app-v1']);
});

test('successful same-origin network response is cached and its write is awaited', async () => {
  const { listeners, caches } = await loadWorker({ fetchImpl: async () => new Response('asset') });
  const request = { method: 'GET', mode: 'cors', url: 'https://app.test/src/new-module.js' };
  const event = dispatchFetch(listeners.get('fetch'), request);
  assert.equal(await (await event.responsePromise).text(), 'asset');
  await Promise.all(event.waits);
  const cached = await (await caches.open('blobtrack-celular-00-v76')).match(request);
  assert.equal(await cached.text(), 'asset');
});

test('offline navigation falls back to cached index', async () => {
  const { listeners, caches } = await loadWorker({ fetchImpl: async () => { throw new Error('offline'); } });
  const cache = await caches.open('blobtrack-celular-00-v76');
  await cache.put('./index.html', new Response('cached app shell'));
  const event = dispatchFetch(listeners.get('fetch'), { method: 'GET', mode: 'navigate', url: 'https://app.test/' });
  assert.equal(await (await event.responsePromise).text(), 'cached app shell');
  await Promise.all(event.waits);
});

test('offline script request preserves its network error instead of returning HTML', async () => {
  const { listeners } = await loadWorker({ fetchImpl: async () => { throw new Error('offline'); } });
  const event = dispatchFetch(listeners.get('fetch'), { method: 'GET', mode: 'cors', url: 'https://app.test/src/missing.js' });
  await assert.rejects(event.responsePromise, /offline/);
  await Promise.all(event.waits);
});

test('service worker ignores non-GET and cross-origin requests', async () => {
  const { listeners } = await loadWorker();
  for (const request of [
    { method: 'POST', mode: 'cors', url: 'https://app.test/api' },
    { method: 'GET', mode: 'cors', url: 'https://other.test/asset.js' },
  ]) {
    let intercepted = false;
    listeners.get('fetch')({ request, respondWith() { intercepted = true; }, waitUntil() {} });
    assert.equal(intercepted, false);
  }
});
