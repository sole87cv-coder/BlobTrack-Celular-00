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
- Diagnóstico A–F, plano priorizado e diffs mínimos foram entregues na conversa. O V1su4rt aprovou o **P0**: com `state.maxEffects` e gravação ativa, `src/render/render.js` deixa de repintar o pontilhado dentro das janelas e de desenhar rastro/ondas/malha/rede/telemetria; o vídeo e o efeito base continuam. Cache subiu para `blobtrack-celular-00-v61` e os testes de versão acompanham. Commit `027f6c8` publicado em 27/11/2026: o site oficial `blobtrak.vercel.app` serve `sw.js` com `v61` (HTTP 200). Validação antes do deploy: `npm test` 232/232, `node --check` e `git diff --check` limpos, bench p95 `1,086 / 0,966 / 1,153 ms` ≤ `1,347 ms`. O ganho no Realme C67 ainda **não foi medido**; depende do teste manual na Vercel.

## 15. Kit de medição cirúrgica (cache v62 → v63 → v64 → v65, publicado)

- O prompt cirúrgico proíbe otimizar por palpite. Antes de qualquer nova mudança de comportamento, entrou o medidor desativável `src/core/perfProbe.js`, ativo só com `?perf=1`. Ele publica `window.__blobtrackPerf` (separado de `__blobtrackMetrics`) com `report()`, `json()` e `reset()`; mede `captura`, `readback`, `analise`, `estipple`, `renderWebGL`, `overlay`, `composicao`, `janelas`, `audio`, `gravacao`, `longTasks`, `gc`, memória, `salvamentoMs`, `pauseReason`, `pauseCount` e resoluções/DPR. Nenhuma chave antiga de `__blobtrackMetrics` foi alterada: entraram só `pauseReason`, `pauseCount` e `tPorEfeito` (`null` sem `?perf=1`). Nenhum efeito muda quando a URL não tem `?perf=1`.
- Commit `6360b5a` publicou o kit em `v62`; `254d714` documentou. A rodada seguinte de FASE 1 expôs as três chaves pedidas no prompt (`pauseReason`, `pauseCount`, `tPorEfeito`) em `__blobtrackMetrics` e subiu para `v63`. `npm test` **238/238**, `node --check src/app.js`/`src/render/render.js` e `git diff --check` limpos. Bench do núcleo: três execuções isoladas em `v62` deram p95 `1,150 / 1,294 / 1,225 ms`; em `v63`, `1,251 / 1,253 / 1,147 ms` (todas ≤ `1,347 ms`). Descartamos uma amostra rodada em paralelo com `npm test` (p95 `3,076 ms` por contenção de CPU, não por regressão).
- O site oficial passou a servir `sw.js` com `blobtrack-celular-00-v63` e `./src/core/perfProbe.js` no `SHELL`, confirmado com `?cb=<timestamp>` (27/11/2026). A limpeza dos caches antigos segue intacta.

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

## 28. Piano na tela cheia e Pontilhado prioritário (v76 → v77, publicadas; sem medição no aparelho)

- **`275ab25` (v76):** o piano do Tom Base não aparecia no aparelho porque dependia de `:fullscreen`. `syncFullscreenUi()` passou a ligar `body.fullscreen-active` nos eventos `fullscreenchange` e `webkitfullscreenchange`, e o CSS mostra a fileira por essa classe (com `html:fullscreen` como reforço, Gear VR escondido). `npm test` 249/249; bench p95 `1,248 / 1,143 / 1,200 ms`.
- **v77:** o V1su4rt escolheu **fundo preto** fora dos blobs e **negativo** quando o Inverter atua. `drawRawVideoWindows` não pinta mais pontos; `blobsClipRect` recorta a união dos blobs e `paintStipple(..., clip, colors)` pinta o papel nessa área e os pontos formando a imagem. `renderFrame` não compõe `drawRawVideoWindows` com `dotted`; o shader e o fallback pintam preto, e `drawRecordingComposite` já junta canvas + overlay (sem mudar gravação). O botão **Inverter vídeo** virou a polaridade do Pontilhado, já que o app permite um estilo de imagem por vez. Reatividade, contrato do tracker e estratégia de cache intactos. Cache `v77`, `npm test` 249/249; bench p95 `1,134 / 1,225 / 1,262 ms`.
- **Validação pendente no Realme C67:** conferir `cacheVersion: blobtrack-celular-00-v77`, `sondaGl: false`, `glReadback.n: 0`, piano visível na tela cheia e Pontilhado com `estipple.n > 0` (um estilo por vez), com MP4 salvo. Nada de FPS, 2 min, rotação, segundo plano ou 30 min foi informado para v76/v77.

