import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');

function luminance(hex) {
  const values = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255);
  const linear = values.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + .05) / (low + .05);
}

test('mobile viewport permits zoom', () => {
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0+)?/i);
});

test('text controls have explicit labels', () => {
  for (const [, id] of html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)) {
    assert.match(html, new RegExp(`<label[^>]*for="${id}"`), `${id} needs a label`);
  }
});

test('visual canvas has a text description and live activity summary', () => {
  assert.match(html, /<canvas id="visual" role="img"[^>]*aria-describedby="visualDescription"/);
  assert.match(html, /id="visualDescription" class="sr-only"/);
  assert.match(html, /id="visualSummary" class="sr-only" role="status" aria-live="polite"/);
});

test('tabs expose selection and panel relationships', () => {
  assert.match(html, /role="tablist"/);
  for (const id of ['Effects', 'Audio', 'Tracking', 'Signals']) {
    assert.match(html, new RegExp(`role="tab"[^>]*aria-controls="panel${id}"`));
    assert.match(html, new RegExp(`id="panel${id}" role="tabpanel" aria-labelledby="tab${id}"`));
  }
});

test('touch targets, focus indicator and reduced motion rules remain present', () => {
  assert.match(css, /@media \(pointer:coarse\)/);
  assert.match(css, /\.tab-button \{[^}]*min-height:44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('primary text tokens meet 4.5:1 against the page background', () => {
  const color = name => css.match(new RegExp(`--${name}:\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const background = color('bg');
  assert.ok(background);
  for (const token of ['text', 'muted', 'mint']) {
    const value = color(token);
    assert.ok(value, `missing color token ${token}`);
    assert.ok(contrast(value, background) >= 4.5, `${token} contrast is below 4.5:1`);
  }
});

test('published security headers and content policy are configured', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const values = config.headers.flatMap(rule => rule.headers).map(header => `${header.key}: ${header.value}`);
  for (const name of ['Content-Security-Policy', 'Permissions-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
    assert.ok(values.some(value => value.startsWith(`${name}:`)), `${name} must be configured`);
  }
});