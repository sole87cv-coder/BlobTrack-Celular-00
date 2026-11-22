export function createWakeLock({
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  isActive = () => true,
  onError = () => {},
} = {}) {
  let sentinel = null;
  let pending = null;

  function held() {
    return Boolean(sentinel && sentinel.released !== true);
  }

  async function acquire() {
    if (!isActive() || documentObject?.visibilityState === 'hidden') return false;
    if (held()) return true;
    if (pending) return pending;
    if (typeof navigatorObject?.wakeLock?.request !== 'function') return false;

    pending = (async () => {
      try {
        const candidate = await navigatorObject.wakeLock.request('screen');
        if (!isActive() || documentObject?.visibilityState === 'hidden') {
          await candidate.release();
          return false;
        }
        sentinel = candidate;
        candidate.addEventListener?.('release', () => {
          if (sentinel === candidate) sentinel = null;
        }, { once: true });
        return true;
      } catch (error) {
        onError(error);
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  async function release() {
    const current = sentinel;
    sentinel = null;
    if (!current || current.released === true) return false;
    try {
      await current.release();
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  }

  return { acquire, release, isHeld: held };
}