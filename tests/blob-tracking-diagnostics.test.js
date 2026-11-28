import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BlobTrackerCore } from '../src/domain/blobTrackerCore.js';

const width = 320;
const height = 180;

function createFrame() {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const context = { drawImage() {}, getImageData: () => ({ data: pixels }) };
  return { pixels, context, canvas: { width: 0, height: 0 }, video: { videoWidth: width, videoHeight: height } };
}

function fillBackground(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 36;
    pixels[i + 3] = 255;
  }
}

function setBox(pixels, left, top, color = 230, size = 10) {
  for (let y = top; y < top + size; y++) for (let x = left; x < left + size; x++) {
    const index = (y * width + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = color;
  }
}

function fillGray(pixels, value) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
}

function update(tracker, fixture) {
  return tracker.updatePixels(fixture.pixels, width, height, 0.18, 1 / 24);
}

function initialize(tracker, fixture) {
  fillBackground(fixture.pixels);
  update(tracker, fixture);
}

test('id sobrevive a 2 frames ausente e reaparece no mesmo id', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 20, 30);
  const firstId = update(tracker, fixture).blobs[0].id;

  fillBackground(fixture.pixels);
  assert.equal(update(tracker, fixture).blobs.length, 0);
  assert.equal(update(tracker, fixture).blobs.length, 0);
  setBox(fixture.pixels, 26, 30);
  assert.equal(update(tracker, fixture).blobs[0].id, firstId);
});

test('idsNew informa somente os IDs criados no quadro atual', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 20, 30);
  assert.equal(update(tracker, fixture).raw.idsNew, 1);
  assert.equal(update(tracker, fixture).raw.idsNew, 0);
});

test('id novo após 4 frames ausente', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 20, 30);
  const firstId = update(tracker, fixture).blobs[0].id;

  fillBackground(fixture.pixels);
  for (let i = 0; i < 4; i++) assert.equal(update(tracker, fixture).blobs.length, 0);
  setBox(fixture.pixels, 20, 30);
  const result = update(tracker, fixture);
  assert.notEqual(result.blobs[0].id, firstId);
  assert.equal(result.raw.idsNew, 1);
});

test('cruzamento em X mantém ids em >= 90% dos frames (2 manchas 10×10, 40 frames)', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  let firstRowId = 0;
  let secondRowId = 0;
  let stable = 0;
  const observed = [];

  for (let frame = 0; frame < 40; frame++) {
    fillBackground(fixture.pixels);
    const pathFrame = Math.min(frame, 7);
    const ax = 20 + pathFrame * 30;
    const ay = 10 + pathFrame * 17;
    const bx = 230 - pathFrame * 30;
    const by = 129 - pathFrame * 17;
    setBox(fixture.pixels, ax, ay);
    setBox(fixture.pixels, bx, by);
    const blobs = update(tracker, fixture).blobs;
    if (blobs.length !== 2) continue;
    const findAt = (x, y) => blobs.reduce((best, blob) => {
      const distance = (blob.x * width - (x + 4.5)) ** 2 + (blob.y * height - (y + 4.5)) ** 2;
      return !best || distance < best.distance ? { blob, distance } : best;
    }, null)?.blob;
    const a = findAt(ax, ay);
    const b = findAt(bx, by);
    if (!a || !b || a === b) continue;
    if (frame === 0) { firstRowId = a.id; secondRowId = b.id; }
    if (a.id === firstRowId && b.id === secondRowId) stable++;
    observed.push([frame, a.id, b.id, firstRowId, secondRowId]);
  }
  assert.ok(stable / 40 >= 0.9, `stable identity ratio was ${(stable / 40).toFixed(2)}: ${JSON.stringify(observed)}`);
});

test('blob que sai pela borda não duplica id ao voltar pelo mesmo lado dentro de 3 frames', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 280, 30);
  const firstId = update(tracker, fixture).blobs[0].id;
  fillBackground(fixture.pixels);
  setBox(fixture.pixels, 290, 30);
  assert.equal(update(tracker, fixture).blobs[0].id, firstId);
  fillBackground(fixture.pixels);
  setBox(fixture.pixels, 310, 30);
  assert.equal(update(tracker, fixture).blobs[0].id, firstId);

  fillBackground(fixture.pixels);
  update(tracker, fixture);
  update(tracker, fixture);
  setBox(fixture.pixels, 304, 30);
  const returned = update(tracker, fixture).blobs[0];
  assert.equal(returned.id, firstId);
});

