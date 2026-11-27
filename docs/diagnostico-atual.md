# Diagnóstico completo — 25/11/2026

Base publicada: commit `8725a69` (`feat: Video original aplica efeito na janela e otimiza render (v60)`) em `https://blobtrak.vercel.app`, com `sw.js` em `blobtrack-celular-00-v60`. Servidor local em `http://localhost:8000`, preso a `127.0.0.1`. O diagnóstico começou no `v55`; passou pelo `v56` (pontos na máscara), `v57` (Pointillism por error diffusion), `v58` (readback compartilhado), `v59` (pontos também dentro das janelas, publicado) e agora registra o `v60` publicado (Vídeo original ligado = efeito na janela; desligado = vídeo cru, mais três otimizações da janela).

## 1. Verificações executadas

| Checagem | Resultado |
|---|---|
| `npm test` | 231/231 aprovados (inclui Gear VR, readback compartilhado, máscara `dirty`, Pontilhado nas janelas, a semântica do Vídeo original e as três otimizações da janela). |
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
| `docs/historico/AUDITORIA.md` afirma que `teste.css` está no shell offline e no APK | 🟢 Corrigido no texto histórico | A afirmação era válida no cache `v34`; `5bc2b1e` (22/11) removeu `teste.*` do `SHELL`. Hoje `android/app/build.gradle` inclui `teste.html`, `teste.js` e `teste.css` no APK, mas `sw.js` (`v60` publicado) não inclui nenhum dos três; `teste.html` referencia `teste.css` e `teste.js`, e `tests/deployment-config.test.js` exige só `html` e `js` no deploy. O `AUDITORIA.md` ganhou notas explicativas; decisão do V1su4rt: **não** mudar o runtime. |
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
- **Pontilhado nas janelas:** publicado no `v59` em `d46829b` (ver seção 11).
- **Vídeo original:** semântica aplicada no `v60` publicado — ligado aplica o efeito na janela, desligado deixa vídeo cru (ver seção 12).
- **Pacote 3:** medir em aparelho real FPS, bateria, tamanho dos pontos, ROI, gravação e os cinco efeitos. Sem isso, qualquer ganho no celular é hipótese, não resultado.
- Confirmar no aparelho o Pointillism (`v60` publicado com Vídeo original ajustado): papel branco, pontos pretos de tamanhos diferentes formando a imagem, janelas de vídeo por cima e pontos também dentro das janelas. As versões anteriores (`v55` halftone branco, `v56` pontos na máscara) foram substituídas; o overlay ocioso continua o mesmo.

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

A rodada de documentação entrou no commit `525de4d`, a mudança de runtime do Pontilhado de formas foi publicada no commit `da6b1d7` (cache `v56`) e a rodada do Pointillism foi publicada no commit `a039e80` (commit + push, com autorização do V1su4rt). O deploy é automático pela integração do Vercel com o GitHub; a checagem final do site com bypass de cache confirma `v57`. O deploy automático entrou no ar; a checagem direta com bypass de cache confirmou `sw.js` em `v57`, `drawStipple` no render e papel branco no shader. A resposta sem bypass ainda pode mostrar versão anterior por cache da CDN; nesse caso, faça Unregister do service worker e recarregue duas vezes. A rodada `v58` (Pacote 2) foi publicada com autorização em `e982772` (commit + push; deploy automático) e a checagem com `?cb=<timestamp>` confirmou `sw.js` em `blobtrack-celular-00-v58`. A documentação didática dos três efeitos entrou em `9af154b`, sem mudança de runtime. A rodada `v59` foi publicada em `d46829b` (commit + push, deploy automático); a checagem com `?cb=<timestamp>` e `cache: 'no-store'` confirmou `sw.js` em `blobtrack-celular-00-v59`, `prepareStipple`/`paintStipple` no render servido e a prova de janela repetida no site com zero erros. A rodada `v60` foi publicada em `8725a69` (commit + push, deploy automático); a checagem com `?cb=<timestamp>` e `cache: 'no-store'` confirmou `sw.js` em `blobtrack-celular-00-v60`, o tooltip novo no HTML servido e o QA completo no site com câmera fake: sessão, três efeitos, oito toggles, quatro abas, mudo, gravação, service worker e offline, com console e rede sem erros.

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
- Corrigidos nesta rodada: base do relatório (`da6b1d7` → `54ff65d`), detalhe da divergência `teste.css` (APK inclui; `SHELL` não inclui), benchmark superado, índice (`v34` → `v60`, passando por `v59`) e redação contradictória sobre qual versão o site serve.
- Cobertura acrescentada no fechamento: `Pointillism no Gear VR respeita o contain e espelha o segundo olho` em `tests/render/render.test.js`. A suíte passou de 222 para **223** testes; com o Pacote 2 chegou a **226**.
- **Resolvido no texto:** `docs/historico/AUDITORIA.md` dizia que `teste.css` estava no shell offline e no APK — verdadeiro na `v34`, falso desde `5bc2b1e`. O APK inclui os três arquivos (`android/app/build.gradle:29-31`), `teste.html` referencia `teste.css` e `teste.js`, mas `sw.js` (`v58`) não inclui nenhum no `SHELL` e `tests/deployment-config.test.js` exige só `html` e `js`. Por decisão do V1su4rt, o texto histórico foi corrigido com notas; o service worker **não** inclui `teste.*`.

### Limites e pendências

