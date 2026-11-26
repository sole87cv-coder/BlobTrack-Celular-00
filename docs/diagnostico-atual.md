# Diagnóstico completo — 25/11/2026

Base publicada: commit `e982772` (`perf: compartilha readback do tracker e sobe cache v58`) em `https://blobtrak.vercel.app`, com `sw.js` em `blobtrack-celular-00-v58`. Servidor local em `http://localhost:8000`, preso a `127.0.0.1`. O diagnóstico começou no `v55`; passou pelo `v56` (pontos na máscara), `v57` (Pointillism por error diffusion) e agora registra o `v58` (readback compartilhado), publicado com autorização do V1su4rt.

## 1. Verificações executadas

| Checagem | Resultado |
|---|---|
| `npm test` | 226/226 aprovados (inclui Gear VR, readback compartilhado e máscara `dirty`). |
| `node --check` em todos os `.js`/`.mjs` do projeto (fora caches/Android build/dist) | Nenhuma falha. |
| `git diff --check` | Limpo. |
| Links relativos em todos os `.md` | Nenhum link quebrado após as correções deste relatório. |
| Erros de console no `http://localhost:8000` (cenários: só Pontilhado, + efeitos máximos, + mínimos, + ver binarizada, + overlay) | Nenhum. `uEffect=2` em todos; centro do quadro entre `252` e `255`; Gear VR mostra faixa estreita, comportamento esperado. |
| `TODO`/`FIXME`/`debugger` em runtime | Nenhum. `console.log` existe só em `scripts/bench-blobtrack.js` para imprimir o JSON do benchmark. |

## 2. Erros e divergências encontrados

| Achado | Estado | Ação |
|---|---|---|
| README mandava `python -m http.server 8000` sem `--bind` e citava porta `5173` nos atalhos | 🟢 Corrigido | README, `start-local.bat` e `start-local.sh` agora usam `8000 --bind 127.0.0.1`. A versão para teste no celular pela LAN está documentada como `--bind 0.0.0.0`. |
| README apontava `docs/ROI-decisao.md`, que não existe | 🟢 Corrigido | Passou a apontar `docs/diagnostico-cirurgico.md`, onde a decisão de ROI está registrada. |
| README citava `manifest.json`; o arquivo é `manifest.webmanifest` | 🟢 Corrigido | Mapa do projeto ajustado. |
| Servir por `file://` ainda é possível de tentar | 🟡 Documentado | README explica que câmera exige `localhost` ou HTTPS e que service worker não registra fora de contexto seguro. |
| `docs/historico/AUDITORIA.md` afirma que `teste.css` está no shell offline e no APK | 🟢 Corrigido no texto histórico | A afirmação era válida no cache `v34`; `5bc2b1e` (22/11) removeu `teste.*` do `SHELL`. Hoje `android/app/build.gradle` inclui `teste.html`, `teste.js` e `teste.css` no APK, mas `sw.js` (`v58`) não inclui nenhum dos três; `teste.html` referencia `teste.css` e `teste.js`, e `tests/deployment-config.test.js` exige só `html` e `js` no deploy. O `AUDITORIA.md` ganhou notas explicativas; decisão do V1su4rt: **não** mudar o runtime. |
| `docs/historico/AUDITORIA.md` cita `http://localhost:4173/` | 🟢 Histórico | É registro da validação antiga; não é instrução atual. A URL vigente é `8000`. |

## 3. Permissões

