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

export function recordingFileName(result) {
  const date = new Date();
  const pad = value => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `blobtrack-${result.effect || 'invert'}-${stamp}.${result.extension || 'webm'}`;
}