## 29. Instrumento sincronizado com os blobs (P0 + P1, preparado em local; sem commit/push/deploy)

- O V1su4rt escolheu **P0 + P1** com **Tom base transpondo as três faixas**. Diagnóstico de partida: o modo padrão calava as seis vozes (`instrumentBed = this.rhythmEnabled ? 0 : .24`), o ritmo escolhia a nota por `blob.x`, `frameTime` era enviado e ignorado, e as zonas eram 3×2 sem meio, com o topo soando mais grave que o baixo.
- **P0:** `src/audio/audio.js` ganhou `flushSignals()`, que publica o pacote no mesmo quadro sem destruir o debounce de `80 ms` das opções; `src/app.js` chama esse método logo após `queueSignals` e passa `capturedAt` e `audioTime` (`AudioContext.currentTime`). No worklet, `rhythmClock` é alinhado a `audioTime` e a idade do pacote aparece como `lag` no medidor.
- **P1:** modo de faixas ligado por `bandMode: true` em `soundOptions()`. `bandForBlob()` usa histerese de `0,035`: topo (`y < 0,34`) = Hi, meio = Mid, baixo (`y > 0,66`) = Low. Vozes `0/1 = Low`, `2/3 = Mid`, `4/5 = Hi`; `x` escolhe a nota da dupla e o pan, `speed` o nível, `size` o decaimento. `updateBandFrequencies()` aplica `-12/0/+12` semitões e o `key` do Tom base a todas as faixas. Blob parado (`speed <= .02`) não gera drone. O ritmo antigo segue ativo, com volume reduzido para `45%` no modo faixas e oitava agora derivada de `y`.
- **Contratos preservados:** `baseFrequency`, `phaseSteps` e `scale` seguem idênticos fora do modo faixas; nenhuma mudança em `blobTrackerCore.js`, assinatura de `blob-tracker.js`, `sessionLock.js`, manifest, `android/`, reatividade ou estratégia de cache. `effectsPaused` continua `false`.
- Cache preparado para `blobtrack-celular-00-v78` em `sw.js`, `app.js` e testes. **Não publicado:** o site oficial segue servindo `v77` até o V1su4rt autorizar commit, push e deploy. Nenhuma latência de áudio foi medida no Realme C67; `lag` e a preferência por faixa dependem de validação no aparelho, com medição limpa (`?perf=1`, nunca `&gl=1`, `sondaGl: false`, `glReadback.n: 0`).

## 30. Pontilhado com dissolução por área (v79, preparado em local; sem commit/push/deploy)

- O V1su4rt pediu pontos que definam melhor as formas e uma dissolução entre pontos que mostre o que é mais escuro e o que é mais claro no vídeo gravado. O desenho anterior usava `STIPPLE_LEVELS = 8` e raio linear em `quantized`; como a tinta é área, os degraus do meio ficavam com problemas perceptuais e a média **global** da cena achatava a silhueta quando o fundo era claro.
- **Mudanças em `src/render/render.js`:** `STIPPLE_LEVELS = 12`; `grid.dotR[count] = maxR * Math.sqrt(quantized)` (área linear no tom); `localMean = (l + left + right + above + belowLuma) * .2` e `reference = mean * .75 + localMean * .25` (contraste local moderado, mantendo a exposição global como base). Difusão Floyd–Steinberg, pesos `7/16…1/16`, `jitter = 1 - .75 * edge`, recorte `blobsClipRect` e gravação pelo overlay seguem intocados.
- Uma primeira tentativa com `mean * .4 + localMean * .6` fez o fundo claro também virar ponto; os testes de `render.test.js` pegaram isso (`>70%` dos pontos deviam ficar na metade escura). O peso local caiu para `25%` e a suíte voltou a passar.
- **Testes:** nova trava literal em `app-structure.test.js` (`STIPPLE_LEVELS = 12`, `localMean`, `sqrt(quantized)`) e novo teste behavioral em `render.test.js` (`escuro tem ponto maior que claro`, razão > `1,2`). `npm test` **257/257**; cache preparado para `blobtrack-celular-00-v79`. **Nada publicado** até o V1su4rt pedir push/deploy. Nenhuma diferenca visual foi medida no Realme C67: a comparacao lado a lado no aparelho, com Pontilhado selecionado (`estipple.n > 0`) e MP4 salvo, segue pendente.

## 31. Ritmo BlobTrack travado ao movimento (v80, preparado em local; sem commit/push/deploy)