| Recurso | Como é pedido | Tratamento de falha | Pendência |
|---|---|---|---|
| Câmera | `getUserMedia({ audio:false, video:{...} })`, com `deviceId` fixo e fallback para `facingMode` (`src/app.js:375-379`) | `NotAllowedError`, `NotFoundError`, `NotReadableError` e `SecurityError` viram diálogo com título e mensagem específicos e opção de tentar de novo; libera a sessão antes de falhar | Testar negação/renovação de permissão no celular real. |
| Áudio reativo | `AudioContext` criado após gesto do usuário; `resume()` ao entrar em modo de visualização (`src/app.js:894-895`) | `resume()` com `.catch(()=>{})`; som desligado, mudo ou sem porta não monta payload | Confirmar no iOS Safari, onde o desbloqueio de áudio é mais rígido. |
| Wake Lock | `createWakeLock` em `src/platform/wakeLock.js`, adquirido ao iniciar e ao sair de fullscreen, liberado ao parar/pagehide | Best-effort: falha não impede o uso | Não medido em aparelho (duração real da tela ligada). |
| Tela cheia | `requestFullscreen` / `webkitExitFullscreen` com `try/catch` | Best-effort | Confirmar gesto e saída no Android WebView e no iOS. |
| Service worker | Só se `'serviceWorker' in navigator && window.isSecureContext` (`src/app.js:1287`) | Registro com `.catch()` e log | Se o local parecer antigo: DevTools → Application → Service Workers → **Unregister** e recarregar duas vezes. |
| Vercel | `Permissions-Policy: camera=(self), microphone=(), geolocation=(), display-capture=()`; CSP restritiva em `vercel.json` | — | Nenhuma permissão de microfone é solicitada; coerente com o app. |
| Android | `AndroidManifest.xml` pede `CAMERA` e `INTERNET`, declara `usesCleartextTraffic="false"` e `camera.any` como não obrigatório | — | Validar câmera no APK debug em aparelho. |

Conclusão: não há permissão pendente **de código**. O que falta é evidência em aparelho físico — câmera real, áudio no iOS, Wake Lock e gravação continuam **não medidos**.

## 4. Desempenho

### Medido agora

- Benchmark do núcleo (`scripts/bench-blobtrack.js`), nove execuções com a máquina em repouso em `25/11/2026`: p50 mediano `0,676 ms`, p95 mediano `1,340 ms`, pico mediano `1,855 ms` (p95 por rodada: `1,415 / 1,127 / 1,378 / 1,371 / 1,321 / 1,340 / 1,359 / 1,223 / 1,300 ms`).
- O teto histórico é p95 ≤ `1,347 ms` (baseline × 1,15). A mediana atual (`1,340 ms`) está **dentro** do teto. A rodada alta da `v56` (p95 `1,531 / 2,106 / 2,341 ms`) rodou sob contenda da máquina e não indicou regressão: não houve alteração em `src/domain/blobTrackerCore.js` nem na assinatura de `src/blob-tracker.js`. Nenhuma mudança de núcleo foi feita por causa destes números.

### Gargalo conhecido

- `getImageData` continua sendo o maior custo de CPU: p50 `2,1–2,2 ms`, p95 `4,0–4,9 ms`, até `11,9 ms` com efeitos máximos. O Pacote 2 removeu o **segundo** readback sem tocar na ponte congelada: `analyze` lê uma vez e chama `tracker.updatePixels`; a leitura restante é necessária e permanece 🔴.
- `texImage2D` é barato (p50 `0 ms`, p95 `0,1 ms`) e agora acontece só na primeira alocação; os quadros seguintes usam `texSubImage2D`. HUD custa ~`0,03 ms/quadro`. Overlay com efeitos máximos: `tComposition` `0,4 ms`, 2868 `stroke` e 495 `fillText` em 64 quadros; o `v55` já agrupou malha e rede.
- FPS headless: `28,8` com teto 30, 0–1 quadros acima de 33 ms. **RAM/heap e bateria: não medidos.**

### Pendências

- **Pacote 2:** aplicado e publicado no `v58` (ver seção 10).
- **Pacote 3:** medir em aparelho real FPS, bateria, tamanho dos pontos, ROI, gravação e os cinco efeitos. Sem isso, qualquer ganho no celular é hipótese, não resultado.
- Confirmar no aparelho o Pointillism (`v58` publicado): papel branco, pontos pretos de tamanhos diferentes formando a imagem e janelas de vídeo por cima. As versões anteriores (`v55` halftone branco, `v56` pontos na máscara) foram substituídas; o overlay ocioso continua o mesmo.

## 5. Organização de pastas e arquivos

### Estado atual

A árvore já é coerente: `src/`, `tests/`, `scripts/`, `docs/`, `android/`, `icons/`. O inventário em `docs/faxina-inventario.md` concluiu que não há órfãos, cópias ou arquivos de outro projeto. `teste.html`, `teste.js` e `teste.css` são ferramentas de diagnóstico referenciadas e **não devem ser apagados**. Caches do Gradle/Visual Studio e `android/.local-build/` ficam no disco, já ignorados pelo Git; apagá-los só custaria downloads e tempo.

Nada foi movido ou apagado nesta rodada.

