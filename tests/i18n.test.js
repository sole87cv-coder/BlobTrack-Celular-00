import assert from 'node:assert/strict';
import test from 'node:test';
import { strings as ptBR } from '../src/ui/i18n/pt-BR.js';
import { strings as es } from '../src/ui/i18n/es.js';
import { strings as en } from '../src/ui/i18n/en.js';
import { strings as fr } from '../src/ui/i18n/fr.js';
import { getStrings, translateText } from '../src/ui/i18n/index.js';

const shape = value => Array.isArray(value) ? value.map(shape)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, shape(value[key])]))
    : typeof value;

test('pt-BR, es, en e fr mantêm a mesma árvore de chaves', () => {
  const expected = shape(ptBR);
  for (const locale of [es, en, fr]) assert.deepEqual(shape(locale), expected);
});

test('getStrings seleciona o idioma e usa pt-BR como fallback', () => {
  assert.equal(getStrings('es'), es);
  assert.equal(getStrings('en'), en);
  assert.equal(getStrings('fr'), fr);
  assert.equal(getStrings('invalid'), ptBR);
});

test('piano do Tom Base usa as mesmas notas traduzidas nos quatro idiomas', () => {
  assert.equal(translateText('Tom base', 'en'), 'Base note');
  assert.equal(translateText('Tom base', 'es'), 'Nota base');
  assert.equal(translateText('Tom base', 'fr'), 'Note de base');
  assert.equal(translateText('Dó (C)', 'en'), 'C');
  assert.equal(translateText('Si♭ (B♭)', 'es'), 'Si♭ (B♭)');
  assert.equal(translateText('Sol (G)', 'fr'), 'Sol (G)');
});

test('texto da interface traduz entre idiomas sem alterar a marca pública', () => {
  assert.equal(translateText('Palco', 'en'), 'Stage');
  assert.equal(translateText('Distâncias', 'fr'), 'Distances');
  assert.equal(translateText('Vídeo original', 'en'), 'Original video');
  assert.equal(translateText('Inverter vídeo', 'fr'), 'Inverser la vidéo');
  assert.equal(translateText('Mistura vídeo + efeito', 'es'), 'Mezcla vídeo + efecto');
  assert.equal(translateText('@V1su4rt', 'en'), '@V1su4rt');
  assert.equal(translateText('@V1su4rt', 'es'), '@V1su4rt');
});
