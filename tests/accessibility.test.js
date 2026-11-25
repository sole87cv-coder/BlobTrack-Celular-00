import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/app.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

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
test('all HTML IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(ids.length, new Set(ids).size, 'duplicate id attributes make DOM and ARIA references ambiguous');
});

test('HTML elements do not repeat attribute names', () => {
  for (const [tag] of html.matchAll(/<[a-z][^>]*>/gi)) {
    const names = [...tag.matchAll(/(?:^|\s)([a-z][a-z0-9:-]*)\s*=/gi)].map(([, name]) => name.toLowerCase());
    assert.equal(names.length, new Set(names).size, `duplicate attribute in ${tag.slice(0, 100)}`);
  }
});

test('each tab panel has one semantic relationship', () => {
  const panels = [...html.matchAll(/<div class="dock-panel[^>]*>/g)].map(([tag]) => tag);
  assert.equal(panels.length, 4);
  for (const tag of panels) {
    assert.equal([...tag.matchAll(/\brole="tabpanel"/g)].length, 1);
    assert.equal([...tag.matchAll(/\baria-labelledby=/g)].length, 1);
    assert.equal([...tag.matchAll(/\btabindex=/g)].length, 1);
  }
});
test('mobile controls explain horizontal and vertical scrolling', () => {
  assert.match(html, /id="dockActionsHint"[^>]*hidden/);
  assert.match(html, /id="dockScrollHint"[^>]*hidden/);
  assert.match(html, /id="focusModeButton"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(html, /id="hideUiButton"|id="focusButton"/);
  assert.match(html, /class="chip-label">Gravar</);
  assert.match(html, /class="chip-label" id="focusModeLabel">Palco</);
});

test('initial stage status does not overlap the welcome card', () => {
  assert.match(html, /id="stagePill" hidden/);
  assert.match(html, /class="stage-message" id="stageMessage"/);
});
test('start and focus states update the stage status and preserve toolbar labels', () => {
  assert.match(html, /id="stagePill" hidden/);
  assert.match(app, /\$\('stagePill'\)\.hidden = false/);
  assert.match(app, /\$\('stagePill'\)\.hidden = true/);
  assert.match(app, /querySelector\('\.chip-icon'\)\.textContent/);
});
test('new destinations and accessible quick settings are present', () => {
  for (const name of ['stage', 'session', 'settings', 'help']) assert.match(html, new RegExp('id="page' + name[0].toUpperCase() + name.slice(1) + '"'));
  assert.match(html, /nav class="primary-nav" aria-label="Navegação principal"/);
  assert.match(html, /dialog class="quick-sheet" id="quickSettingsSheet" aria-labelledby="quickSettingsHeading"/);
  assert.match(html, /id="closeQuickSettings"/);
  assert.match(html, /id="quickAudioSensitivity" type="range"/);
  assert.match(app, /recorder\.pause\(\)/);
  assert.match(app, /recorder\.resume\(\)/);
});
test('public branding, PT-BR strings and safe technical identifiers are retained', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  const i18n = await readFile(new URL('../src/ui/i18n/pt-BR.js', import.meta.url), 'utf8');
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<title>@V1su4rt — instrumento audiovisual que transforma movimento em som e imagem/);
  assert.equal(manifest.short_name, '@V1su4rt');
  assert.match(i18n, /shortName: '@V1su4rt'/);
  assert.match(app, /blobtrack-celular-00-preferences/);
});
test('microphone remains unused and the camera issue has a persistent recovery action', () => {
  assert.match(app, /getUserMedia\(\{audio:false,video:videoConstraints\}\)/);
  assert.match(html, /id="permissionDialog" aria-labelledby="cameraIssueTitle"/);
  assert.match(html, /id="cameraIssueRetry"/);
});
test('PWA brand icons include a scalable SVG and maskable PNG sizes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find(item => item.sizes === size && item.purpose.includes('maskable'));
    assert.ok(icon, 'manifest needs a maskable icon at ' + size);
    const data = await readFile(new URL('../' + icon.src.replace('./', ''), import.meta.url));
    assert.equal(data.readUInt32BE(16), Number(size.split('x')[0]));
    assert.equal(data.readUInt32BE(20), Number(size.split('x')[1]));
  }
  assert.ok(manifest.icons.some(item => item.type === 'image/svg+xml'));
});

test('credit stays separate from the mark and is hidden in Gear VR and focus mode', () => {
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<title>@V1su4rt — instrumento audiovisual que transforma movimento em som e imagem<\/title>/);
  assert.match(html, /<p class="stage-credit" aria-hidden="true">@V1su4rt<\/p>/);
  assert.match(css, /body\.gear-vr \.stage-credit,body\.focus-mode \.stage-credit \{ display:none \}/);
  assert.match(html, /href="https:\/\/www\.instagram\.com\/v1su4rt\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<p class="about-credit">@V1su4rt<\/p>/);
});