- O V1su4rt relatou que o ritmo se perdeu: no v78 publicado, o modo faixas ainda usava `scheduleRhythmicNote` com pausa e espaçamento sorteados, e o pulso era atenuado para `45%`. O pedido foi **sincronia rítmica total com os blobs** com a opção ligada e, ao desligar, **som sem ritmo, só a frequência**.
- **Novo caminho em `src/audio-processor.js`:** `trackBlobMotion()` guarda a posição anterior de cada blob e acende `blobMotionSeen` quando ele anda (ou aparece). `scheduleBlobRhythm()` só abre a janela do pulso com movimento; o andamento vai de `58` a `132` BPM conforme `energy`, `speed` e `density`, a nota vem de `bandFrequency[banda*2 + (x >= .5 ? 1 : 0)]` do blob mais rápido, e a velocidade do blob define `rhythmVelocity`. Não há `nextRhythmRandom()` nesse caminho: 16 passos com movimento geram 16 pulsos.
- **Desligar corta o beat:** `setSoundOptions` zera `rhythmEnvelope`, `rhythmActive` e `blobMotionSeen` quando `rhythmEnabled` vira `false`; `process()` também zera o envelope quando desligado, e a renderização do beat exige `this.rhythmEnabled`. As vozes de frequência das faixas continuam ativas. O ganho do beat no modo faixas subiu de `45%` para cheio (`.34` contra `.26` no legado).
- **Preservado:** o caminho legado fora do modo faixas (inclusive a suíte de ritmo antiga e seus descansos), `baseFrequency`, `phaseSteps`, o rastreador, a reatividade e a estratégia do `sw.js`. Dicas de texto atualizadas nos quatro idiomas. Cache preparado para `blobtrack-celular-00-v80`.
- **Validação:** `npm test` **260/260**, com três testes novos (16 pulsos sem descanso, nota igual à faixa e determinística entre sementes, e pulso some com blob parado / com ritmo desligado enquanto a frequência permanece). **Nada publicado** até autorização. Nenhum ganho rítmico ou de latência foi medido no Realme C67; conferir no aparelho com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`), alternando o botão **Ritmo BlobTrack**.

## 32. Pulso virou gota d'água (v81, preparado para publicação)

- **Diagnóstico:** o beat do v80 era um seno harmônico na frequência da faixa, com ataque imediato e decaimento exponencial de `60 ms`, ganho `.34` e altura fixa. Soava como toque curto de tambor/apito, sem a queda de altura que faz uma gota parecer água.
- **Mudança em `src/audio-processor.js` (somente `bandMode`):** `rhythmDropAge` marcado em zero a cada gatilho; ataque de `3,5 ms` para evitar clique; frequência instantânea `rhythmFrequency * (.7 + 1.05 * exp(-age/.022))`, ou seja, começa em `~1,75x` e termina em `~0,7x` da nota da faixa em `22 ms`; decaimento do envelope em `30 ms`; ganho `.52` para compensar o rastro mais curto. `rhythmDropFrequency` expõe a altura corrente para teste/diagnóstico. O caminho legado segue com `.26`, `60 ms` e altura firme.
- `rhythmDropAge` e `rhythmEnvelope` também são zerados ao desligar o ritmo e em `renderSilence()`. Dicas dos quatro idiomas falam em gota d'água. Cache elevado para `blobtrack-celular-00-v81`.
- **Acabamento:** um teste novo mede a subida e a queda da altura e o rastro curto (`npm test` **262/262**); o teste de audibilidade precisou aquecer o ganho principal por `24` blocos antes de medir, porque no app o ganho já está estabilizado quando o blob se mexe. Nenhuma diferença sonora ou latência foi medida no Realme C67 — a validação final no aparelho segue pendente.

## 33. Fundo próprio para Inverter e Preto e branco (v82, preparado em local; sem commit/push/deploy)

- **Pedido do V1su4rt:** no Inverter, fundo preto e blobs invertidos; no Preto e branco, mais contraste dentro dos blobs e vídeo em cinza no fundo.
- **Diagnóstico:** os dois estilos eram globais. No shader, `uEffect==0` invertia o quadro todo e `uEffect==1` fazia `smoothstep` binário no quadro todo; no fallback, `invert(1)` e `grayscale(1) contrast(4)` valiam antes do `drawImage` de toda a imagem. Não havia caminho que combinasse fundo e interior, e `blobsClipRect`/`paper/dot` só eram usados no Pontilhado.
- **Mudanças em `src/render/render.js`:** o fallback pinta `#000` também para `invert` e usa `grayscale(1)` para `threshold`; `drawRawVideoWindows` ganhou parâmetro `forcedFilter`, que desenha o vídeo recortado aos blobs com o filtro da composição mesmo com `videoWindows`/`originalVideoWindows` desligados; `drawMaskOverlay` faz essa passada quando `styled` (somente com blobs visíveis) e não repete a janela normal. Filtros: `invert(1)` no Inverter e `grayscale(1) contrast(6)` no Preto e branco; `invertBlend` é concatenado ao final.
- **Mudança em `src\app.js`:** shader passou a `if(uEffect==0){rgb=vec3(0.0);}else if(uEffect==1){rgb=vec3(dot(rgb,vec3(.299,.587,.114)));}else if(uEffect==2){rgb=vec3(0.0);}` — fundo preto no Inverter, fundo cinza no Preto e branco; o contraste alto e a inversão ficam no overlay, que a gravação já copia.
- **Validação:** `npm test` **264/264**, com nova trava estrutural e dois testes de comportamento (fundo preto sem `drawImage` no Inverter, fundo cinza com `drawImage` no Preto e branco, e overlay recortado com os filtros corretos, incluindo `invertBlend`). Cache preparado para `blobtrack-celular-00-v82`. **Nada publicado** até autorização. Nenhuma diferença visual foi medida no Realme C67; comparar os três efeitos no aparelho com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`).

## 34. Gravização e salvamento na base da tela cheia (v83, publicado no commit `ed41b36`)

- **Pedido do V1su4rt:** localizar o botão de gravar/salvar e deixá-lo na parte inferior da tela cheia, discreto e elegante, sem atrapalhar o piano nem os outros menus, antes do commit/push/deploy.
- **Diagnóstico:** `recordButton`/`recordSaveButton` vivem na `.float-bar` do topo e `recordButtonPanel`/`recordSaveButtonPanel` no dock; os dois somem no modo foco, que a gravação liga automaticamente. O `recordIndicator` do topo direita continuava visível, mas só parava a gravação — não salvava. Na base já havia piano em `bottom:calc(56px + var(--safe-bottom))`, barra de ações em `bottom:calc(12px + var(--safe-bottom))`, `focus-hint` em `14px`, `stage-credit` em `42px`, leituras em `72px` e nav em `64px`. Não havia espaço livre central; uma barra de dois botões no canto cobriria a barra de ações em telas de `320 px`.
- **Decisão:** um único botão no canto inferior direito (`right:10px`, `bottom:calc(8px + var(--safe-bottom))`), visível só em `body.fullscreen-active`/`:fullscreen`, com opacidade `.55` que sobe para `1` no hover/foco e durante a gravação. Desligado no Gear VR. `index.html` ganhou `#recordFooterButton` com ícone, rótulo e cronômetro próprios; `src/app.css` ganhou `.stage-record-footer`; `src/app.js` atualiza o botão em `updateRecordingControls()` e o liga a `toggleFooterRecording()`, que escolhe entre salvar (quando há MP4 pronto e a gravação parou), parar e gravar.
- **Não muda:** piano, barra de ações, dock, barra flutuante, botões antigos, handlers de sessão/quick, composição do MP4 (que só desenha `visual → sombra → overlay → marca d'água`, nunca HTML) e a estratégia de cache do `sw.js` (só o número sobe para `v83`).
- **Validação:** `npm test` **265/265** com nova trava estrutural; `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`. **Publicado depois da autorização** no commit `ed41b36`, junto com v82 e v84. Nenhum encaixe visual ou toque foi medido no Realme C67; conferir em tela cheia com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`).

## 35. Tela cheia em paisagem no celular (v84, publicado no commit `ed41b36`)

- **Pergunta do V1su4rt:** a tela cheia não estaria pensada só para retrato? Ele quer usar o app em paisagem também.
- **Diagnóstico:** o CSS já tinha quatro blocos de paisagem (`@media (orientation:landscape)` e variações com `max-height:520px` / `min-width:700px`) que compactam a barra, sobem o piano, estreitam o dock e o transformam em painel lateral em telas largas. O bloqueio vinha do JS: `enterFullscreen(orientation='portrait')` chamava `screen.orientation.lock('portrait')` em toda entrada em tela cheia, inclusive a pedido do modo foco. No iPhone/iPad, onde `screen.orientation.lock` costuma não existir, o giro já funcionava; no Realme C67 (Android/Chrome), o lock impedia.
- **Mudanças em `src/app.js`:** `enterFullscreen(orientation=null)` só chama `lock` quando há um valor explícito — o único chamador assim é o Gear VR (`enterFullscreen('landscape')`). `exitFullscreen()` passa a chamar `screen.orientation?.unlock?.()` para devolver o controle ao aparelho ao sair do Gear VR ou da tela cheia. Modo foco e botão Tela continuam chamando `enterFullscreen()` sem argumento.
- **Mudança em `src\app.css`:** na paisagem larga em que o dock vira painel lateral, o botão novo da base acompanha a barra flutuante (`right:calc(min(320px,26vw) + 22px)`) para não cair sobre o painel.
- **Validação:** `npm test` **266/266** com nova trava estrutural (sem `enterFullscreen('portrait')`, com `unlock` na saída), `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`. Cache preparado para `blobtrack-celular-00-v84`. **Publicado depois da autorização** no commit `ed41b36`; o site serviu `v84` e 33 arquivos de texto + 2 PNG idênticos ao repositório. Nenhum giro, encaixe ou FPS em paisagem foi medido no Realme C67; conferir com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`).

