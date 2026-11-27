import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { strings as ptBR } from '../src/ui/i18n/pt-BR.js';
import { strings as en } from '../src/ui/i18n/en.js';
import { strings as es } from '../src/ui/i18n/es.js';
import { strings as fr } from '../src/ui/i18n/fr.js';

test('painel de diagnóstico permite copiar no próprio celular', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
  assert.match(html, /id="perfDiag" hidden/);
  for (const id of ['perfDiagSummary', 'perfDiagHint', 'perfRefresh', 'perfCopy', 'perfShare', 'perfReset', 'perfDump']) {
    assert.match(html, new RegExp(`id="${id}"`), `id ${id} existe`);
  }
  assert.ok(app.includes("new URLSearchParams(location.search).get('perf') === '1'"));
  assert.ok(app.includes('diag.hidden = false;'));
  assert.ok(app.includes('navigator.clipboard.writeText(text)'));
  assert.ok(app.includes('navigator.share({ title:'));
  assert.ok(app.includes('range.selectNodeContents(dump)'));
  assert.match(css, /\.perf-diag \{ position:fixed/);
});

test('cacheVersion do relatório acompanha o sw.js', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const reported = app.match(/cacheVersion: '(blobtrack-celular-00-v\d+)'/)?.[1];
  const cache = sw.match(/const CACHE = '(blobtrack-celular-00-v\d+)'/)?.[1];
  assert.ok(reported, 'relatório publica cacheVersion');
  assert.equal(reported, cache);
});

test('painel de diagnóstico está traduzido nos quatro idiomas', () => {
  for (const [locale, strings] of Object.entries({ ptBR, en, es, fr })) {
    for (const key of ['perfDiagnostic', 'perfDiagHint', 'perfRefresh', 'perfCopy', 'perfShare', 'perfReset']) {
      assert.ok(strings.ui[key], `${locale}.ui.${key}`);
    }
    for (const key of ['perfCopied', 'perfSelectCopy', 'perfShareUnavailable']) {
      assert.ok(strings.messages[key], `${locale}.messages.${key}`);
    }
  }
});