- **Não medido em aparelho físico:** câmera real, bateria, gravação, ROI, aparência final e FPS em dispositivo. Headless com câmera fake não substitui celular.
- **Pacote 2:** publicado em `e982772` — leitura única em `analyze`, `drawStipple(..., sample)`, `texSubImage2D` e máscara `dirty`. Contrato congelado preservado.
- **Pacote 3:** depende de aparelho físico; câmera real, bateria, gravação, ROI e aparência final continuam **não medidos**.

## 10. Pacote 2 — readback compartilhado (cache v58, publicado)

- `src/app.js`: `analyze` lê os pixels uma vez (`ctx.getImageData`), chama `tracker.updatePixels` com esse buffer e devolve `{ ...result, dt, pixels, pixelWidth, pixelHeight }`. `src/blob-tracker.js` e `src/domain/blobTrackerCore.js` não mudaram.
- `src/render/render.js`: `drawStipple(..., sample)` reaproveita os pixels do tracker quando válidos (com fallback ao mini-canvas); a textura WebGL é alocada uma vez com `texImage2D` e atualizada com `texSubImage2D` (fallback de realocação se o sub-update falhar); `putImageData` da binarizada só acontece quando a máscara muda ou o canvas é redimensionado.
- Prova headless em `http://127.0.0.1:8000/?cb=<timestamp>`: 1 `getImageData` por quadro (`400×225`), 60 `texSubImage2D`, 0 `texImage2D`, `putImageData` em 25 de 60 quadros; `tRender` ~`0,96–1,09 ms` no Pointillism e `2,28 ms` no Gear VR; FPS `28,83`; `erros []`.
- Validação: `npm test` **226/226** (novos testes de readback compartilhado, `texSubImage2D`, máscara `dirty` e Gear VR), `node --check` limpo em 58 arquivos, `git diff --check` limpo, nove rodadas de benchmark com p95 mediano `1,340 ms` ≤ teto `1,347 ms`.
- Prova no deploy (`https://blobtrak.vercel.app/?cb=<timestamp>`): `sw.js` em `v58`, código publicado com `tracker.updatePixels`, `texSubImage2D`, `sample?.data` e máscara `dirty`; `#visual` 100% branco com 2000 pontos por quadro no Pointillism, `tRender` `0,95–1,22 ms` e Gear VR `2,71 ms`, FPS `28,8`, `erros []`. A instrumentação no site viu leituras em `400×225` e `480×270` conforme a qualidade automática — sempre **uma** por quadro —, 1 `texImage2D` (alocação inicial) + 49 `texSubImage2D` em 50 quadros e `putImageData` da máscara em `400×225`.
- Status: publicado em `e982772` com autorização do V1su4rt. Nada aqui é medição em aparelho físico.

## 11. Pontilhado dentro das janelas (cache v59, publicado)

Pedido do V1su4rt: o Pontilhado também deve “viver dentro das janelas dos blobs”. Opção escolhida: **pontos por cima do vídeo cru**, reaproveitando a grade já calculada para o palco — sem segunda difusão de erro e sem segundo `getImageData`.

- `src/render/render.js`: `prepareStipple` separou o cálculo da grade; `paintStipple` desenha a mesma grade no palco e de novo dentro do `clip` em `drawRawVideoWindows` quando `state.effect === 'dither'`. `stippleReady` é zerado no início de `drawMaskOverlay` para evitar pintura com grade de quadro anterior. `drawStipple` virou wrapper, mantendo a assinatura pública.
- Contrato congelado intacto: `src/domain/blobTrackerCore.js` e a assinatura de `src/blob-tracker.js` não mudaram. Cache publicado em `blobtrack-celular-00-v59`; testes de cache ajustados.
- Validação: `npm test` **228/228** (novo teste em `tests/render/render.test.js` confirma o mesmo número de arcos dentro da janela e nenhum `document.createElement`; novo teste estático em `tests/app-structure.test.js` travou `prepareStipple`/`paintStipple`).
- Prova headless em `http://127.0.0.1:8000/?cb=<timestamp>` com câmera fake, Janela viva ligada: dentro da janela `[13,212,412,427]`, **100%** dos pixels pintados e **22,21%** pretos (pontos sobre o vídeo); fora dela, **20,08%** pintados e **19,83%** pretos. Sem Janela viva, o overlay fica **21,57%** pintado e **21,57%** preto (só pontos).
- Em 1 segundo de medição: arcos no overlay **130.934** com janela contra **64.924** sem janela; `clip` **58** contra **29**. A grade é pintada duas vezes por quadro, sem recalcular.
- `tRender`: `~1,59 ms` com janela, `~0,87 ms` sem janela; cenários do diagnóstico geral: `dither + janela` `1,63 ms`, `dither sem janela` `1,00 ms`, `dither sem vídeo original` `1,47 ms`, `com inverter vídeo` `1,68 ms`, Gear VR `3,21 ms`. FPS `28,8`; `erros []`. Instrumentação: 1 `getImageData` por quadro (`400×225`), 0 `texImage2D`, 60 `texSubImage2D`, `putImageData` da máscara em 25 de 60 quadros.
- Prova no deploy (`https://blobtrak.vercel.app/?cb=<timestamp>`): `sw.js` em `blobtrack-celular-00-v59` com `cache: 'no-store'`, `prepareStipple` e `paintStipple` presentes no render servido. Com Janela viva e blobs detectados, a janela ficou com 100% de pixels pintados e 22,2% a 29,2% pretos; fora dela, ~19% a 20% pintados e pretos. Sem janela, ~21% pintados e pretos. Arcos no overlay ~130 mil com janela contra ~65 mil sem; `clip` 58 contra 29 em 1 s. `tRender` `1,58–2,16 ms` com janela e `0,98–1,07 ms` sem; FPS `28,8`; `erros []` em quatro repetições.
- Status: publicado em `d46829b` com autorização do V1su4rt. CPU, bateria, câmera real, gravação, ROI e aparência final em aparelho físico: **não medidos**.