test('frame sem movimento continua com blobs.length === 0', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  const result = update(tracker, fixture);
  assert.equal(result.blobs.length, 0);
});

test('velocidade do teste existente permanece na mesma fórmula', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 15, 15);
  update(tracker, fixture);
  fillBackground(fixture.pixels);
  setBox(fixture.pixels, 20, 15);
  const result = update(tracker, fixture);
  assert.ok(Math.abs(result.blobs[0].speed - (5 / width / (1 / 24) / 2)) < 0.0001);
});

test('grade adaptativa reutilizada não apaga uma mancha forte sobre fundo estável', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 40, 40, 151);
  let result;
  for (let i = 0; i < 9; i++) result = update(tracker, fixture);
  assert.equal(result.blobs.length, 1);
});

test('absorve objeto parado após persistência sem apagar objeto em movimento contínuo', () => {
  const stationary = new BlobTrackerCore({ stationaryAbsorbFrames: 8 });
  const stillFrame = createFrame();
  initialize(stationary, stillFrame);
  setBox(stillFrame.pixels, 40, 40, 230, 12);
  let result;
  for (let i = 0; i < 7; i++) result = update(stationary, stillFrame);
  assert.equal(result.blobs.length, 1, 'objeto segue visível antes do limite K');
  result = update(stationary, stillFrame);
  assert.equal(result.blobs.length, 0, 'objeto deixa de ser emitido ao atingir K quadros parados');
  for (let i = 0; i < 70; i++) result = update(stationary, stillFrame);
  assert.equal(result.blobs.length, 0, 'fundo converge e remove o objeto imóvel');
  fillBackground(stillFrame.pixels);
  for (let i = 0; i < 20; i++) result = update(stationary, stillFrame);
  assert.equal(result.blobs.length, 0, 'a remoção do objeto não deixa um blob fantasma');

  const moving = new BlobTrackerCore({ stationaryAbsorbFrames: 8 });
  const movingFrame = createFrame();
  initialize(moving, movingFrame);
  for (let i = 0; i < 48; i++) {
    fillBackground(movingFrame.pixels);
    setBox(movingFrame.pixels, 20 + i, 40, 230, 12);
    result = update(moving, movingFrame);
    assert.equal(result.blobs.length, 1, `objeto móvel detectado no quadro ${i}`);
  }
});

test('stationaryAbsorbFrames padrão zero desliga a absorção do núcleo puro', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 40, 40, 230, 12);
  let result;
  for (let i = 0; i < 30; i++) result = update(tracker, fixture);
  assert.equal(result.blobs.length, 1);
});

test('absorção estacionária não apaga pixels de blob vizinho dentro do bbox', () => {
  const tracker = new BlobTrackerCore({ stationaryAbsorbFrames: 8 });
  const fixture = createFrame();
  initialize(tracker, fixture);

  const drawU = (pixels) => {
    // U estacionário: bbox cobre a cavidade central.
    setBox(pixels, 20, 20, 230, 12); // coluna esquerda
    setBox(pixels, 44, 20, 230, 12); // coluna direita
    setBox(pixels, 20, 32, 230, 36); // barra inferior (36x12 cobre 20..56 x 32..44)
    // limpa interior superior para formar cavidade (32..44 x 20..32)
    for (let y = 20; y < 32; y++) for (let x = 32; x < 44; x++) {
      const index = (y * width + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 36;
    }
  };

  let result;
  for (let i = 0; i < 12; i++) {
    fillBackground(fixture.pixels);
    drawU(fixture.pixels);
    // Blob móvel dentro da cavidade do bbox do U, desconectado.
    setBox(fixture.pixels, 34 + (i % 3), 24, 230, 6);
    result = update(tracker, fixture);
  }
  // O blob móvel deve continuar detectado mesmo após o U ser absorvido.
  assert.ok(result.blobs.some(blob => blob.x > 0.09 && blob.x < 0.14 && blob.y > 0.11 && blob.y < 0.18),
    `blob móvel esperado; blobs=${JSON.stringify(result.blobs.map(b => ({ x: b.x, y: b.y })))}`);
});

test('calibração média de oito quadros ignora uma mancha presente em um quadro', () => {
  const tracker = new BlobTrackerCore({ calibrateFrames: 8 });
  const fixture = createFrame();
  initialize(tracker, fixture);
  const index = (45 * width + 45);
  for (let frame = 1; frame < 8; frame++) {
    fillGray(fixture.pixels, 40);
    if (frame === 3) setBox(fixture.pixels, 40, 40, 230, 12);
    update(tracker, fixture);
  }
  assert.ok(Math.abs(tracker.background[index] - (36 + 6 * 40) / 7 / 255) < 0.002);
});

test('calibração de um quadro preserva detecção no segundo quadro', () => {
  const tracker = new BlobTrackerCore({ calibrateFrames: 1 });
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 40, 40, 230, 10);
  assert.equal(update(tracker, fixture).blobs.length, 1);
});

