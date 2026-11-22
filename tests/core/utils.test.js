import assert from 'node:assert/strict';
import test from 'node:test';
import { clamp, fmt, formatRecordingTime, recordingFileName } from '../../src/core/utils.js';

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

test('recordingFileName generates filename with effect, timestamp and extension', (t) => {
  const result = { effect: 'invert', extension: 'webm' };
  const filename = recordingFileName(result);
  assert.ok(filename.startsWith('blobtrack-invert-'));
  assert.ok(filename.endsWith('.webm'));
  assert.match(filename, /blobtrack-invert-\d{8}-\d{6}\.webm/);
});

test('recordingFileName defaults effect to invert', (t) => {
  const result = { extension: 'mp4' };
  const filename = recordingFileName(result);
  assert.ok(filename.startsWith('blobtrack-invert-'));
});

test('recordingFileName defaults extension to webm', (t) => {
  const result = { effect: 'threshold' };
  const filename = recordingFileName(result);
  assert.ok(filename.endsWith('.webm'));
});