## 12. Vídeo original com efeito na janela (cache v60, publicado)

Pedido literal do V1su4rt: “Inverter e Preto e branco e pontilhado tenha um efeito legal quando esta ligado o ‘video original’ e quando esta desligado so deixar o video dentro dos blob como no janela viva”. Ou seja, o botão passa a significar o contrário do que significava: **ligado = efeito na janela; desligado = janela crua**.

- `src/render/render.js`: `enableEffect` vale `state.originalVideoWindows || state.videoBlend > 0`; o filtro da janela é `effectFilter` quando o botão está ligado (ou quando há mistura explícita), mais `invert(1)` se Inverter vídeo estiver ativo. Com o botão desligado e sem outros controles, o filtro é `'none'`.
- O repintar dos pontos dentro da janela ganhou o mesmo guard: `if (state.effect === 'dither' && state.originalVideoWindows) paintStipple(...)`. Desligado, a janela é composta depois dos pontos do palco e fica com vídeo cru, sem grade repintada.
- Tooltip e `originalVideoHint` nos quatro idiomas explicam a regra; `index.html`, `pt-BR.js`, `en.js`, `es.js` e `fr.js` alinhados. `sw.js` segue em `blobtrack-celular-00-v60` (o bump `v59` → `v60` já tinha sido feito nesta rodada não publicada).
- Contrato congelado intacto: `src/domain/blobTrackerCore.js` e a assinatura de `src/blob-tracker.js` não mudaram.
- **Otimização 1 — poda da grade:** `paintStipple` ganhou o parâmetro `clipRect`; a janela passa a união dos retângulos dos blobs e só coloca no caminho os pontos que cruzam essa caixa. Aparência preservada pelo `clip` das bordas.
- **Otimização 2 — estado do canvas:** os resets manuais de `filter` e `globalAlpha` depois do `restore()` saíram; `save()`/`restore()` já fazem isso. Rects degenerados/fora da viewport também são ignorados antes do `clip`.
- **Otimização 3 — recorte da origem:** `drawSource` amostra só o bbox normalizado dos blobs, com espelho, `cover`/`contain` e Gear VR preservados. Teste novo em `tests/render/render.test.js` trava `sx/sy/sw/sh` e o destino dentro da viewport.
- Validação estática: `npm test` **231/231**; `node --check` limpo em 60 arquivos; `git diff --check` sem erros (só aviso de CRLF no Markdown). Testes atualizados em `tests/render/render.test.js` e `tests/app-structure.test.js` cobrem os seis cenários, a poda e o recorte da origem.
- Prova headless no local (`http://127.0.0.1:8000/?cb=<timestamp>`, câmera fake, blobs detectados): **Inverter ligado** → `invert(1)`, luma `170,6`; desligado → sem filtro, luma `94,8`. **Preto e branco ligado** → `grayscale(1) contrast(8)`, 0% de cor e 82,7% de preto; desligado → sem filtro, 100% de cor, luma `91,7`. **Pontilhado ligado** → `grayscale(1) contrast(2)`, ~64.436 arcos; desligado → sem filtro, ~58.300 arcos (só o palco) e 100% de cor na janela. `erros []`.
- Medição por etapa: antes das otimizações, `dither + janela` tinha ~130.118 arcos/s, 58 escritas de `filter`/s e `tRender 1,72 ms`. Depois da poda: ~66.431 arcos/s e `1,19 ms`. Depois da higiene: 29 escritas de `filter`/s e `1,11 ms`. Depois do recorte da origem: `1,14 ms` no Pontilhado, `0,19 ms` com Inverter e `2,69 ms` no Gear VR. FPS `28,8`; `erros []`. O custo que sobrou na janela é o vídeo em si, não a grade duplicada.
- QA funcional final (câmera fake, viewport `412×915`): sessão ativa (`Traseira principal`, `400×225 · fps 29`, blob detectado), três efeitos alternaram, oito toggles ligaram/desligaram e voltaram ao estado inicial, quatro abas trocaram de painel, mudo alternou, gravação `idle → recording → idle`, service worker controlou a página em `blobtrack-celular-00-v60`, recarga offline reconstruiu a tela. Console (`0 erros`) e rede (`0 falhas`) limpos. Câmera real, bateria, gravação em aparelho e aparência final: **não medidos**.
- Status: **publicado** em `8725a69` e conferido no ar com `?cb=<timestamp>` e `cache: 'no-store'`; a documentação do deploy entrou em `7e843cc`. CPU, bateria, câmera real, gravação, ROI e aparência final em aparelho físico: **não medidos** (Pacote 3).

## 13. Pacote 3 — pré-checagem no emulador Android (sem mudança de runtime)

Pedido do V1su4rt: aplicar o Pacote 3. Como não há aparelho físico neste ambiente, o autorizou a rodar a parte funcional no emulador Android já instalado no laptop. **Nenhuma linha de runtime foi alterada**; o site testado foi a `v60` publicada, com cache `blobtrack-celular-00-v60`.

