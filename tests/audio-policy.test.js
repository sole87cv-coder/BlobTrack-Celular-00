import test from 'node:test';
import assert from 'node:assert/strict';
import { SpawnPolicy } from '../src/audio/audio.js';

test('mallet maps left-to-right blob movement to ascending notes', () => {
  let history = {};
  const first = SpawnPolicy('easy-mallet', { time: 0, blobs: [{ id: 1, x: .05, y: .5, size: 300, speed: 1 }] }, history);
  history = first.history;
  let time = .1;
  const notes = [];
  for (const x of [.36, .7, .98]) {
    const result = SpawnPolicy('easy-mallet', { time, blobs: [{ id: 1, x, y: .5, size: 300, speed: 1 }] }, history);
    history = result.history;
    notes.push(...result.commands.filter(command => command.type === 'note'));
    time += .1;
  }
  assert.ok(notes.length >= 2);
  assert.ok(notes.every((note, index) => index === 0 || note.frequency > notes[index - 1].frequency));
});

test('four stationary blobs do not retrigger mallet notes', () => {
  const blobs = [0, 1, 2, 3].map((id) => ({ id, x: .2 + id * .1, y: .5, size: 256, speed: 0 }));
  const initial = SpawnPolicy('easy-mallet', { time: 0, blobs });
  const stationary = SpawnPolicy('easy-mallet', { time: 1, blobs }, initial.history);
  assert.equal(stationary.commands.filter(command => command.type === 'note').length, 0);
});

test('pulse energy 0.8 produces a logarithmic tempo in 120–140 BPM', () => {
  const result = SpawnPolicy('fun-pulse', { time: 0, energy: .8, blobs: [{ id: 1, x: .5, y: .5, size: 200, speed: .4 }] });
  assert.ok(result.bpm >= 120 && result.bpm <= 140);
});

test('low coherence selects chaotic float chord voicing', () => {
  const result = SpawnPolicy('float-chords', { time: 0, energy: .2, coherence: .1, blobs: [{ id: 1, x: .4, y: .2, size: 800, speed: .1 }] });
  const chord = result.commands.find(command => command.type === 'chord');
  assert.equal(chord.chaotic, true);
  assert.equal(chord.notes.length, 4);
});