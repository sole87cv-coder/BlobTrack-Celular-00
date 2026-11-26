// QA funcional no Chrome do emulador, via CDP. Sem dependências externas.
// Uso: start-emulador.bat && node scripts/qa-emulador.mjs
// Node 20+ (usa fetch e WebSocket nativos).

const urlAlvo = process.argv.find(a => a.startsWith('--url='))?.slice(6) ?? 'https://blobtrak.vercel.app/';
const base = 'http://127.0.0.1:9222';

const alvos = await (await fetch(`${base}/json`)).json();
const alvo = alvos.find(p => p.url === urlAlvo) ?? alvos.find(p => p.url.includes('blobtrak.vercel.app'));
if (!alvo) throw new Error(`Aba não encontrada. Abra ${urlAlvo} no Chrome do emulador (rode start-emulador.bat).`);

const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let proximoId = 0;
const pendentes = new Map();
const eventos = [];
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pendentes.has(msg.id)) {
    const { resolve, reject } = pendentes.get(msg.id);
    pendentes.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.method}: ${msg.error.message}`));
    else resolve(msg.result);
  } else if (msg.method) {
    eventos.push(msg);
  }
};
const enviar = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++proximoId;
  pendentes.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const avaliar = async expression => {
  const r = await enviar('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const clicar = seletor => avaliar(`(() => { const el = document.querySelector(${JSON.stringify(seletor)}); if (el) el.click(); return !!el; })()`);
const texto = seletor => avaliar(`document.querySelector(${JSON.stringify(seletor)})?.textContent?.trim() ?? null`);
const dormir = ms => new Promise(resolve => setTimeout(resolve, ms));

await enviar('Runtime.enable');
const relatorio = { url: alvo.url, userAgent: await avaliar('navigator.userAgent') };

relatorio.inicial = await avaliar(`(() => ({
  titulo: document.title,
  webgl: document.querySelector('#renderInfo')?.textContent?.trim() ?? null,
  efeitos: [...document.querySelectorAll('[data-effect]')].map(b => b.dataset.effect),
  abas: [...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim()),
}))()`);

if (!(await avaliar(`document.querySelector('#stagePill')?.hidden === false`))) {
  await clicar('#startButton');
  await dormir(2500);
}
relatorio.sessao = await avaliar(`(() => ({
  camera: document.querySelector('#cameraLabel')?.textContent?.trim() ?? null,
  quadro: document.querySelector('#frameInfo')?.textContent?.trim() ?? null,
  fps: window.__blobtrackMetrics?.fps ?? null,
  tAnalise: window.__blobtrackMetrics?.tAnalysis ?? null,
  tRender: window.__blobtrackMetrics?.tRender ?? null,
}))()`);

relatorio.efeitos = {};
for (const efeito of relatorio.inicial.efeitos) {
  await clicar(`[data-effect="${efeito}"]`);
  await dormir(350);
  relatorio.efeitos[efeito] = await avaliar(`[...document.querySelectorAll('[data-effect]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.effect).join(',')`);
}

relatorio.toggles = {};
for (const id of ['blobWindowButton', 'originalVideoButton', 'invertBlendButton', 'trailEffectButton', 'waveEffectButton', 'meshEffectButton', 'blobNetworkButton', 'distanceTelemetryButton']) {
  const antes = await avaliar(`document.querySelector(${JSON.stringify('#' + id)})?.getAttribute('aria-pressed') ?? null`);
  await clicar(`#${id}`);
  await dormir(120);
  const durante = await avaliar(`document.querySelector(${JSON.stringify('#' + id)})?.getAttribute('aria-pressed') ?? null`);
  await clicar(`#${id}`);
  relatorio.toggles[id] = `${antes} → ${durante} → ${await avaliar(`document.querySelector(${JSON.stringify('#' + id)})?.getAttribute('aria-pressed') ?? null`)}`;
}

relatorio.abas = {};
for (const [nome, id] of [['Som', 'tabAudio'], ['Rastreio', 'tabTracking'], ['Medições', 'tabSignals'], ['Efeito', 'tabEffects']]) {
  await clicar(`#${id}`);
  await dormir(150);
  relatorio.abas[nome] = await avaliar(`[...document.querySelectorAll('[role="tabpanel"]')].find(p => p.classList.contains('active'))?.id ?? null`);
}

await clicar('#tabTracking');
await clicar('#backgroundButton');
await dormir(1500);
relatorio.blobs = await avaliar(`window.__blobtrackMetrics?.blobsAtivos ?? null`);
await clicar('#rectangleButton');
await dormir(200);
relatorio.roi = await avaliar(`document.querySelector('#rectangleButton')?.getAttribute('aria-pressed') ?? null`);
await clicar('#rectangleButton');

relatorio.gravacao = await avaliar(`({
  suportada: typeof MediaRecorder === 'function' &&
    ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1.42001E','video/mp4;codecs=avc1.64001E','video/mp4'].some(t => MediaRecorder.isTypeSupported(t)),
  botaoDesabilitado: document.querySelector('#recordButtonPanel')?.disabled ?? null,
  titulo: document.querySelector('#recordButtonPanel')?.title ?? null,
})`);

relatorio.serviceWorker = await avaliar(`navigator.serviceWorker?.controller?.scriptURL ?? null`);
relatorio.consoleErrors = eventos
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error'))
  .map(e => e.method === 'Runtime.exceptionThrown' ? e.params?.exceptionDetails?.text : e.params?.args?.map(a => a.value ?? a.description).join(' '));

ws.close();
console.log(JSON.stringify(relatorio, null, 2));