- Preparação: AVD `BlobTrackEmulator` (Android 10, `sdk_gphone64_x86_64`) iniciado com `emulator.exe -avd BlobTrackEmulator -no-boot-anim -no-snapshot-load`; `adb` local em `android/.local-build/android-sdk/platform-tools/adb.exe`; APK `dist/BlobTrack-Celular-00-debug.apk` instalado com sucesso (`com.blobtrack.celular00.debug`); câmera e áudio concedidos ao Chrome; CDP em `http://127.0.0.1:9222` via `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
- Ambiente medido: Chrome `124.0.0.0` em Android 10, `navigator.userAgent` `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36`, viewport `160×284`, `WebGL2 ativo`, câmera virtual `Traseira principal`.
- Funcionalidade: sessão iniciou em `160×284 · fps 20`; três efeitos (`invert`, `threshold`, `dither`) alternaram; oito toggles ligaram/desligaram e voltaram ao estado original; quatro abas trocaram de painel; mudo alternou; ROI com `#rectangleButton` em `aria-pressed=true` e ajuda por teclado; blobs `0 → 1 → 2` após **Reaprender fundo** (energia `5%`, densidade `26%`). `consoleErrors []` e `failedRequests []`.
- Ciclo de vida: home por ~6 s e retorno na mesma aba preservou a sessão (`Traseira principal`, palco visível, `fps ~18,7`, 2 blobs). A rotação forçada para paisagem mostrou `160×90 · fps 19` com sessão preservada e foi revertida. Recarga offline reconstruiu a tela com `navigator.serviceWorker.controller` em `https://blobtrak.vercel.app/sw.js`.
- **Gravação não disponível no emulador:** `#recordButtonPanel` com `hidden=true`, `disabled=true` e título "Gravação não suportada neste navegador.". O Chrome 124 oferece `video/webm;codecs=vp9`, `vp8` e `video/webm`, mas não MP4; `selectRecordingMimeType` em `src/recorder.js` só aceita MP4 desde `4cdf5cc`, então `recorder.isSupported()` retorna `false`. É consequência da decisão MP4-only publicada na `v60`, não uma regressão. Questionado sobre adicionar WebM como fallback, o V1su4rt confirmou **manter MP4-only**; não houve mudança de runtime, cache bump ou nova publicação. Detalhe em [`gravacao.md`](gravacao.md).
- Abrir uma segunda aba encerra a sessão com "BlobTrack Celular-00 já está aberto em outra aba"; é o controle de aba única, não um defeito, e não se confunde com o teste de segundo plano (mesma aba).
- Soak de `300,4 s` (30 amostras a cada 10 s): FPS p50 `19,72` / p95 `20,00` / mín `17,76`; `tAnalysis` p50 `16,28 ms` / p95 `20,44 ms` / pico `21,63 ms`; `tRender` p50 `0,80 ms` / p95 `1,04 ms` / pico `1,12 ms`; blobs `0–2`, quadros `160×284` a `15–21 fps`, `consoleErrors []`. É teste de estabilidade do fluxo, não baseline de aparelho.
- **Ainda não medido em aparelho físico:** bateria, calor/thermal throttling, GPU real, sensor de câmera, foco/luz, toque de dedo na ROI, aparência final dos pontos, gravação de 30 s com salvamento/compartilhamento/reprodução e iPhone/Safari. FPS e tempos do emulador x86 com câmera fake **não** representam um celular. Matriz completa em [`device-matrix.md`](device-matrix.md).

## 14. Prompt mestre de performance — aparelho declarado e Etapa 0

- Aparelho informado pelo V1su4rt: **Realme C67**, modelo `RMX3890`, Android 15 com Realme UI, Chrome, 8 GB de RAM, Snapdragon 685 octa-core. É dado **declarado**, não medido por instrumento neste ambiente.
- Sintomas confirmados pelo dono (evidência primária): trava com todos os efeitos e trava ao gravar/salvar, sobretudo ao salvar. Não foram questionados.
- Perfil provável (`src/core/deviceProfile.js:8-10`): `equilibrado` ou `alto`, com `captureWidth` `960`, alvo de `24–30 fps` e bitrate `3–4,5 Mbps`. Inferência de código, sujeita ao valor real de `navigator.deviceMemory`; o emulador usou o perfil `leve` (`20 fps`, `640`), por isso seus números não servem de baseline.
- Etapa 0: `sw.js:16-22` **já apaga** caches antigos com o prefixo `blobtrack-celular-00-`, preserva o atual e chama `clients.claim()`; `tests/sw-behavior.test.js:98-104` prova que `another-app-v1` não é apagado. O V1su4rt escolheu **manter `blobtrack-celular-00-v60`**; nenhuma linha de cache foi alterada.
- Diagnóstico A–F, plano priorizado e diffs mínimos foram entregues na conversa. O V1su4rt aprovou o **P0**: com `state.maxEffects` e gravação ativa, `src/render/render.js` deixa de repintar o pontilhado dentro das janelas e de desenhar rastro/ondas/malha/rede/telemetria; o vídeo e o efeito base continuam. Cache subiu para `blobtrack-celular-00-v61` e os testes de versão acompanham. Commit `027f6c8` publicado em 27/11/2026: `blobtrak.vercel.app` e `blobtraking.vercel.app` servem `sw.js` com `v61` (HTTP 200). Validação antes do deploy: `npm test` 232/232, `node --check` e `git diff --check` limpos, bench p95 `1,086 / 0,966 / 1,153 ms` ≤ `1,347 ms`. O ganho no Realme C67 ainda **não foi medido**; depende do teste manual na Vercel.

