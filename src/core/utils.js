export function clamp(n, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
}

export function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—';
}

export function formatRecordingTime(durationMs) {
  const totalSeconds = Math.floor(durationMs / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function recordingFileName(result, date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `BlobTrack_${stamp}.${result.extension || 'webm'}`;
}

export async function hasRecordingStorageHeadroom(storage = globalThis.navigator?.storage, minimumBytes = 100 * 1024 * 1024) {
  if (typeof storage?.estimate !== 'function') return true;
  try {
    const estimate = await storage.estimate();
    if (!Number.isFinite(estimate?.quota) || !Number.isFinite(estimate?.usage)) return true;
    return estimate.quota - estimate.usage >= minimumBytes;
  } catch {
    return true;
  }
}