### Organização executada (25/11/2026)

Foram movidos com `git mv` para `docs/historico/` apenas estes quatro arquivos de documentação encerrada:

- `AUDITORIA.md`
- `BUGS-CROP.md`
- `CHANGELOG.md`
- `RECORDING-PLAN.md`

Efeito: raiz limpa, documentação corrente (`README.md` + `docs/`) separada do histórico, nenhum arquivo de runtime tocado. Ajustes acompanhantes: `docs/INDICE.md` lista a subpasta, `docs/faxina-inventario.md` registra o novo caminho e `.vercelignore` perdeu as quatro linhas explícitas (o próprio `docs/` já é ignorado no deploy). Referências internas revisadas: nenhum link relativo quebrado.

🟢 Seguro: mover `.md` e atualizar links. 🟡 Testar: `npm test` e `git diff --check` depois. 🔴 Não feito nesta mudança: mover `teste.*`, `sw.js`, `src/**`, `tests/**` ou qualquer coisa dentro de `android/`.

Movimento autorizado pelo V1su4rt e executado preservando o histórico do Git.

## 6. Publicação

A rodada de documentação entrou no commit `525de4d`, a mudança de runtime do Pontilhado de formas foi publicada no commit `da6b1d7` (cache `v56`) e a rodada do Pointillism foi publicada no commit `a039e80` (commit + push, com autorização do V1su4rt). O deploy é automático pela integração do Vercel com o GitHub; a checagem final do site com bypass de cache confirma `v57`. O deploy automático entrou no ar; a checagem direta com bypass de cache confirmou `sw.js` em `v57`, `drawStipple` no render e papel branco no shader. A resposta sem bypass ainda pode mostrar versão anterior por cache da CDN; nesse caso, faça Unregister do service worker e recarregue duas vezes. A rodada `v58` (Pacote 2) foi publicada com autorização em `e982772` (commit + push; deploy automático) e a checagem com `?cb=<timestamp>` confirmou `sw.js` em `blobtrack-celular-00-v58`.

## 7. Pontilhado de formas (cache v56)

Opção A aprovada pelo V1su4rt e implementada:

- O branch `uEffect==2` do shader em `src/app.js` e o fallback em `src/render/render.js` pintam só base limpa. O halftone de quadro inteiro (`getHalftoneFrame`) foi removido.
- Os pontos são gerados no laço que já empacota a máscara em `drawMaskOverlay` (`DOT_CELL = 14`, `DOT_RADIUS_SQ = 0.55`), convertendo a célula do palco para pixels de rastreio. Sem novo `getImageData` e sem nova textura.
- O guard `state.effect === 'dither'` saiu de `drawRawVideoWindows`. Janela viva, Vídeo original, Inverter vídeo e mistura voltam a atuar com Pontilhado.
- Os três rótulos de vídeo ganharam chaves nos quatro idiomas; antes ficavam presos em pt-BR.
- Contrato congelado intacto: `src/domain/blobTrackerCore.js` e a assinatura de `src/blob-tracker.js` não foram tocados.
- Verificação: `npm test` 222/222, `node --check` limpo, `git diff --check` limpo. No headless em `http://localhost:8000` e no site publicado, `#visual` ficou com 0% de branco, `#overlay` mostrou pontos só nas formas, as janelas mudaram a composição e não houve erro de console. CPU, FPS, bateria e aparência no aparelho físico: **não medidos**.

## 8. Pointillism por error diffusion (cache v57)

Opção B escolhida pelo V1su4rt depois de ver o exemplo de diffusion dither do Photoshop:

