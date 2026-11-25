# Diagnóstico completo — 25/11/2026

Base: commit `7905661` (`fix: corrige Pontilhado em cena escura e otimiza overlay, cache v55`), já publicado em `https://blobtrak.vercel.app`. Servidor local em `http://localhost:8000`, preso a `127.0.0.1`. Este relatório não mudou runtime: cache continua `v55`.

## 1. Verificações executadas

| Checagem | Resultado |
|---|---|
| `npm test` | 222/222 aprovados. |
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
| `docs/historico/AUDITORIA.md` afirma que `teste.css` está no shell offline e no APK | 🔴 Divergência pendente | `sw.js` (`SHELL`, cache `v55`) **não** inclui `teste.html`, `teste.js` nem `teste.css`. `teste.html` referencia `teste.css` e `teste.js`, e `tests/deployment-config.test.js` exige que `teste.html` e `teste.js` continuem no deploy. Decidir: incluir os três no `SHELL` (exige `v56` + testes + README) ou corrigir a redação histórica do relatório. Conteúdo preservado; decisão ainda pendente. |
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

- Benchmark do núcleo (`scripts/bench-blobtrack.js`), três execuções nesta máquina: p50 `0,744 / 0,877 / 0,956 ms`, p95 `1,531 / 2,106 / 2,341 ms`, pico `2,245 / 4,576 / 3,541 ms`.
- O teto histórico é p95 ≤ `1,347 ms` (baseline × 1,15). As três amostras ficaram acima, **sem alteração** em `src/domain/blobTrackerCore.js` nem em `src/blob-tracker.js`. O histórico em `docs/perf-antes-depois.md` já registrou p95 entre `1,44` e `1,52 ms` em execuções carregadas. Tratar como ruído/contenda da máquina: repetir com a máquina parada antes de falar em regressão. Nenhuma mudança de núcleo foi feita por causa destes números.

### Gargalo conhecido

- `getImageData` é o maior custo de CPU: p50 `2,1–2,2 ms`, p95 `4,0–4,9 ms`, até `11,9 ms` com efeitos máximos. Removê-lo sem quebrar a ponte congelada de `src/blob-tracker.js` não é possível; qualquer mudança aqui é 🔴.
- `texImage2D` é barato (p50 `0 ms`, p95 `0,1 ms`). HUD custa ~`0,03 ms/quadro`. Overlay com efeitos máximos: `tComposition` `0,4 ms`, 2868 `stroke` e 495 `fillText` em 64 quadros; o `v55` já agrupou malha e rede.
- FPS headless: `28,8` com teto 30, 0–1 quadros acima de 33 ms. **RAM/heap e bateria: não medidos.**

### Pendências

- **Pacote 2:** compartilhar o readback de `analyze`, usar `texSubImage2D` e marcar `dirty` da máscara. São caminhos de CPU, mas tocam no contrato congelado: só com medição e aprovação.
- **Pacote 3:** medir em aparelho real FPS, bateria, tamanho do halftone, ROI, gravação e os cinco efeitos. Sem isso, qualquer ganho no celular é hipótese, não resultado.
- Confirmar no aparelho o Pontilhado de formas (`v56`): base limpa, pontos só nos blobs e janelas de vídeo ativas. O comportamento anterior (`v55`, 19,7% de branco no headless) foi substituído; o overlay ocioso continua o mesmo.

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

A rodada de documentação foi publicada no commit `525de4d`, sem deploy. A mudança de runtime do Pontilhado (`v56`) ainda não foi publicada: quando for, exige commit, push e deploy para atualizar o service worker. Até lá, `https://blobtrak.vercel.app` continua servindo `v55`.

## 7. Pontilhado de formas (cache v56)

Opção A aprovada pelo V1su4rt e implementada:

- O branch `uEffect==2` do shader em `src/app.js` e o fallback em `src/render/render.js` pintam só base limpa. O halftone de quadro inteiro (`getHalftoneFrame`) foi removido.
- Os pontos são gerados no laço que já empacota a máscara em `drawMaskOverlay` (`DOT_CELL = 14`, `DOT_RADIUS_SQ = 0.55`), convertendo a célula do palco para pixels de rastreio. Sem novo `getImageData` e sem nova textura.
- O guard `state.effect === 'dither'` saiu de `drawRawVideoWindows`. Janela viva, Vídeo original, Inverter vídeo e mistura voltam a atuar com Pontilhado.
- Os três rótulos de vídeo ganharam chaves nos quatro idiomas; antes ficavam presos em pt-BR.
- Contrato congelado intacto: `src/domain/blobTrackerCore.js` e a assinatura de `src/blob-tracker.js` não foram tocados.
- Verificação: `npm test` 222/222, `node --check` limpo, `git diff --check` limpo. No headless em `http://localhost:8000`, `#visual` ficou com 0% de branco, `#overlay` mostrou pontos só nas formas e não houve erro de console. CPU, FPS, bateria e aparência no aparelho físico: **não medidos**.
