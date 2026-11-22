import assert from 'node:assert/strict';
import test from 'node:test';
import { createWakeLock } from '../../src/platform/wakeLock.js';

function makeSentinel() {
  const listeners = new Map();
  return {
    released: false,
    releaseCalls: 0,
    addEventListener(type, listener) { listeners.set(type, listener); },
    async release() {
      this.releaseCalls++;
      this.released = true;
      listeners.get('release')?.();
    },
  };
}

test('wake lock acquisition is idempotent and release clears its sentinel', async () => {
  const sentinel = makeSentinel();
  let requests = 0;
  const service = createWakeLock({
    navigatorObject: { wakeLock: { request: async () => { requests++; return sentinel; } } },
    documentObject: { visibilityState: 'visible' },
    isActive: () => true,
  });

  assert.equal(await service.acquire(), true);
  assert.equal(await service.acquire(), true);
  assert.equal(requests, 1);
  assert.equal(service.isHeld(), true);
  assert.equal(await service.release(), true);
  assert.equal(sentinel.releaseCalls, 1);
  assert.equal(service.isHeld(), false);
});

test('wake lock request racing with session stop is immediately released', async () => {
  let active = true;
  let resolveRequest;
  const sentinel = makeSentinel();
  const service = createWakeLock({
    navigatorObject: { wakeLock: { request: () => new Promise(resolve => { resolveRequest = resolve; }) } },
    documentObject: { visibilityState: 'visible' },
    isActive: () => active,
  });

  const pending = service.acquire();
  active = false;
  resolveRequest(sentinel);
  assert.equal(await pending, false);
  assert.equal(sentinel.releaseCalls, 1);
  assert.equal(service.isHeld(), false);
});

test('wake lock is not requested while inactive or hidden', async () => {
  let requests = 0;
  const service = createWakeLock({
    navigatorObject: { wakeLock: { request: async () => { requests++; return makeSentinel(); } } },
    documentObject: { visibilityState: 'hidden' },
    isActive: () => true,
  });

  assert.equal(await service.acquire(), false);
  assert.equal(requests, 0);
});