test('cena muda só uma vez após 40 quadros completos diferentes e não calibra sozinha', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  fillGray(fixture.pixels, 230);
  let result;
  for (let frame = 0; frame < 39; frame++) {
    result = update(tracker, fixture);
    assert.equal(result.raw.sceneShift, false);
  }
  const originalBackground = tracker.background[0];
  result = update(tracker, fixture);
  assert.equal(result.raw.sceneShift, true);
  assert.equal(tracker.background[0], originalBackground);
  assert.equal(update(tracker, fixture).raw.sceneShift, false);
});

test('blob 10×10 não é confundido com uma mudança da cena', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  setBox(fixture.pixels, 40, 40, 230, 10);
  let result;
  for (let frame = 0; frame < 45; frame++) {
    result = update(tracker, fixture);
    assert.equal(result.raw.sceneShift, false);
  }
});

test('ruído de 0.08 não gera blob e uma mancha de 0.45 gera', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  fillGray(fixture.pixels, 56);
  assert.equal(update(tracker, fixture).blobs.length, 0);
  setBox(fixture.pixels, 40, 40, 151);
  assert.equal(update(tracker, fixture).blobs.length, 1);
});

test('lowLight ativa abaixo de 0.12, mantém entre limiares e desativa acima de 0.20', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  fillGray(fixture.pixels, 30);
  assert.equal(update(tracker, fixture).raw.lowLight, true);
  fillGray(fixture.pixels, 40);
  assert.equal(update(tracker, fixture).raw.lowLight, true);
  fillGray(fixture.pixels, 60);
  assert.equal(update(tracker, fixture).raw.lowLight, false);
});

test('buffers da grade são reutilizados enquanto o tamanho do quadro não muda', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  const sum = tracker.gridSum;
  const sumSq = tracker.gridSumSq;
  for (let i = 0; i < 3; i++) update(tracker, fixture);
  assert.equal(tracker.gridSum, sum);
  assert.equal(tracker.gridSumSq, sumSq);
});

test('buffers da calibração são reutilizados até mudar a resolução', () => {
  const tracker = new BlobTrackerCore({ calibrateFrames: 8 });
  const fixture = createFrame();
  initialize(tracker, fixture);
  const sum = tracker.calibrationSum;
  const count = tracker.calibrationCount;
  for (let i = 0; i < 3; i++) update(tracker, fixture);
  assert.equal(tracker.calibrationSum, sum);
  assert.equal(tracker.calibrationCount, count);
});

test('rampa de sombra 0→0.12 já fica abaixo do threshold global 0.18', () => {
  const tracker = new BlobTrackerCore();
  const fixture = createFrame();
  initialize(tracker, fixture);
  for (let y = 0; y < height; y++) {
    const value = 36 + Math.round(y / (height - 1) * 30);
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      fixture.pixels[index] = fixture.pixels[index + 1] = fixture.pixels[index + 2] = value;
    }
  }
  const result = update(tracker, fixture);
  assert.equal(result.mask.reduce((sum, value) => sum + value, 0), 0);
});

test('aviso de pouca luz é protegido por estado e rearma após sair da condição', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('result.raw.lowLight && !state.lowLightNoticeShown'));
  assert.ok(app.includes('else if (!result.raw.lowLight) state.lowLightNoticeShown = false'));
  assert.ok(app.includes("if (result.raw.sceneShift) { showToast('Cena mudou — refaça o fundo'); resetDisplayTracks(); }"));
});
