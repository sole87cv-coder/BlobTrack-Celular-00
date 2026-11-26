# Diagnóstico completo — 25/11/2026

Base: commit `54ff65d` (`docs: confirma publicacao v57 do pointillism e registra medicao`), publicado em `https://blobtrak.vercel.app`. Servidor local em `http://localhost:8000`, preso a `127.0.0.1`. O diagnóstico começou no `v55`; passou pelo `v56` (pontos na máscara) e agora registra o `v57` (Pointillism por error diffusion), publicado em `https://blobtrak.vercel.app`.

## 1. Verificações executadas

| Checagem | Resultado |
|---|---|
| `npm test` | 223/223 aprovados (inclui o teste de Gear VR do Pointillism). |
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
| `docs/historico/AUDITORIA.md` afirma que `teste.css` está no shell offline e no APK | 🟢 Corrigido no texto histórico | A afirmação era válida no cache `v34`; `5bc2b1e` (22/11) removeu `teste.*` do `SHELL`. Hoje `android/app/build.gradle` inclui `teste.html`, `teste.js` e `teste.css` no APK, mas `sw.js` (`v57`) não inclui nenhum dos três; `teste.html` referencia `teste.css` e `teste.js`, e `tests/deployment-config.test.js` exige só `html` e `js` no deploy. O `AUDITORIA.md` ganhou notas explicativas; decisão do V1su4rt: **não** mudar o runtime. |
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

- Benchmark do núcleo (`scripts/bench-blobtrack.js`), três execuções com a máquina em repouso em `25/11/2026`: p50 `0,786 / 0,734 / 0,744 ms` (mediana `0,744`), p95 `1,233 / 1,505 / 1,248 ms` (mediana `1,248`), pico `1,959 / 1,921 / 1,697 ms` (mediana `1,921`).
- O teto histórico é p95 ≤ `1,347 ms` (baseline × 1,15). A mediana atual (`1,248 ms`) está **dentro** do teto. A rodada anterior (p95 `1,531 / 2,106 / 2,341 ms`, registrada na `v56`) rodou sob contenda da máquina e não indicou regressão: não houve alteração em `src/domain/blobTrackerCore.js` nem em `src/blob-tracker.js` entre `c4cc4e0..HEAD`. Nenhuma mudança de núcleo foi feita por causa destes números.

### Gargalo conhecido

- `getImageData` é o maior custo de CPU: p50 `2,1–2,2 ms`, p95 `4,0–4,9 ms`, até `11,9 ms` com efeitos máximos. Removê-lo sem quebrar a ponte congelada de `src/blob-tracker.js` não é possível; qualquer mudança aqui é 🔴.
- `texImage2D` é barato (p50 `0 ms`, p95 `0,1 ms`). HUD custa ~`0,03 ms/quadro`. Overlay com efeitos máximos: `tComposition` `0,4 ms`, 2868 `stroke` e 495 `fillText` em 64 quadros; o `v55` já agrupou malha e rede.
- FPS headless: `28,8` com teto 30, 0–1 quadros acima de 33 ms. **RAM/heap e bateria: não medidos.**

### Pendências

- **Pacote 2:** compartilhar o readback de `analyze`, usar `texSubImage2D` e marcar `dirty` da máscara. Agora há um **segundo** `getImageData` por quadro quando o Pointillism está ligado (mini-canvas `200×120`); compartilhar a leitura ficou mais valioso, mas toca no contrato congelado: só com medição e aprovação.
- **Pacote 3:** medir em aparelho real FPS, bateria, tamanho dos pontos, ROI, gravação e os cinco efeitos. Sem isso, qualquer ganho no celular é hipótese, não resultado.
- Confirmar no aparelho o Pointillism (`v57`): papel branco, pontos pretos de tamanhos diferentes formando a imagem e janelas de vídeo por cima. As versões anteriores (`v55` halftone branco, `v56` pontos na máscara) foram substituídas; o overlay ocioso continua o mesmo.

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

A rodada de documentação entrou no commit `525de4d`, a mudança de runtime do Pontilhado de formas foi publicada no commit `da6b1d7` (cache `v56`) e a rodada do Pointillism foi publicada no commit `a039e80` (commit + push, com autorização do V1su4rt). O deploy é automático pela integração do Vercel com o GitHub; a checagem final do site com bypass de cache confirma `v57`. O deploy automático entrou no ar; a checagem direta com bypass de cache confirmou `sw.js` em `v57`, `drawStipple` no render e papel branco no shader. A resposta sem bypass ainda pode mostrar `v56` por cache da CDN; nesse caso, faça Unregister do service worker e recarregue duas vezes.

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

Escopo pedido pelo V1su4rt: **BlobTrack v57 publicado**, sem alterar runtime.

### Repositório e deploy