## 36. Pontilhado refinado: malha fina, grão, volume e poda (v85, publicado no commit `f43594f`)

- **Pedido do V1su4rt:** os pontos do Pontilhado estavam muito grandes; ele quer aprimorar, otimizar e melhorar o efeito com sensação de volume entre pontos maiores e menores.
- **Diagnóstico:** o tamanho não vinha do raio sozinho, mas do enquadramento. Num vídeo 16:9 em tela de celular retrato, o `cover` amplia a amostra cerca de 7×: um raio de `1,45 px` na amostra virava ~`10 px` na tela, com ~`21 px` entre centros — poucas colunas visíveis e aspecto de bolinha grande. Além disso, `drawStipple` desenhava os ~2.400 pontos da grade inteira, inclusive os fora da tela, e `Math.min(scaleX,scaleY)` era recalculado dentro do laço.
- **A — malha fina e poda:** `STIPPLE_SPACING` de `3` para `2` (mais colunas, ponto menor, mais detalhe). `dotScale` calculado uma vez fora do laço e descarte dos pontos fora da tela antes do recorte do blob: menos arcos mesmo com mais pontos na grade.
- **B — volume:** `STIPPLE_RADIUS_GAMMA = .68` substitui a raiz quadrada; os 13 raios (12 níveis + 0) ficam em `grid.radii` para não pagar `Math.pow` por ponto. O jitter do ponto de massa agora também cai com o tom (`1 - .3 * quantized`), então o pó solto e a massa presa ao centro leem como volume.
- **C — grão e massa:** arrays de pontos passam a `n * 2`. Toda célula recebe um grão de `STIPPLE_GRAIN_RATIO = .2` do raio máximo; o ponto maior entra só quando `quantized > 0`. O grão é a textura do papel, a massa é a forma — os pontos continuam pretos formando a imagem dentro dos blobs.
- **D — contraste local:** `reference = mean * .65 + localMean * .35` (era `75%/25%`) e `stretched = clamp(.5 + (l - reference) * 3, 0, 1)` (era `2,6`). Custo zero; claro e escuro se separam melhor.
- **Não muda:** fundo preto fora dos blobs, Inverter como negativo, difusão Floyd–Steinberg, 12 níveis, janela viva, composição do MP4 e estratégia de cache do `sw.js` (só o número sobe para `v85`).
- **Validação:** `npm test` **267/267** com nova trava estrutural e novo teste behavioral (grão no claro, massa no escuro, poda do recorte); `node --check`, `git diff --check` e bench 3× com p95 `1,270 / 1,210 / 1,178 ms` (teto `1,347 ms`; rodada anterior `0,981 / 1,193 / 0,990 ms`). Cache `blobtrack-celular-00-v85` publicado no lote `f43594f`. Nenhum tamanho de ponto, volume, FPS ou toque foi medido no Realme C67; conferir com Pontilhado selecionado (`estipple.n > 0`), MP4 salvo e `?perf=1` (`sondaGl: false`, `glReadback.n: 0`).