## 15. Kit de medição cirúrgica (cache v62 → v63 → v64 → v65, publicado)

- O prompt cirúrgico proíbe otimizar por palpite. Antes de qualquer nova mudança de comportamento, entrou o medidor desativável `src/core/perfProbe.js`, ativo só com `?perf=1`. Ele publica `window.__blobtrackPerf` (separado de `__blobtrackMetrics`) com `report()`, `json()` e `reset()`; mede `captura`, `readback`, `analise`, `estipple`, `renderWebGL`, `overlay`, `composicao`, `janelas`, `audio`, `gravacao`, `longTasks`, `gc`, memória, `salvamentoMs`, `pauseReason`, `pauseCount` e resoluções/DPR. Nenhuma chave antiga de `__blobtrackMetrics` foi alterada: entraram só `pauseReason`, `pauseCount` e `tPorEfeito` (`null` sem `?perf=1`). Nenhum efeito muda quando a URL não tem `?perf=1`.
- Commit `6360b5a` publicou o kit em `v62`; `254d714` documentou. A rodada seguinte de FASE 1 expôs as três chaves pedidas no prompt (`pauseReason`, `pauseCount`, `tPorEfeito`) em `__blobtrackMetrics` e subiu para `v63`. `npm test` **238/238**, `node --check src/app.js`/`src/render/render.js` e `git diff --check` limpos. Bench do núcleo: três execuções isoladas em `v62` deram p95 `1,150 / 1,294 / 1,225 ms`; em `v63`, `1,251 / 1,253 / 1,147 ms` (todas ≤ `1,347 ms`). Descartamos uma amostra rodada em paralelo com `npm test` (p95 `3,076 ms` por contenção de CPU, não por regressão).
- Os dois domínios passaram a servir `sw.js` com `blobtrack-celular-00-v63` e `./src/core/perfProbe.js` no `SHELL`, confirmado com `?cb=<timestamp>` (27/11/2026). A limpeza dos caches antigos segue intacta.

## 16. Coleta sem PC (cache v64)

_Atualizado: a `v65` separou `readbackDraw`/`readbackPixels` e acrescentou `fps`/`trackingWidth` ao relatório._

- O V1su4rt informou que não sabe usar `chrome://inspect` e que o aviso "Efeitos reativos pausados" continua aparecendo no celular. Então entrou um painel visível só com `?perf=1`: `index.html` ganha `<details id="perfDiag" hidden>`, `src/app.css` o estilo fixo no canto, e `src/app.js` liga **Atualizar / Copiar / Compartilhar / Zerar** em `__blobtrackPerf`. O texto sai pelo `navigator.clipboard`, por `navigator.share` ou por seleção manual do `<pre>`.
- Os quatro idiomas (`pt-BR`, `en`, `es`, `fr`) receberam juntos `ui.perfDiagnostic`, `perfDiagHint`, `perfRefresh`, `perfCopy`, `perfShare`, `perfReset` e `messages.perfCopied`, `perfSelectCopy`, `perfShareUnavailable`. Nenhuma string antiga foi apagada. `perfProbeMeta()` agora publica `cacheVersion`, conferido por teste contra `sw.js`.
- O aparelho segue sem medição: o painel é o que permite trazer os números sem depuração USB. O aviso de pausa permanece até a FASE 3, que depende desses números.
## 17. Primeira medição em aparelho físico (v64, 27/11/2026)

- O V1su4rt enviou o JSON do Realme C67: perfil `alto`, cache `v64`, `recordingState: idle`, `pauseReason: low-fps`, `pauseCount: 2`, `effectsPaused: true`. Canvas visual/overlay `635×1316` com DPR `2,55` limitado a `1,5`; câmera `540×960`; análise já no piso de `160×284`.
- Orçamento excedido: soma dos p50 das etapas `39,8 ms` contra `33,3 ms` de 30 FPS. `readback` p50 `31,7 ms` / p95 `53,2 ms` / máx `133,3 ms`; `analise` p50 `2,9 ms`; todos os efeitos visuais juntos `3,6 ms`; áudio e gravação `0,2 ms`. `longTasks` em 429 de 1200 quadros, p50 `56 ms` / p95 `77,6 ms`.
- **Causa provada:** o gargalo é o caminho síncrono de leitura de pixels, não os efeitos, não o áudio, não os shaders e não a gravação (que estava inativa). O badge veio do gatilho de FPS baixo, não do orçamento de render: render p95 `0,7 ms` está longe do limiar de `13,33 ms`.
- A `v65` separou as duas etapas e acrescentou `fps`/`trackingWidth` ao JSON, sem mudar comportamento.
- Detalhes e tabela completa em [`perf-antes-depois.md`](perf-antes-depois.md).

## 18. Segunda e terceira medições; experimento revertido (v65 → v66 → v67)