- Git em `54ff65d` com documentação e testes pendentes de publicação; `npm test` **223/223**; `node --check` limpo em **58** arquivos `.js`; `git diff --check` limpo.
- Contrato congelado intacto: nenhuma mudança em `src/domain/blobTrackerCore.js` nem na assinatura de `src/blob-tracker.js` entre `c4cc4e0..HEAD`.
- Site com `?cb=<timestamp>` e `cache: 'no-store'`: `sw.js` em `blobtrack-celular-00-v57`, `drawStipple` presente no render, `DOT_CELL` ausente, `uEffect==2` com papel branco no shader, botões Pontilhado / Janela viva / Vídeo original no HTML. Cache-Control do `sw.js`: `public, max-age=0, must-revalidate`.

### Comportamento no navegador (Chromium headless, câmera fake, site com bypass de cache)

| Cenário | `#visual` branco | `#overlay` preto / pintado | `tRender` | `tComposition` | FPS | leitura `200×120` p50 / p95 |
|---|---|---|---|---|---|---|
| Inverter (efeito base) | 0% (papel preto, esperado) | 0% / 0% | 1,0 ms | 0,2 ms | 22,3 (aquecimento) | — |
| Limiar | 0% | — / 25,7% | 0,25 ms | 0,1 ms | 28,7 | — |
| Pointillism + Janela viva | 100% | 17,6% / 53,4% | 3,15 ms | 3,3 ms | 28,8 | 1,7 / 8,1 ms |
| Pointillism sem Janela viva | 100% | 21,8% / 21,8% | 2,89 ms | 2,6 ms | 28,8 | 1,7 / 7,0 ms |
| Pointillism sem Vídeo original | 100% | 24,4% / 37,3% | 4,17 ms | 2,8 ms | 28,0 | 1,6 / 6,1 ms |
| Pointillism com Inverter vídeo | 100% | 54,9% / 66,1% | 3,41 ms | 2,9 ms | 28,7 | 1,7 / 5,4 ms |
| Gear VR | 13,5% (faixa contain, esperado) | 6,8% / 7,0% | 6,59 ms | 6,4 ms | 28,6 | 1,7 / 4,8 ms |

- `WebGL2 ativo`; **zero erros de console** em todos os cenários. A janela compõe por cima dos pontos (área pintada sobe de 21,8% para 53,4% com Janela viva); Inverter vídeo troca a maioria dos pontos para branco sobre papel preto. Gear VR é o cenário mais caro por causa da geometria `contain`.
- O hook de `uEffect` não capturou o valor nesta rodada (o objeto `WebGLUniformLocation` não expõe o nome como string); a confirmação do branch veio do `#visual` 100% branco e do texto do shader servido, não desse hook.

### Desempenho do núcleo

- Três execuções em máquina em repouso: p50 `0,786 / 0,734 / 0,744 ms`, p95 `1,233 / 1,505 / 1,248 ms`, pico `1,959 / 1,921 / 1,697 ms`. p95 mediano `1,248 ms` ≤ teto `1,347 ms`: **sem regressão**. O p95 alto da rodada da `v56` era contenda da máquina.

### Documentação

- 10 arquivos `.md` visitados, **0 links relativos quebrados**.
- Corrigidos nesta rodada: base do relatório (`da6b1d7` → `54ff65d`), detalhe da divergência `teste.css` (APK inclui; `SHELL` não inclui), benchmark superado, índice (`v34` → `v57` em vez de `v55`) e redação contradictória sobre qual versão o site serve.
- Cobertura acrescentada no fechamento: `Pointillism no Gear VR respeita o contain e espelha o segundo olho` em `tests/render/render.test.js`. A suíte passou de 222 para **223** testes. Nenhuma linha de runtime mudou.
- **Resolvido no texto:** `docs/historico/AUDITORIA.md` dizia que `teste.css` estava no shell offline e no APK — verdadeiro na `v34`, falso desde `5bc2b1e`. O APK inclui os três arquivos (`android/app/build.gradle:29-31`), `teste.html` referencia `teste.css` e `teste.js`, mas `sw.js` (`v57`) não inclui nenhum no `SHELL` e `tests/deployment-config.test.js` exige só `html` e `js`. Por decisão do V1su4rt, o texto histórico foi corrigido com notas; o service worker **não** foi alterado.

### Limites e pendências

- **Não medido em aparelho físico:** câmera real, bateria, gravação, ROI, aparência final e FPS em dispositivo. Headless com câmera fake não substitui celular.
- **Pacote 2:** o Pointillism adicionou um segundo `getImageData` por quadro; compartilhar o readback com `analyze`, usar `texSubImage2D` e marcar `dirty` da máscara continua bloqueado pelo contrato congelado — só com medição e aprovação.
- Nenhum arquivo de runtime foi alterado nesta rodada. As correções de documentação ficaram **locais, sem commit nem publicação** até autorização.
