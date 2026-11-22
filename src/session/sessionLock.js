export function createSessionLock({
  state,
  channel,
  tabId,
  nav = globalThis.navigator,
  onLockAcquired,
  onLockReleased,
}) {
  let releaseLock = null;

  async function acquire() {
    state.sessionBlocked = false;

    if (nav?.locks?.request) {
      let resolveLock;
      const acquired = new Promise(resolve => { resolveLock = resolve; });
      let unlock;
      const hold = new Promise(resolve => { unlock = resolve; });

      nav.locks.request('blobtrack-celular-00-session', { ifAvailable: true }, lock => {
        resolveLock(Boolean(lock));
        if (!lock) return;
        releaseLock = unlock;
        state.sessionReserved = true;
        if (typeof onLockAcquired === 'function') onLockAcquired();
        return hold;
      }).catch(() => resolveLock(false));

      return acquired;
    }

    state.claiming = true;
    channel?.postMessage({ type: 'claim', id: tabId });
    await new Promise(resolve => setTimeout(resolve, 220));
    state.claiming = false;
    if (state.sessionBlocked) return false;
    state.sessionReserved = true;
    channel?.postMessage({ type: 'start', id: tabId });
    if (typeof onLockAcquired === 'function') onLockAcquired();
    return true;
  }

  function release() {
    if (releaseLock) {
      releaseLock();
      releaseLock = null;
      if (typeof onLockReleased === 'function') onLockReleased();
    }
    state.sessionReserved = false;
    channel?.postMessage({ type: 'stop', id: tabId });
  }

  return { acquire, release, get releaseLock() { return releaseLock; } };
}
