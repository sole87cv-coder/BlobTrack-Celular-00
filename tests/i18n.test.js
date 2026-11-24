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

test('texto da interface traduz entre idiomas sem alterar a marca pública', () => {
  assert.equal(translateText('Palco', 'en'), 'Stage');
  assert.equal(translateText('Distâncias', 'fr'), 'Distances');
  assert.equal(translateText('Os Corpos Compon o Som', 'en'), 'Os Corpos Compon o Som');
  assert.equal(translateText('@V1su4rt', 'es'), '@V1su4rt');
});
