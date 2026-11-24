import assert from 'node:assert/strict';
import test from 'node:test';
import { clamp, fmt, formatRecordingTime, recordingFileName, hasRecordingStorageHeadroom } from '../../src/core/utils.js';

test('clamp limits value to [lo, hi]', (t) => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(5, 0, 10), 5);
});

test('clamp defaults to [0, 1]', (t) => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(2), 1);
  assert.equal(clamp(0.5), 0.5);
});

test('clamp returns 0 for non-finite values', (t) => {
  assert.equal(clamp(NaN, 0, 10), 0);
  assert.equal(clamp(Infinity, 0, 10), 0);
  assert.equal(clamp(-Infinity, 0, 10), 0);
});

test('fmt formats with comma decimal separator', (t) => {
  assert.equal(fmt(1.5), '1,50');
  assert.equal(fmt(1.555), '1,55');
});

test('fmt with custom decimals', (t) => {
  assert.equal(fmt(1.5, 1), '1,5');
  assert.equal(fmt(1.5, 0), '2');
});

test('fmt returns dash for non-finite', (t) => {
  assert.equal(fmt(NaN), '—');
  assert.equal(fmt(Infinity), '—');
});

test('formatRecordingTime converts ms to mm:ss', (t) => {
  assert.equal(formatRecordingTime(0), '00:00');
  assert.equal(formatRecordingTime(5000), '00:05');
  assert.equal(formatRecordingTime(65000), '01:05');
  assert.equal(formatRecordingTime(3661000), '61:01');
});

test('recordingFileName follows the BlobTrack date-time format', (t) => {
  const filename = recordingFileName({ extension: 'webm' }, new Date(2026, 0, 2, 3, 4, 5));
  assert.equal(filename, 'BlobTrack_2026-01-02_03-04-05.webm');
});

test('recordingFileName defaults extension to webm', (t) => {
  const filename = recordingFileName({}, new Date(2026, 0, 2, 3, 4, 5));
  assert.equal(filename, 'BlobTrack_2026-01-02_03-04-05.webm');
});

test('recording storage API absence or failure does not block recording', async () => {
  assert.equal(await hasRecordingStorageHeadroom(null), true);
  assert.equal(await hasRecordingStorageHeadroom({ estimate: async () => { throw new Error('unavailable'); } }), true);
});

test('recording requires at least 100 MB of available storage', async () => {
  assert.equal(await hasRecordingStorageHeadroom({ estimate: async () => ({ quota: 500_000_000, usage: 350_000_000 }) }), true);
  assert.equal(await hasRecordingStorageHeadroom({ estimate: async () => ({ quota: 500_000_000, usage: 401_000_000 }) }), false);
});