- A imagem passa a ser o pontilhado. `drawStipple` em `src/render/render.js` reduz o quadro para até `200×120`, lê a luma uma vez, equaliza pelo contraste médio da cena e aplica Floyd–Steinberg com 6 níveis de raio (`STIPPLE_LEVELS`) e jitter pequeno por célula. Todos os pontos são desenhados num único `fill()`.
- O branch `uEffect==2` do shader em `src/app.js` e o fallback 2D pintam papel branco; os pontos pretos vivem no overlay. `Janela viva`, `Vídeo original`, `Inverter vídeo` e mistura seguem ativos: as janelas são compostas **depois** dos pontos.
- O Pontilhado não depende mais da máscara dos blobs; o laço de empacotamento da máscara voltou a servir só ao botão “Ver binarizada”. Contrato congelado intacto.
- Custo medido em Chromium headless com câmera fake: `getImageData` extra p50 `1,5 ms` / p95 `4,7 ms`, `tComposition` `2,2 ms`, FPS `28,8` (sem mudança). `#visual` 100% de branco; `#overlay` com pontos pretos de `3,5` a `7,5 px`. `npm test` 222/222. Nada disso é medição em aparelho físico.
- Status: publicado no commit `a039e80`. No site com URL sem cache: `#visual` 100% de branco, pontos pretos de `2` a `7,5 px` no `#overlay`, leitura extra p50 `1,4 ms` (p95 `8,8 ms` na primeira amostra e `3,9 ms` na segunda), `tComposition` `2,2–2,4 ms`, FPS `28,83` e nenhum erro de console. Continue sem medição em aparelho físico.

## 9. Diagnóstico geral consolidado (25/11/2026)

Escopo pedido pelo V1su4rt: **aplicar os pacotes faltantes e fazer acabamentos à prova de erros**. Rodada `v58` (Pacote 2) aplicada e publicada; site em `v58`.

### Repositório e deploy

- Git em `e982772` com a rodada `v58` (runtime + testes + documentação) publicada; `npm test` **226/226**; `node --check` limpo em **58** arquivos `.js`; `git diff --check` limpo.
- Contrato congelado intacto: nenhuma mudança em `src/domain/blobTrackerCore.js` nem na assinatura de `src/blob-tracker.js`. `analyze` chama direto `tracker.updatePixels` com os pixels já lidos.
- Site com `?cb=<timestamp>` e `cache: 'no-store'`: `sw.js` em `blobtrack-celular-00-v58`, `drawStipple` presente no render com `sample?.data` e `texSubImage2D`, `DOT_CELL` ausente, `uEffect==2` com papel branco no shader, botões Pontilhado / Janela viva / Vídeo original no HTML. Cache-Control do `sw.js`: `public, max-age=0, must-revalidate`.

### Comportamento no navegador (Chromium headless, câmera fake, local `v58` com bypass de cache)

| Cenário | `#visual` branco | `#overlay` preto / pintado | `tRender` | `tComposition` | FPS | `getImageData`/quadro |
|---|---|---|---|---|---|---|
| Inverter (efeito base) | 0% (papel preto, esperado) | 0% / 22,4% | 0,14 ms | 0,0 ms | 28,8 | 1 |
| Limiar | 0% | — / 47,5% | 0,13 ms | 0,0 ms | 28,8 | 1 |
| Pointillism + Janela viva | 100% | 11,9% / 59,3% | 1,31 ms | 2,9 ms | 28,8 | 1 |
| Pointillism sem Janela viva | 100% | 21,3% / 21,3% | 0,97 ms | 0,9 ms | 28,8 | 1 |
| Pointillism sem Vídeo original | 100% | 22,0% / 24,7% | 1,00 ms | 0,9 ms | 28,8 | 1 |
| Pointillism com Inverter vídeo | 100% | 24,3% / 59,1% | 1,01 ms | 0,9 ms | 28,8 | 1 |
| Gear VR | 13,5% (faixa contain, esperado) | 6,7% / 7,3% | 2,28 ms | 1,8 ms | 28,8 | 1 |

- `WebGL2 ativo`; **zero erros de console** em todos os cenários. A janela compõe por cima dos pontos (área pintada sobe de 21,3% para 59,3% com Janela viva); Inverter vídeo troca a maioria dos pontos para branco sobre papel preto. Gear VR segue como cenário mais caro por causa da geometria `contain`.
- Comparado ao `v57` publicado, `tRender` caiu de ~`3,15 ms` para ~`1,0 ms` no Pointillism e de `6,59 ms` para `2,28 ms` no Gear VR; FPS seguiu em `28,8`. Instrumentação separada em 60 quadros: **1** `getImageData` (`400×225`) por quadro, **60** `texSubImage2D`, **0** `texImage2D` e `putImageData` da máscara em 25 quadros com “Ver binarizada” ligado.
- O hook de `uEffect` não capturou o valor nesta rodada (o objeto `WebGLUniformLocation` não expõe o nome como string); a confirmação do branch veio do `#visual` 100% branco e do texto do shader servido, não desse hook.

### Desempenho do núcleo

