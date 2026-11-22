export function deviceProfile(nav = globalThis.navigator) {
  const memory = Number(nav?.deviceMemory) || 4;
  const cores = Number(nav?.hardwareConcurrency) || 4;
  if (memory <= 3 || cores <= 4) {
    return { name: 'leve', maxWidth: 320, startWidth: 240, fps: 20, captureWidth: 640, pixelRatio: 1 };
  }
  if (memory <= 6 || cores <= 6) {
    return { name: 'equilibrado', maxWidth: 480, startWidth: 320, fps: 24, captureWidth: 960, pixelRatio: 1.5 };
  }
  return { name: 'alto', maxWidth: 640, startWidth: 480, fps: 30, captureWidth: 1280, pixelRatio: 2 };
}