- `v65`: `readbackDraw` p50 `0,1 ms`, `readbackPixels` p50 `40,0 ms`, `fps` `15,4`. O custo inteiro estava no `getImageData`.
- `v66` (gravando, canvas `301×624`): `analyze()` desenhou do vídeo em vez do `frameCanvas`. O custo migrou: `readbackDraw` p50 `41,7 ms`, `readbackPixels` p50 `1,2 ms`, `readback` p50 `43,0 ms`, `fps` `16,22`. Sem ganho; **revertido** em `v67` com o cache avançando. Veredito: a espera é a sincronização GPU→CPU, não a função 2D escolhida.
- `pauseReason: render-budget` na `v66` é **rótulo inferido**, não gatilho: `fps` `16,22` estava abaixo do limiar `16,5` de `low-fps`, e os estágios de render somam `~3,3 ms` contra o limite de `13,33 ms`. A etiqueta deixou de existir na `v69`, junto com a remoção da pausa.
- `salvamentoMs: null`, `eventos: {}` também na `v66`: o cenário de gravação foi coletado, o de **salvar o MP4** segue sem medição.
- **Conflito resolvido na `v69`:** o P0 (`recordingBudget`) cortava rastro/ondas/malha/rede/telemetria ao gravar com Todos os efeitos, sem badge. O dono autorizou alterar os testes de contrato e a política de pausa foi removida. O cenário de **salvar MP4** continua sem medição (`salvamentoMs: null`, `eventos: {}`).

## 19. Sonda WebGL (v68, publicada, sem medição)

- Antes de implementar um caminho de pixels via WebGL, a `v68` acrescenta `render.probeGlReadback()` e a etapa `glReadback` ao relatório. Com `?perf=1`, ela faz um `gl.readPixels` de até `240×427` do framebuffer já desenhado, reaproveitando um buffer, e publica só o tempo. Sem `?perf=1`, nada é chamado: rastreador, efeitos, render e gravador seguem idênticos à `v67`.
- Objetivo: comparar a sincronização de leitura do WebGL com os `~41 ms` do caminho 2D. Se for barata, o próximo commit implementa o alvo pequeno; se não for, a hipótese é descartada por número, sem mudança de comportamento.
- O dono autorizou alterar os testes de contrato (`tests/core/qualityController.test.js`, `tests/network-effect.test.js` e, por consequência, `tests/distance-telemetry.test.js`). A remoção da pausa virou a `v69` abaixo.

## 20. Reatividade intocável (v69, implementada, sem medição em aparelho)

- Autorização recebida: remover os gatilhos de pausa, o `renderPause` do `qualityController`, o `recordingBudget` do render e o badge "Efeitos reativos pausados". `effectsPaused` agora é sempre `false`; `pauseReason`/`pauseCount` seguem no JSON como `''`/`0` só para compatibilidade com medições antigas.
- No lugar do badge entrou um aviso discreto no palco, **Aparelho no limite · efeitos mantidos**, traduzido nos 4 idiomas. Ele acende após 8 quadros com FPS médio abaixo de `max(12, fps do perfil × 0,55)` e apaga quando a média volta; gravar não é exceção. Não há toast, não há corte de efeitos e não há rebaixamento: só a largura do rastreio continua automática.
- `__blobtrackPerf` e `__blobtrackMetrics` ganharam `deviceLimit` para o dono conferir no JSON se o aviso apareceu sem precisar olhar a tela.
- Testes de contrato reescritos para exigir o contrário do antigo: nenhum `renderPause`, nenhum `recordingBudget`, nenhuma porta `effectsPaused` no renderer e desenho incondicional de rastro/ondas/malha/rede/telemetria.
- **Medido depois:** chegou a amostra da `v69` (19:37) com `effectsPaused: false`, `pauseReason: ''`, `pauseCount: 0`, `deviceLimit: true` e `recordingState: recording`. A política de pausa foi confirmada removida no aparelho e o aviso discreto apareceu como previsto. O FPS dessa amostra, porém, veio contaminado pela sonda WebGL (seção 21). Travamento ao salvar segue sem medição.

## 21. Sonda WebGL medida e descartada (v70)

- Amostra da `v69` no Realme C67, gravando, todos os efeitos ativos: `glReadback` p50 `33,1 ms` / p95 `45,64 ms`; no mesmo ciclo, `readback` p50 `17,7 ms` com `readbackDraw` `0,1 ms` e `readbackPixels` `17,4 ms`. A sonda custou ~1,9× o caminho 2D atual. **Hipótese WebGL descartada por número**; nenhum alvo WebGL foi implementado, nenhuma linha do rastreador mudou.
- Como a sonda rodava a cada quadro, acrescentava ~`33 ms` ao ciclo: `fps: 12,89` e `longTasks` p50 `70 ms` nessa amostra **não** medem o app sem ela. Não há base para dizer que a `v69` caiu de `15,92` para `12,89 FPS` por causa da remoção da pausa.
- A `v70` coloca `glReadback` atrás de `?perf=1&gl=1` e publica `sondaGl` no JSON. Com `?perf=1` sozinho, a coleta fica limpa. Nenhum efeito, render, áudio ou gravação mudou; só o custo do kit de medição.
- Nessa amostra ainda não havia medição de salvamento; a próxima seção registra a primeira.

## 22. Primeira medição de salvamento e separação de fases (v71)