## 37. Ritmo BlobTrack separado do tom contínuo (v86, publicado no commit `f43594f`)

- **Pedido do V1su4rt:** antes do commit/push/deploy, aprimorar o Ritmo BlobTrack e limpar a mistura com o "som constante" — ele quer ouvir claramente a diferença entre o Ritmo ligado e desligado.
- **Diagnóstico:** no modo faixas (`bandMode: true` em todo o app), `updateBandVoices()` preenchia `bandTargets` com seis vozes contínuas a partir do movimento dos blobs **independente de `rhythmEnabled`**. No laço de áudio, `voiceLevel[z]` seguia esses alvos e somava uma onda contínua; a gota de `scheduleBlobRhythm()` entrava por cima. Resultado: ligado = gota + drone; desligado = drone. As dicas dos quatro idiomas já prometiam o contrário ("desligado, só a frequência contínua"), então o código é que estava fora do contrato.
- **Mudança em `src/audio-processor.js`:** `const bandGain = this.rhythmEnabled ? 0 : (.3 + .7 * this.sensitivity) * .5;` — com o Ritmo ligado os alvos das seis vozes vão a zero e só a gota toca. `blobBands` continua sendo atualizado, então a altura da gota ainda vem da faixa certa. `setSoundOptions()` só reage quando `rhythmEnabled` **muda** e, nessa troca, zera `delayBuffer`, `chorusBuffer`, `voiceLevel`, `rhythmEnvelope`, `rhythmDropAge`, `rhythmActive` e `blobMotionSeen`: sem rastro do modo anterior colando no novo.
- **Mudança em `src/ui/i18n/`:** as quatro dicas (pt-BR, en, es, fr) agora dizem explicitamente que ligado = só gotas, sem tom contínuo, e desligado = só frequência contínua das faixas.
- **Não muda:** relógio determinístico pelo movimento do blob (sem pausa sorteada), faixa Hi/Mid/Low, ataque de `3,5 ms`, queda de altura em `22 ms`, rastro de `30 ms`, modo legado, rastreador, reatividade, Pontilhado, MP4 e estratégia de cache do `sw.js` (só o número sobe para `v86`).
- **Validação:** `npm test` **268/268** com novo teste behavioral (faixas mudas com Ritmo ligado, rastro limpo na troca, gota ainda na faixa do blob) e novas travas estruturais; `node --check` em runtime e dicas, `git diff --check` limpos, bench 3× com p95 `1,181 / 0,979 / 1,085 ms` (teto `1,347 ms`). Medição em Node com blob em movimento: ligado pico `0,358` e som audível em `55,8%` das amostras; desligado pico `0,290` e `99,6%`. **Isso é simulação em Node, não medição de aparelho.** Publicado no lote `f43594f`. O som da troca no Realme C67 ainda **não foi medido**: alternar o botão **Ritmo BlobTrack** e escutar com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`).

## 38. Eco, Espaço e Chorus com sala, largura e troca limpa (v87, publicado no commit `f43594f`)

- **Pedido do V1su4rt:** aplicar as melhorias A+B+C+D propostas para os três efeitos de áudio antes de qualquer publicação.
- **Diagnóstico (medido em Node, com blob em movimento):** o **Espaço** era quase mudo — três reflexos em `29/41/53 ms` caíam em cima do próprio som (`0,290 → 0,294` no tom contínuo, nenhuma diferença com a gota). O **Chorus** era mono (canal direito cópia do esquerdo) e o vaivém de `0,24 Hz` era lento demais para dar largura. Eco e Espaço dividiam o mesmo buffer com realimentação mista, então juntos soavam como um Eco só. Além disso, índices e leituras dos buffers eram calculados mesmo com os três efeitos desligados.
- **A — sala de verdade:** reflexos em `72/113/167 ms` com ganhos decrescentes `.13/.09/.06`, `spaceLevel` de `.55` a `1` conforme a velocidade do blob, com subida de `40 ms` e descida de `80 ms` — a sala respira com o movimento em vez de ser três toques grudados.
- **B — Chorus estéreo:** leitura esquerda em `18 ms + sweep`, direita em `24 ms - sweep`, `sweep = .005 * sin(fase)` e `FX_CHORUS_RATE = .6 Hz`. O lado direito não é mais cópia do esquerdo.
- **C — poda e separação:** `effectMix` com fade de `40/80 ms` por efeito, `mixNorm = 1 / max(1, (echo + space + chorus) * .5)` para teto de volume, leitura/escrita dos buffers só quando o efeito correspondente está ativo; só o Eco realimenta `delayBuffer` (`// Só o Eco realimenta: o Espaço é um quarto, não um segundo eco.`). Os dois laços (faixas e legado) receberam a mesma mistura, com saídas L/R separadas no legado. A troca de efeitos zera os buffers antes de subir o novo estado.
- **D — validação comportamental:** três testes novos em `tests/audio-processor.test.js` (sala aumenta energia e espaça os reflexos; Chorus abre diferença entre canais e começa mudo; buffers parados com efeitos desligados) e uma trava estrutural em `tests/app-structure.test.js`.
- **Não muda:** a gota e o relógio do Ritmo, `baseFrequency`, o rastreador, a reatividade, o Pontilhado, o MP4 e a estratégia de cache do `sw.js` (só o número sobe para `v87`).
- **Validação:** `npm test` **272/272**, `node --check`, `git diff --check` limpos, bench 3× com p95 `1,086 / 1,287 / 1,142 ms` (teto `1,347 ms`). Medição em **Node**, não no aparelho: com a gota, o Espaço foi de `56,6%` para `86,7%` de áudio audível; no tom contínuo, pico de `0,290` para `0,316`; Chorus com diferença média entre canais `0,02857` (antes `0`); fade `0 → 0,0645` no primeiro bloco; `delayIndex` parado com efeitos desligados. Publicado no lote `f43594f`. **Medido no aparelho: nada** — a escuta no Realme C67 continua pendente (um efeito por vez e depois os três juntos, com `?perf=1`, `sondaGl: false`, `glReadback.n: 0`).

