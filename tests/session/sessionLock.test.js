import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionLock } from '../../src/session/sessionLock.js';

function makeState(overrides = {}) {
  return {
    sessionBlocked: false,
    sessionReserved: false,
    claiming: false,
    ...overrides,
  };
}

function makeChannel() {
  const messages = [];
  return {
    postMessage(msg) { messages.push(msg); },
    get messages() { return messages; },
    clear() { messages.length = 0; },
  };
}

test('sessionLock acquire uses navigator.locks when available', async (t) => {
  const state = makeState();
  const channel = makeChannel();
  let lockCallback = null;
  const nav = {
    locks: {
      request(name, opts, cb) {
        lockCallback = cb;
        return { catch: () => {} };
      },
    },
  };

  const { acquire, release } = createSessionLock({ state, channel, tabId: 'tab1', nav });
  const promise = acquire();

  lockCallback(true);
  const result = await promise;

  assert.equal(result, true);
  assert.equal(state.sessionReserved, true);
  // navigator.locks path does not postMessage 'start'
  assert.ok(!channel.messages.some(m => m.type === 'start'));

  release();
  assert.equal(state.sessionReserved, false);
  assert.equal(channel.messages[channel.messages.length - 1].type, 'stop');
});

test('sessionLock acquire returns false when lock not available', async (t) => {
  const state = makeState();
  const channel = makeChannel();
  let lockCallback = null;
  const nav = {
    locks: {
      request(name, opts, cb) {
        lockCallback = cb;
        return { catch: () => {} };
      },
    },
  };

  const { acquire } = createSessionLock({ state, channel, tabId: 'tab1', nav });
  const promise = acquire();

  lockCallback(false);
  const result = await promise;

  assert.equal(result, false);
  assert.equal(state.sessionReserved, false);
});

test('sessionLock fallback uses BroadcastChannel claim/start', async (t) => {
  const state = makeState();
  const channel = makeChannel();
  const nav = {};

  const { acquire } = createSessionLock({ state, channel, tabId: 'tab2', nav });
  const result = await acquire();

  assert.equal(result, true);
  assert.equal(state.sessionReserved, true);
  assert.equal(channel.messages[0].type, 'claim');
  assert.equal(channel.messages[0].id, 'tab2');
  assert.equal(channel.messages[1].type, 'start');
  assert.equal(channel.messages[1].id, 'tab2');
});

test('sessionLock fallback returns false when sessionBlocked becomes true during claim', async (t) => {
  const state = makeState();
  const channel = makeChannel();
  const nav = {};

  // Simulate another tab claiming during our 220ms window
  setTimeout(() => { state.sessionBlocked = true; }, 100);

  const { acquire } = createSessionLock({ state, channel, tabId: 'tab3', nav });
  const result = await acquire();

  assert.equal(result, false);
  assert.equal(state.sessionReserved, false);
});

test('sessionLock release posts stop message', (t) => {
  const state = makeState({ sessionReserved: true });
  const channel = makeChannel();
  const { release } = createSessionLock({ state, channel, tabId: 'tab4' });

  release();

  assert.equal(state.sessionReserved, false);
  assert.equal(channel.messages[0].type, 'stop');
  assert.equal(channel.messages[0].id, 'tab4');
});

test('sessionLock release without acquired lock is safe', (t) => {
  const state = makeState({ sessionReserved: false });
  const channel = makeChannel();
  const { release } = createSessionLock({ state, channel, tabId: 'tab5' });

  release();

  assert.equal(state.sessionReserved, false);
  assert.equal(channel.messages[0].type, 'stop');
});