- Nova amostra (19:50) **ainda com cache `v69`**: `effectsPaused: false`, `pauseReason: ''`, `pauseCount: 0`, `deviceLimit: true`, `recordingState: idle`, canvas visual `635×1101`. `glReadback` segue presente porque era a `v69`; p50 `24,3 ms` contra `readbackPixels` p50 `22,0 ms` — mesma conclusão da seção 21, sem vantagem do WebGL.
- Primeiro `salvamentoMs` do Realme C67: **11044,9 ms** (`eventos.saveStart` `147992,2` → `saveEnd` `159037,1`). É a primeira medição objetiva do "trava ao salvar" relatado pelo dono.
- O contador `saveStart`→`saveEnd` inclui `window.showSaveFilePicker()` (`src/recording-export.js:81`), ou seja, o tempo em que o **diálogo do Android fica aberto esperando o usuário escolher o destino**. Sem separar, não é válido atribuir os `11,0 s` a travamento do app.
- A `v71` acrescenta marcas `savePicker`, `saveWrite`, `saveShare` e `saveDownload` via `onPhase`, e publica `seletorMs`, `escritaMs`, `compartilhamentoMs` e `downloadMs`. Nenhuma linha do fluxo de salvar mudou — só instrumentação.
- A amostra veio da `v69` porque o cache do service worker não avançou no aparelho (o servidor já servia `v70`). Próxima coleta precisa confirmar `cacheVersion: v71` e `sondaGl: false` no JSON limpo.
- Aprovação final segue dependendo de: JSON limpo com gravação + **Salvar**, 2 min com todos os efeitos, rotação, segundo plano 5 s e 30 min sem travamento; o dono responde `y` ou `N` com o passo que falhou.

## 23. Primeira amostra limpa (v70, sem sonda WebGL)

- Amostra das 20:01 com `cacheVersion: v70`, `sondaGl: false` e `glReadback.n: 0`: a sonda desligada funcionou. `effectsPaused: false`, `pauseReason: ''`, `pauseCount: 0`, `deviceLimit: false` — neste cenário o aviso discreto **não** apareceu, e os efeitos continuaram ativos. `recordingState: idle`; cenário exato não declarado pelo dono.
- **FPS limpo: 23,35** (contra `12,89` e `14,13` das amostras contaminadas pela sonda). Está abaixo da meta de 24–30 FPS, mas perto; a diferença entre as amostras mostra que `glReadback` estava mesmo inflando o custo. Ainda é uma leitura única — não basta para afirmar estabilidade em 2 min nem em 30 min.
- Gargalo continua no pixel: `readback` p50 `44,4 ms` / p95 `60,325 ms`, com `readbackDraw` `0,1 ms` e `readbackPixels` `44,1 ms`. `analise` p50 `7,1 ms`; efeitos visuais somam ~`5,9 ms` de p50; áudio/gravação `0,7 ms`. `longTasks` p50 `62 ms` / p95 `84,3 ms`. Note a variabilidade: em amostras anteriores o mesmo `readbackPixels` marcou `17,4` e `22,0 ms` de p50. Uma amostra não separa causa de ruído térmico/cenário.
- `salvamentoMs: 4462,2 ms` nesta amostra (contra `11044,9 ms` na anterior), ainda sem `seletorMs`/`escritaMs` porque o aparelho ficou na `v70`. A variação reforça que o contador inclui o diálogo do sistema.
- **Cache preso:** o celular aparece exatamente uma versão atrás do servidor em toda coleta. Para quebrar o ciclo, o dono deve abrir em **janela anônima** (`?perf=1`), que não reaproveita o service worker nem o HTTP cache, ou limpar os dados do site no Chrome. Sem isso, a `v71` nunca entra no aparelho e a separação do salvamento não pode ser medida.

## 24. v71 limpa: salvamento separado e Pontilhado ausente

- Amostra das 20:11 com `cacheVersion: v71`, `sondaGl: false` e `glReadback.n: 0`: a janela anônima destravou o cache. `effectsPaused: false`, `pauseReason: ''`, `pauseCount: 0`, `deviceLimit: false` — segunda coleta limpa seguida sem pausa e sem aviso.
- **FPS limpo: 23,6** (antes: `23,35`). Duas leituras curtas próximas, ainda abaixo da meta de 24–30 FPS; nenhuma delas é teste de 2 min ou 30 min.
- `readback` p50 `50,6 ms` / p95 `69,83 ms`, com `readbackDraw` `0,1 ms` e `readbackPixels` `50,2 ms`; `analise` p50 `8,3 ms`; `longTasks` p50 `71 ms` / p95 `100,7 ms`. O mesmo `readbackPixels` já marcou `17,4`, `22,0`, `44,1` e agora `50,2 ms` de p50 — variabilidade alta; sem medição controlada, não se pode dizer se é calor, cenário ou outra causa.
- **`estipple.n: 0`:** o Pontilhado (`state.effect === 'dither'`, `src/render/render.js:870-874`) não estava ativo nesta coleta. Portanto **esta amostra não é "todos os efeitos"**; `overlay` e `janelas` sim tiveram amostras. A validação final precisa repetir com o Pontilhado ligado.
- **Salvamento separado:** `salvamentoMs: 4384,4`, `seletorMs: 2696,6` (~61% do total), `escritaMs: 1687,3` (~39%), `saveEnd` apenas `0,5 ms` depois de `saveWrite`. A maior parte é o diálogo do Android esperando o destino; o resto é a escrita do arquivo. O "trava ao salvar" relatado pelo dono tem número agora, mas ainda não prova travamento do main thread: os `longTasks` da coleta ficaram em p95 `100,7 ms`.
- Faltam, para aprovação: 2 min com todos os efeitos (inclusive Pontilhado), gravar 1 min e salvar, rotação, segundo plano 5 s, 30 min sem travamento — e o `y`/`N` final do dono com o passo que falhou.

## 25. Primeira coleta com Pontilhado ligado (v71)