## 39. Recorte com véu, limpeza, cantos arrastáveis e número no painel (v88, publicado no commit `f43594f`)

- **Pedido do V1su4rt:** aplicar A+B+C no Retângulo — A = feedback visual do recorte, B = apagar e redimensionar, C = número no painel — com autorização dada antes de qualquer publicação.
- **Diagnóstico:** o recorte já limitava o rastreio, mas não aparecia na tela; sem uma referência visual, o usuário não sabia se a região estava ativa nem onde ficava. Áudio, Pontilhado e gravação permanecem intocados.
- **A — véu fora do arquivo:** novo canvas `#roiVeil` sobre o palco (`z-index:2`, `pointer-events:none`) com escurecimento e recorte transparente na ROI, mais quatro alças claras nos cantos. `drawRoiVeil()` é chamado em `drawMaskOverlay()` e pelos botões; o PNG e o MP4 leem só `visual + overlay`, então o véu é ajuda na tela, nunca conteúdo exportado. `state.showRoiVeil` começa ligado e é persistido; `manualRects` seguem sem persistência.
- **B — apagar e ajustar:** `roiHandleAt` encontra o canto mais próximo do toque (tolerância de 10 px convertida para coordenadas normalizadas); `resizeRoiRect` move o canto com piso de `0,015` e limites `0..1`, sem colapsar a caixa. Botão **Limpar retângulos** zera a lista, o arrasto em curso e o modo de desenho; `didResizeRect` impede que arrastar um canto dispare a troca de câmera por swipe.
- **C — número no painel:** `updateHud` usa `getTrackingRoi(source)` para mostrar cobertura percentual e `blobs dentro/total`, e o mesmo número aparece no selo do palco quando há recorte ativo.
- **Não muda:** `manualRects` sem persistência, rastreador, reatividade, Pontilhado, Ritmo, efeitos de áudio, piano, composição do MP4 e estratégia de cache do `sw.js` (só o número sobe para `v88`).
- **Validação:** `npm test` **275/275**, `node --check`, `git diff --check` limpos, bench 3× com p95 `1,144 / 1,170 / 1,167 ms` (teto `1,347 ms`). Publicado no lote `f43594f`. **Medido no aparelho: nada** — conferir no Realme C67 com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`): véu ligado/desligado, arrasto dos quatro cantos, limpeza, número no painel e MP4 sem o véu.

## 40. Guias e Distâncias em cantos opostos (v89, publicado no commit `f43594f`)

- **Pedido do V1su4rt:** os dados pequenos de **Guias** poderiam ficar do outro lado dos dados de **Distância**, em cantos opostos, quando os dois efeitos ligam juntos? Aprovou a implementação com acomodação automática.
- **Diagnóstico:** os dois conjuntos de rótulos são pintados no mesmo `overlayContext`: `drawDistanceTelemetry` escreve o `Npx` perto do meio da linha entre pares e, depois, o bloco `state.overlay` escreve `NN%` no canto superior esquerdo de cada uma das seis zonas e `B<id>` acima de cada blob. Com os dois ligados, os textos podiam se sobrepor porque os blobs se movem livremente.
- **Implementação:** `placeOverlayLabel` mede o texto, testa os centros candidatos contra uma lista compartilhada de caixas já usadas (margem de `3 px`) e escolhe o primeiro livre; se nenhum servir, usa o primeiro candidato para não perder a etiqueta. `drawMaskOverlay` cria `labelOccupied` só quando `state.overlay && state.distanceTelemetry`. Distância preenche a lista primeiro; depois vêm as zonas (canto inferior direito primeiro — oposto às linhas —, com três alternativas) e os `B<id>` (acima/abaixo, esquerda/direita do blob, limites do palco). `c.save()/c.restore()` impedem que `textAlign`/`textBaseline` vazem para os retângulos manuais.
- **Não muda:** com um efeito só, o caminho antigo de `fillText` segue intacto (sem `measureText`, sem lista, sem `save/restore` extra). Rastreador, som, Pontilhado, Recorte, composição do MP4 e estratégia de cache do `sw.js` (só o número sobe para `v89`) continuam iguais. No Gear VR a lista é compartilhada dentro de cada olho, porque as coordenadas já incluem `offsetX`.
- **Validação:** `npm test` **279/279** (novos testes em `tests/distance-telemetry.test.js`, teste de integração em `tests/render/render.test.js` e trava estrutural em `tests/app-structure.test.js`), `node --check`, `git diff --check` limpos, bench 3× com p95 `1,214 / 1,148 / 0,929 ms` (teto `1,347 ms`). Publicado no lote `f43594f`. **Medido no aparelho: nada** — conferir no Realme C67 com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`): Guias + Distâncias juntos, sem texto sobreposto, o mesmo no Gear VR e no MP4 salvo.