- Nove execuções em máquina em repouso: p50 mediano `0,676 ms`, p95 mediano `1,340 ms`, pico mediano `1,855 ms`. p95 `1,340 ms` ≤ teto `1,347 ms`: **sem regressão**. O p95 alto da rodada da `v56` era contenda da máquina.

### Documentação

- 10 arquivos `.md` visitados, **0 links relativos quebrados**.
- Corrigidos nesta rodada: base do relatório (`da6b1d7` → `54ff65d`), detalhe da divergência `teste.css` (APK inclui; `SHELL` não inclui), benchmark superado, índice (`v34` → `v58`, antes `v57`) e redação contradictória sobre qual versão o site serve.
- Cobertura acrescentada no fechamento: `Pointillism no Gear VR respeita o contain e espelha o segundo olho` em `tests/render/render.test.js`. A suíte passou de 222 para **223** testes; com o Pacote 2 chegou a **226**.
- **Resolvido no texto:** `docs/historico/AUDITORIA.md` dizia que `teste.css` estava no shell offline e no APK — verdadeiro na `v34`, falso desde `5bc2b1e`. O APK inclui os três arquivos (`android/app/build.gradle:29-31`), `teste.html` referencia `teste.css` e `teste.js`, mas `sw.js` (`v58`) não inclui nenhum no `SHELL` e `tests/deployment-config.test.js` exige só `html` e `js`. Por decisão do V1su4rt, o texto histórico foi corrigido com notas; o service worker **não** inclui `teste.*`.

### Limites e pendências

- **Não medido em aparelho físico:** câmera real, bateria, gravação, ROI, aparência final e FPS em dispositivo. Headless com câmera fake não substitui celular.
- **Pacote 2:** aplicado localmente — leitura única em `analyze`, `drawStipple(..., sample)`, `texSubImage2D` e máscara `dirty`. Contrato congelado preservado. Falta autorização para commit + push + deploy.
- **Pacote 3:** depende de aparelho físico; câmera real, bateria, gravação, ROI e aparência final continuam **não medidos**.

## 10. Pacote 2 — readback compartilhado (cache v58, publicado)

- `src/app.js`: `analyze` lê os pixels uma vez (`ctx.getImageData`), chama `tracker.updatePixels` com esse buffer e devolve `{ ...result, dt, pixels, pixelWidth, pixelHeight }`. `src/blob-tracker.js` e `src/domain/blobTrackerCore.js` não mudaram.
- `src/render/render.js`: `drawStipple(..., sample)` reaproveita os pixels do tracker quando válidos (com fallback ao mini-canvas); a textura WebGL é alocada uma vez com `texImage2D` e atualizada com `texSubImage2D` (fallback de realocação se o sub-update falhar); `putImageData` da binarizada só acontece quando a máscara muda ou o canvas é redimensionado.
- Prova headless em `http://127.0.0.1:8000/?cb=<timestamp>`: 1 `getImageData` por quadro (`400×225`), 60 `texSubImage2D`, 0 `texImage2D`, `putImageData` em 25 de 60 quadros; `tRender` ~`0,96–1,09 ms` no Pointillism e `2,28 ms` no Gear VR; FPS `28,83`; `erros []`.
- Validação: `npm test` **226/226** (novos testes de readback compartilhado, `texSubImage2D`, máscara `dirty` e Gear VR), `node --check` limpo em 58 arquivos, `git diff --check` limpo, nove rodadas de benchmark com p95 mediano `1,340 ms` ≤ teto `1,347 ms`.
- Prova no deploy (`https://blobtrak.vercel.app/?cb=<timestamp>`): `sw.js` em `v58`, código publicado com `tracker.updatePixels`, `texSubImage2D`, `sample?.data` e máscara `dirty`; `#visual` 100% branco com 2000 pontos por quadro no Pointillism, `tRender` `0,95–1,22 ms` e Gear VR `2,71 ms`, FPS `28,8`, `erros []`. A instrumentação no site viu leituras em `400×225` e `480×270` conforme a qualidade automática — sempre **uma** por quadro —, 1 `texImage2D` (alocação inicial) + 49 `texSubImage2D` em 50 quadros e `putImageData` da máscara em `400×225`.
- Status: publicado em `e982772` com autorização do V1su4rt. Nada aqui é medição em aparelho físico.