- Amostra das 20:25 com `cacheVersion: v71`, `sondaGl: false`, `glReadback.n: 0`, `effectsPaused: false`, `pauseReason: ''`, `pauseCount: 0`, `deviceLimit: false`. **`estipple.n: 949`**: o Pontilhado entrou de fato (`state.effect === 'dither'`). `overlay` e `janelas` também registraram 949 amostras. O JSON **não** traz campo separado para Ondas, Grade, Rede de blobs, Distâncias ou Rastro — esses cinco dependem do que foi marcado na tela, não do instrumento.
- **FPS: 21,65** (contra `23,6` sem Pontilhado e `23,35` na v70). Continua abaixo da meta de 24–30 FPS. **Não há base para culpar o Pontilhado pela queda**: `estipple` p50 `0,8 ms` / p95 `1,5 ms`. O gargalo segue no pixel: `readback` p50 `45,8 ms` / p95 `65,78 ms`, `readbackPixels` p50 `45,4 ms`, `analise` p50 `9,3 ms`, `longTasks` p50 `66 ms` / p95 `90,6 ms`. Série de p50 do `readbackPixels`: `17,4 / 22,0 / 44,1 / 50,2 / 45,4 ms` — variação alta, causa não provada.
- **Segunda separação do salvamento:** `salvamentoMs: 4889,8`, `seletorMs: 3057` (~62%), `escritaMs: 1832,1` (~38%), `saveEnd` `0,7 ms` depois de `saveWrite`. Confirma o padrão da coleta anterior: o diálogo do Android domina o total e a escrita do arquivo vem depois.
- A coleta tem 949 quadros — ainda não é teste de 2 min nem de 30 min. Faltam rotação, segundo plano 5 s e volta, 30 min sem travamento, aviso discreto nunca aparecer, `effectsPaused` sempre `false`, e o `y`/`N` final do dono dizendo qual passo falhou.

## 26. Encerramento da validação e nova frente

- Em 27/11/2026 o V1su4rt respondeu **"está bom pode fechar"**, equivalente ao `y` combinado. A frente de fluidez/reatividade está encerrada por decisão dele.
- **Não foi informado** quais dos passos longos (2 min contínuos, rotação, segundo plano 5 s, 30 min) foram executados de fato. Registrar apenas o aceite para fechar; não afirmar medição ou teste manual que não foi relatado.
- Os números válidos que ficam como linha de base são os das três coletas limpas: `fps` `23,35` / `23,6` / `21,65`, `readback` p50 `44,4` / `50,6` / `45,8 ms`, `estipple` p50 `0,8 ms` na coleta com Pontilhado, e salvamento `4384,4` / `4889,8 ms` com `seletorMs` dominando (~61–62%).
- Próxima frente, prioridade do dono: aprimorar **Pontilhado**, **Preto e branco** e **Inverter** sem comprometer desempenho. Diagnóstico separado em `docs/perf-antes-depois.md`; nenhuma mudança de runtime foi feita nesta seção.

## 27. Melhorias visuais e piano do Tom Base (v72 → v75, publicadas; sem medição no aparelho)

- **`bba5f90` (v72):** Inverter e Preto e branco saíram das janelas e passaram a valer no quadro todo. O seletor de efeito virou número para o shader (`invert→0`, `threshold→1`, `dither→2`, demais→3); o fallback 2D usa `invert(1)` / `grayscale(1) contrast(8)` nos mesmos casos. `npm test` 247/247; bench p95 `1,121 / 1,166 / 1,236 ms`.
- **`dc74eba` (v73):** o `step()` seco do Preto e branco virou `smoothstep(t-0.06, t+0.06, l)` no ramo 1; no fallback, `contrast(8)` → `contrast(4)`. `state.threshold` do rastreador **não** foi tocado. `npm test` 247/247; bench p95 `1,212 / 1,215 / 1,216 ms`.
- **`7f955cb` (v74):** Pontilhado subiu de 6 para 8 níveis de tom e ganhou jitter menor onde a luma muda depressa (borda), calculado com os vizinhos da própria grade — sem novo `getImageData`, sem `trackingWidth` maior e sem tocar no rastreador. `npm test` 248/248; bench p95 `1,225 / 1,198 / 0,985 ms`, contra a linha de base do Pontilhado medida no aparelho (`estipple` p50 `0,8 ms` / p95 `1,5 ms`).
- **`e0669f6` (v75):** piano do Tom Base dentro de `#stage`, na base da tela cheia (modo palco ou `html:fullscreen`, exceto Gear VR). São as mesmas oito teclas `data-audio-key` do painel; `syncAudioKey()` acende as duas fileiras e o clique continua passando pelo seletor `audioKey`. Rótulos e notas reusam as chaves já traduzidas em pt-BR/es/en/fr. `npm test` 249/249; bench p95 `1,221 / 1,245 / 1,263 ms`.
- Reatividade intocável nas quatro mudanças: sem `setReactiveEffectsPaused`, sem `renderPause`, sem `recordingBudget` e sem badge; `effectsPaused` segue `false`. Cache subiu de `v71` para `v75` com limpeza dos antigos preservada; estratégia do `sw.js` inalterada.
- **Nenhuma medição em aparelho foi informada para v72–v75.** Os números acima são de bench do núcleo no ambiente local, com teto p95 ≤ `1,347 ms`. A confirmação no Realme C67 (`cacheVersion: blobtrack-celular-00-v75`, `sondaGl: false`, `glReadback.n: 0`) está pendente; não afirmar FPS, 2 min, rotação, segundo plano ou 30 min para estas versões.