## 41. Pontilhado com degradê suave e recorte só nos blobs (v90, publicado no commit `5d3da01`)

- **Pedido do V1su4rt:** melhorar o Pontilhado com “degradê entre os pontos” e deixar o efeito só nos blobs. Ele escolheu **mais níveis de cinza** como forma do degradê.
- **Diagnóstico:** `STIPPLE_LEVELS` era `12`, o que deixava a passagem claro→escuro com degraus mais duros. `blobsClipRect` devolvia um único retângulo união de todos os blobs; com dois blobs separados, o vão entre eles ficava dentro desse retângulo e recebia papel/pontos.
- **A — mais níveis de cinza:** `STIPPLE_LEVELS` subiu de `12` para `24` em `src/render/render.js`. A difusão de erro Floyd–Steinberg continua a mesma; os pontos pretos continuam formando a imagem (pointillism), sem virar foto lisa nem máscara.
- **B — recorte por blob:** `blobsClipRect` agora devolve uma lista de retângulos, um por blob visível. `paintStipple` aceita rect único ou array (compatibilidade), monta a união só para poda rápida, aplica o clip/papel por retângulo de blob e, quando há mais de um blob, descarta pontos que não caem em nenhum retângulo. O vão entre blobs fica preto.
- **Não muda:** rastreador, reatividade, composição do MP4, Gear VR (mesmo caminho de desenho), Inverter como negativo, difusão Floyd–Steinberg, grão, potência `.68`, jitter de borda e a estratégia de cache do `sw.js` (só o número sobe para `v90`).
- **Validação:** `npm test` **280/280** (novo teste behavioral “Pontilhado recorta por blob e não pinta o vão entre blobs”, travas de estrutura/cache atualizadas), `node --check` limpo em `src/render/render.js`, `src/app.js`, `sw.js`, `git diff --check` limpo, bench 3× com p95 `1,271 / 1,218 / 1,195 ms` (teto `1,347 ms`). Publicado no commit `5d3da01`. **Medido no aparelho: nada** — conferir no Realme C67 com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`): selecionar Pontilhado, confirmar `estipple.n > 0`, verificar degradê mais suave e vão preto entre blobs separados, salvar MP4 e confirmar que o efeito aparece só nos blobs.

## 42. Pontilhado recortado pela máscara real do blob (v91, preparado em local; sem commit/push/deploy)

- **Pedido do V1su4rt:** o Pontilhado ainda tinha vazamentos dentro dos retângulos dos blobs; queria o efeito prolijo, otimizado e contido dentro dos blobs.
- **Diagnóstico:** o v90 recortava por bbox (retângulo) de cada blob. Isso removia o vão entre blobs, mas os cantos do retângulo, fora da silhueta real, ainda podiam receber papel/pontos.
- **Correção:** em `src/render/render.js`, quando `dotted` está ativo, a máscara binária (`result.mask`) é atualizada mesmo sem “Mostrar máscara”. Após `drawStipple`, o render aplica `c.globalCompositeOperation = 'destination-in'` e desenha `maskCanvas` com a mesma transformação (espelho, cover/contain, Gear VR), mantendo só os pixels dentro da forma real do blob. A máscara passou a usar alfa real (`OFF = 0x00000000`, `ON = 0xFFFFFFFF`) para o recorte funcionar.
- **Não muda:** rastreador, reatividade, composição do MP4, Gear VR, Inverter como negativo, difusão Floyd–Steinberg, 24 níveis, grão, potência `.68`, recorte por bbox como poda rápida e a estratégia de cache do `sw.js` (só o número sobe para `v91`).
- **Validação:** `npm test` **280/280**, `node --check` limpo em `src/render/render.js`, `src/app.js`, `sw.js`, `git diff --check` limpo, bench 3× com p95 `1,276 / 1,275 / 1,270 ms` (teto `1,347 ms`; uma rodada inicial deu `3,715 ms` por ruído da máquina e foi repetida). **Nada publicado** até autorização. **Medido no aparelho: nada** — conferir no Realme C67 com `?perf=1` (`sondaGl: false`, `glReadback.n: 0`): selecionar Pontilhado, confirmar `estipple.n > 0`, verificar ausência de vazamento no contorno/cantos dos blobs, salvar MP4.
