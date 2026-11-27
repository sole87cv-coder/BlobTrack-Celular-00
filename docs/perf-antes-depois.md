# Desempenho: antes e depois

## Método e limites

O script `scripts/bench-blobtrack.js` mede somente `BlobTrackerCore.updatePixels`: RGBA 320×180, duas regiões sintéticas móveis de 14×14, 30 quadros de aquecimento e 300 medidos em Node.js. Baseline: p50 `0,835 ms`, p95 `1,171 ms`, pico `3,924 ms`. O aceite congelado é p95 ≤ `8 ms`, p95 ≤ baseline × 1,15 (`1,347 ms`) e pico ≤ `16 ms`.

| Etapa | p50 (ms) | p95 (ms) | Pico (ms) | Observação |
|---|---:|---:|---:|---|
| Baseline anterior às mudanças | 0,835 | 1,171 | 3,924 | Node.js 26.13.1 |
| S3 IDs, amostra registrada | — | 1,096 | 4,459 | Uma medição pós-etapa |
| S5 ROI, duas amostras | — | 1,248 / 0,901 | — | Caminho padrão sem ROI também coberto |
| S6–S9, três medições registradas | 0,676 / 0,569 / 0,669 | 1,294 / 1,006 / 1,282 | 1,669 / 2,490 / 1,787 | Histórico deste ciclo |
| Execução final após S7 | 0,676 / 0,675 / 0,687 | 1,065 / 1,340 / 1,324 | 1,525 / 1,969 / 1,724 | Três execuções; abaixo do teto, uma próxima dele |
| P0-1 e P0-2, uma amostra por etapa | 0,713 / 0,740 | 1,646 / 1,380 | 2,562 / 2,857 | p95 acima do teto nas duas amostras isoladas; o baseline já havia registrado 1,680 e 1,391, então não foi atribuído ganho ou regressão causal |
| P0-3 e P1-1, três medições finais | 0,701 / 0,708 / 0,545 | 1,340 / 1,367 / 1,200 | 1,731 / 2,240 / 1,674 | Duas abaixo do teto; a segunda ficou 0,020 ms acima. Núcleo do tracker inalterado nessas etapas |

- O P0-1 teve ainda um microbenchmark isolado do processador de áudio silencioso: 20.000 blocos passaram de `1238,6 ms` para `2,7 ms`. Esse número mede outro caminho e não é comparável à tabela acima.
- P0-3 (blur) e P1-1 (observer de idioma/HUD) não têm medição de GPU, bateria ou FPS em aparelho: a checagem foi sintática e por testes estáticos. O cache offline subiu para `v51` para forçar a atualização do shell, incluindo a marca d'água `@V1su4rt` apenas na gravação, o teclado de 8 teclas do Tom base, a política de pausa/retomada dos efeitos reativos (cooldown de 4 s, retomada alinhada ao limiar de pausa, menos escritas no DOM, toast de pausa no máximo a cada 30 s e nenhum toast ao retomar), a correção do contexto 2D da opção “Ver binarizada” e o pontilhado com pontos grandes (célula de 16 px, raio de 5,5 px, pattern cacheado por contexto).
- Floyd-Steinberg aprimorado (cache `v52`): o Pontilhado passou a gerar um quadro BW por difusão de erro serpenteada, com erro limitado em `±0,35` e resolução limitada a no máximo `320×240` / `57.600` pixels. Os dois buffers de linha são reutilizados e o mini-canvas é recriado só quando a resolução muda; o shader perdeu o branch Bayer e passa a desenhar o quadro já binarizado. Microbenchmark isolado da difusão em Node: p50 `0,814 ms`, p95 `1,086 ms`, pico `1,603 ms` em 320×180 (304×171: p95 `0,865 ms`; 189×240: p95 `0,636 ms`). Em Chromium headless com câmera fake, 64 quadros: p50 `2,5 ms`, p95 `6,8 ms`, pico `19,5 ms` incluindo `getImageData`/`putImageData`; `fps` médio `28,8`, `tRender` médio `2,58 ms`, sem efeitos pausados. O quadro gerado teve só preto e branco, branco entre `28%` e `32%` e nenhum pixel inválido. Não é medição em aparelho físico.
- Correção WebGL + Pontilhado halftone (cache `v53`): o núcleo e a ponte de câmera não mudaram. Antes, com WebGL2 ativo, `texImage2D` e `drawArrays` tinham **0** chamadas e os `350.612` pixels do palco ficavam pretos: `glProgram` era passado como `null` para `createRender`, e a atribuição posterior em `render.glProgram` não atualizava a variável local usada por `renderFrame`. Como `gl` existia, o fallback 2D era nulo e nada era desenhado. O Floyd–Steinberg chegava a gerar 29–31% de branco no mini-canvas, mas esse quadro nunca ia para a tela; na v51 um pattern de overlay escondia o defeito. Depois, o shader voltou a desenhar (`uEffect==2`, célula de `14 px`) e o fallback 2D passou a gerar círculos com `HALFTONE_CELL = 10` sem `putImageData` por quadro. Em Chromium headless com câmera fake: `73` uploads/draws, `25,7%` de branco na tela, pixel central `252`, nenhum erro de WebGL; `tRender` do dither caiu de `2,05 ms` para `0,09 ms` no cenário limpo, e no fallback 2D de `2,53 ms` para `1,82 ms`. Quatro medições novas do benchmark do núcleo nesta máquina ficaram com p95 entre `1,44` e `1,52 ms`, acima do teto histórico de `1,347 ms`, sem alteração em `src/domain/blobTrackerCore.js` ou `src/blob-tracker.js`; tratar como ruído da máquina e repetir antes de falar em regressão. Não é medição em aparelho físico.
- Pacote 1 — reaproveitamento sem mudança visual (cache `v54`): a view `Uint32Array` da máscara passou a ser criada junto com `maskImage` (antes, `new Uint32Array(...)` a cada quadro); `xSteps`/`ySteps` da malha são recalculados só quando largura, altura ou espaçamento mudam; `blobViewPoints` é preparado uma vez por olho e reaproveitado por ondas, malha, rede e telemetria; `drawRawVideoWindows` não desenha o quadro-base quando `videoBlend === 0` com filtro ativo (antes eram dois `drawImage` por janela); o HUD guarda as referências `<b>` e só escreve quando percentual ou gradiente mudam; o payload de áudio não é montado com som desligado, mudo, modo “Só visual” ou sem `port.postMessage`; o gradiente da gravação é cacheado por contexto enquanto a geometria não muda. `window.__blobtrackMetrics` passou a publicar `tOverlay` e `tComposition` sem remover as chaves antigas. Nenhuma medição em aparelho físico: a validação foi `npm test` (218/218), checagem sintática, cenários headless limpos e os mesmos números de render do item anterior; não há alegação de ganho medido em FPS ou bateria. Itens do Pacote 2 seguem em aberto (compartilhar o readback de `analyze`, `texSubImage2D`, flag `dirty` da máscara) e o Pacote 3 continua dependente de medição no celular, inclusive o tamanho do halftone. `FLOYD_MAX_*` não existe mais desde a troca para halftone.
- “Ver binarizada” em 400×225: o laço de empacotamento dos pixels custou `0,182 ms/quadro` em Node; em Chromium headless com câmera fake, `putImageData` média `0,047 ms` (p95 `0,1 ms`) e o `drawImage` da máscara média `0,007 ms`. O intervalo de quadros ficou em `6,9 ms` com e sem a máscara. Não é medição em aparelho físico.
- Diagnóstico de desempenho (sem alteração de runtime): o benchmark do núcleo em três execuções deu p50 `0,722 / 0,593 / 0,747 ms`, p95 `1,502 / 1,310 / 1,333 ms` e pico `1,793 / 1,821 / 2,120 ms`, sem mexer em `blobTrackerCore.js`; uma amostra ficou acima do teto histórico de `1,347 ms`, tratada como ruído. Perfil headless: `(idle)` 1636 amostras, `(program)` 68, `getImageData` 65, `drawImage` 8. `getImageData` 400×225: p50 `2,1–2,2 ms`, p95 `4,0–4,9 ms` (até `11,9 ms` com efeitos máximos) — é o maior custo de CPU e não pode ser removido sem quebrar a ponte congelada. `texImage2D`: p50 `0 ms`, p95 `0,1 ms`. Overlay com efeitos máximos: `tComposition` `0,4 ms`, 2868 `stroke` e 495 `fillText` em 64 quadros. HUD: 229 escritas de `textContent` em 2,2 s, ~`0,03 ms/quadro`. FPS headless `28,8` com teto 30 e 0–1 quadros acima de 33 ms. Conclusão: readback é o gargalo; HUD e upload WebGL não justificam mudança.
- Correção do Pontilhado em cena escura e overlay ocioso (cache `v55`): o raio do ponto passou a ter piso `0.16` e ganho de gama `pow(l,0.65)` no shader (`uEffect==2`) e no fallback 2D, antes calculado como `mix(0.10,0.62,l*fator)`. Com câmera falsa de luma `22/255`, o quadro WebGL subiu de **5,5%** de pixels brancos e centro `[5,5,5]` para **19,7%** e centro `[253,253,253]`; no fallback 2D ficou em **15,3%**. O fácil acúmulo de `stroke` da malha virou um único `stroke`, os vértices da rede um único `fill`, e `drawMaskOverlay` passou a pular o trabalho quando nada está ativo, limpando só um quadro quando o anterior desenhou. Com câmera fake clara, os cenários local e deploy continuam com `uEffect=2` e 22–33% de branco; com Gear VR ativo a imagem fica numa faixa estreita (2,8% de branco), comportamento esperado do óculo duplo. `npm test`: 222/222. Não há medição em aparelho físico; o relato do V1su4rt foi de tela preta no celular em navegador comum, e a causa identificada foi a luma baixa.
- Pontilhado de formas (cache `v56`): o halftone de luminosidade do quadro inteiro saiu do shader (`uEffect==2`) e do fallback 2D; a base passou a ser preta limpa e os pontos são gerados dentro da máscara dos blobs, no laço de empacotamento que já existe em `drawMaskOverlay` (`DOT_CELL = 14`, `DOT_RADIUS_SQ = 0.55`). Não há novo `getImageData`, nem nova textura, nem mudança em `src/domain/blobTrackerCore.js` ou na assinatura de `src/blob-tracker.js`. O guard que desligava `drawRawVideoWindows` com `effect === 'dither'` foi removido: Janela viva, Vídeo original, Inverter vídeo e mistura voltam a compor junto com o Pontilhado. Em Chromium headless com câmera fake em `http://localhost:8000`: `#visual` com **0%** de branco e `#overlay` com pontos em **8,75%** da área (Janela viva ligada), **21,62%** (sem Janela viva) e **4,36%** (com Vídeo original desligado), nenhum erro de console. `npm test`: 222/222; `node --check` e `git diff --check` limpos. O benchmark do núcleo nesta máquina ficou com p95 `1,531 / 2,106 / 2,341 ms`, acima do teto histórico de `1,347 ms`, sem alteração no núcleo. Repetição em `25/11/2026` com a máquina em repouso: p50 `0,786 / 0,734 / 0,744 ms`, p95 `1,233 / 1,505 / 1,248 ms`, pico `1,959 / 1,921 / 1,697 ms` — p95 mediano `1,248 ms`, **dentro** do teto. Tratar a rodada alta como ruído/contenda, não regressão. CPU por quadro, FPS, bateria, gravação e aparência em aparelho físico: **não medidos**.
- Pointillism com error diffusion (cache `v57`): a imagem passou a ser renderizada como pontos pretos de tamanho variado sobre papel branco. O Pontilhado deixou de depender da máscara dos blobs: `drawStipple` reduz o quadro para no máximo `200×120`, lê a luma **uma vez** nesse mini-canvas, aplica Floyd–Steinberg com 6 níveis de raio, contraste pela média da cena e um jitter pequeno por célula, e desenha todos os pontos num único `fill()`. É um `getImageData` extra por quadro, só quando o efeito está ligado; os buffers da grade são reaproveitados. Em Chromium headless com câmera fake em `http://localhost:8000`: leitura extra p50 `1,5 ms`, p95 `4,7 ms` (segunda amostra p50 `1,4 ms`, p95 `3,7 ms`); `tComposition` `2,2 / 2,3 ms`; FPS `28,835 / 28,822` — o mesmo patamar da rodada anterior. `#visual` com 100% de branco, `#overlay` com 13,7% de pontos pretos (Janela viva ligada) e 21,2% (sem janela), raios de `3,5` a `7,5 px`, nenhum erro de console. `npm test`: 222/222; `node --check` limpo. Núcleo do tracker e ponte de câmera intactos. Depois do deploy (`a039e80`), a mesma prova no site com URL sem cache deu leitura extra p50 `1,4 ms` (p95 `8,8 / 3,9 ms`), `tComposition` `2,2–2,4 ms`, FPS `28,83`, raios de `2` a `7,5 px` e zero erros. CPU em aparelho físico, bateria, gravação e aparência real: **não medidos**.

- Pacote 2 — readback compartilhado (cache `v58`, publicado): `analyze` lê os pixels uma vez e entrega o mesmo buffer a `tracker.updatePixels` e a `drawStipple`; a textura é alocada uma vez (`texImage2D`) e atualizada com `texSubImage2D`; a binarizada só publica quando a máscara muda. Contrato congelado intacto. Em Chromium headless com câmera fake em `http://127.0.0.1:8000`: **1** `getImageData` (`400×225`) por quadro em vez de 2, **60** `texSubImage2D` e **0** `texImage2D` em 60 quadros, `putImageData` da máscara em 25 de 60 quadros. `tRender` caiu de ~`3,15 ms` para `0,97–1,31 ms` no Pointillism e de `6,59 ms` para `2,28 ms` no Gear VR; FPS `28,8`, zero erros de console. `npm test`: **226/226**. Nove execuções do benchmark do núcleo nesta máquina: p50 mediano `0,676 ms`, p95 mediano `1,340 ms`, pico mediano `1,855 ms` — p95 **dentro** do teto histórico de `1,347 ms`, sem alteração em `src/domain/blobTrackerCore.js` ou na assinatura de `src/blob-tracker.js`. Publicada em `e982772`; no site com `?cb=<timestamp>` o `sw.js` respondeu `v58`, com `#visual` 100% branco, `tRender` `0,95–1,22 ms` no Pointillism e `2,71 ms` no Gear VR, FPS `28,8` e zero erros. O readback no site apareceu em `400×225` e `480×270` conforme a qualidade automática, sempre um por quadro. CPU, bateria, câmera real, gravação e aparência em aparelho físico: **não medidos**.
- Pontilhado dentro das janelas (cache `v59`, publicado): a grade de pontos passou a ser calculada uma vez por quadro em `prepareStipple` e pintada duas vezes por `paintStipple` — palco e `clip` das janelas —, sem novo `getImageData` e sem nova difusão. Em Chromium headless com câmera fake, `dither + janela` ficou em `tRender` `1,63 ms` e `dither sem janela` em `1,00 ms`; `dither sem vídeo original` `1,47 ms`, `com inverter vídeo` `1,68 ms` e Gear VR `3,21 ms`. FPS `28,8`, `erros []`. Prova por região: janela com 100% de pixels pintados e 22,2% pretos; fora dela 20,1% pintados e pretos. Arcos por segundo: 130.934 com janela contra 64.924 sem janela; `clip` 58 contra 29 — o dobro de pintura, a mesma grade. `npm test`: **228/228**. Instrumentação manteve 1 leitura `400×225` por quadro, 0 `texImage2D` e 60 `texSubImage2D`. Publicado em `d46829b`; no site com `?cb=<timestamp>` o `sw.js` respondeu `v59`, a janela repetiu 100% de pixels pintados e 22,2% a 29,2% pretos, com ~130 mil arcos contra ~65 mil sem janela e `erros []`. Nada disso é aparelho físico.
- Vídeo original com efeito na janela (cache `v60`, publicado em `8725a69`): o botão passou a significar **ligado = efeito aplicado na janela; desligado = vídeo cru dentro do blob**. `enableEffect` vale `state.originalVideoWindows || state.videoBlend > 0`; o filtro entra nos três efeitos e o `paintStipple` dentro da janela só acontece com o botão ligado. Três otimizações seguiram, medidas uma a uma: (1) poda da grade pela união dos blobs — arcos/s caíram de ~130.118 para ~66.431 e `tRender` de `1,72 ms` para `1,19 ms`; (2) remoção dos resets manuais de `filter`/`globalAlpha` — escritas de `filter` de 58 para 29 por segundo e `tRender` para `1,11 ms`; (3) `drawImage` amostrando só o bbox dos blobs — `tRender` `0,19 ms` com Inverter e `2,69 ms` no Gear VR. Com câmera fake e blobs detectados: Inverter ligado `invert(1)` (luma `170,6`) contra sem filtro desligado (`94,8`); Preto e branco ligado 0% de cor e 82,7% de preto contra 100% de cor desligado; Pontilhado ligado ~64.436 arcos contra ~58.300 desligado (só o palco). FPS `28,8`, `erros []`, `npm test` **231/231**, `node --check` em 60 arquivos e `git diff --check` limpos. Deploy automático conferido com `?cb=<timestamp>` e `cache: 'no-store'`: `sw.js` em `blobtrack-celular-00-v60` e QA completo no site sem erros de console ou rede; nada em aparelho físico.

- Pacote 3 — pré-checagem no emulador Android (25/11/2026, **sem mudança de runtime**, site `v60` publicado): AVD `BlobTrackEmulator`, Android 10, Chrome 124, câmera virtual, viewport `160×284`, CDP via `adb forward tcp:9222 localabstract:chrome_devtools_remote`. Soak de `300,4 s` com 30 amostras a cada 10 s: FPS p50 `19,72`, p95 `20,00`, mín `17,76`, máx `20,00`; `tAnalysis` p50 `16,28 ms`, p95 `20,44 ms`, pico `21,63 ms`; `tRender` p50 `0,80 ms`, p95 `1,04 ms`, pico `1,12 ms`; blobs entre `0` e `2`; quadros em `160×284` com `15–21 fps` conforme a qualidade automática; `consoleErrors []`. Antes do soak, medições pontuais tinham `tRender` de `0,22–1,67 ms` nos três efeitos e `tAnalysis` de `18,38 ms`. O gravador ficou indisponível: o Chrome 124 só oferece WebM e a `v60` aceita só MP4 (`4cdf5cc`); o V1su4rt confirmou manter MP4-only, sem cache `v61`. **Nada disso é aparelho físico**: emulador x86 com câmera sintética não mede bateria, calor/GPU, câmera real, gravação, aparência final dos pontos nem iPhone/Safari; os números servem só para detectar travamento ou vazamento no fluxo. Matriz em [`device-matrix.md`](device-matrix.md) e detalhe em [`gravacao.md`](gravacao.md).

Não existe medição isolada “com gravação” nem “com S9” neste script. Ele não cria câmera, não compõe canvas e não grava vídeo. Não atribuir a esses recursos os tempos de `updatePixels` nem declarar ganho causal a partir de amostras em máquinas carregadas.

## Memória e caminho quente

As alterações do rastreador mantêm os arrays grandes reutilizados durante o mesmo tamanho de quadro e não adicionam alocação por pixel. ROI e grade usam buffers dimensionados em resize; calibração mantém `Float32Array` e `Uint8Array` no núcleo. A absorção S9 usa contador por trilho de blob, evitando os dois buffers de imagem completos do esboço inicial. Este documento não afirma redução medida do heap; heap e dispositivos físicos: **não medidos**.

## Escolhas não adotadas

- Threshold relativo para sombras: rampa 0→0,12 já fica abaixo do threshold global 0,18, portanto o cenário não provou redução de pelo menos 30% de máscara. Não foi adicionado um segundo caminho quente.
- Hungarian para atribuir IDs: a associação gulosa por custo preservou o teste de cruzamento acima da meta; não foi introduzida complexidade adicional.
- Anel de quadros completos, dependências de visão computacional e segundo ciclo de animação: fora de escopo e sem justificativa de medição.
- Ensaio inicial da grade adaptativa e soma completa de diferença de cena: excediam o orçamento; foram substituídos por cálculo esparso no caminho já amostrado e pela especialização do caminho sem ROI/calibração. Só a versão otimizada foi mantida.

## Como repetir

```powershell
node scripts/bench-blobtrack.js
```

Execute três vezes na mesma máquina/runtime e compare o mesmo cenário com os três limites. Se qualquer limite estourar, reverta a mudança responsável antes de continuar. Os números de computador não substituem [`device-matrix.md`](device-matrix.md).

## Kit de medição no celular (v65)

`src/core/perfProbe.js` é desativado por padrão e ativa com `?perf=1`. Não altera as chaves antigas de `__blobtrackMetrics`: acrescenta `pauseReason`, `pauseCount` e `tPorEfeito` (`null` sem `?perf=1`) e publica o relatório completo em `window.__blobtrackPerf`, com `report()`, `json()` (JSON copiável) e `reset()`. As etapas medidas são `captura`, `readback` (com `readbackDraw` e `readbackPixels` separados desde `v65`), `analise`, `estipple`, `renderWebGL`, `overlay`, `composicao`, `janelas`, `audio` e `gravacao`, com p50/p95/máx; `longTasks`/`gc` vêm de `PerformanceObserver`, a memória de `performance.memory`, e o tempo de salvar de `saveStart`/`saveEnd`. O relatório também traz `fps`, `trackingWidth`, `pauseReason`, `pauseCount`, `effectsPaused`, `cacheVersion`, perfil, resolução e DPR dos canvases.

### Primeira amostra em aparelho físico (v64, 27/11/2026)

Enviada pelo V1su4rt; cenário não declarado e `recordingState: idle`. Realme C67, perfil **`alto`**, DPR informado `2,55` com canvas limitado a `1,5` (`635×1316`), câmera `540×960`, análise já reduzida a `160×284`. `pauseReason: low-fps`, `pauseCount: 2`, `effectsPaused: true`.

| Etapa | p50 (ms) | p95 (ms) | máx (ms) |
|---|---:|---:|---:|
| captura | 1,4 | 3,0 | 9,6 |
| **readback** | **31,7** | **53,2** | **133,3** |
| analise | 2,9 | 5,41 | 34,1 |
| estipple | 0,7 | 1,6 | 5,0 |
| renderWebGL | 0,2 | 0,7 | 3,0 |
| overlay | 0,6 | 1,3 | 7,2 |
| composicao | 1,8 | 3,8 | 10,3 |
| janelas | 0,3 | 0,9 | 5,6 |
| audio | 0,1 | 0,3 | 2,9 |
| gravacao | 0,1 | 0,3 | 2,8 |
| **soma dos p50** | **39,8** | — | — |
| **soma dos p95** | — | **70,5** | — |

`longTasks`: 429 em 1200 amostras (35,75%), p50 `56 ms`, p95 `77,6 ms`, máx `243 ms`. `gc`: nenhum registrado. Memória: `9,537 MB` constante nas 1200 amostras, limite `1964,57 MB` — sem base para afirmar estabilidade em 30 min.

**Leitura:** o orçamento de 30 FPS é `33,3 ms`; o p50 medido já é `39,8 ms`. Os efeitos reativos juntos somam `3,6 ms` de p50 (`estipple 0,7 + renderWebGL 0,2 + overlay 0,6 + composicao 1,8 + janelas 0,3`), e áudio/gravação `0,2 ms` — descartados como causa principal. O `readback` responde sozinho por ~57% do p50 dos long tasks e ~69% do p95. A largura de análise já estava no mínimo `160` e mesmo assim o readback continuou em `31,7 ms`: reduzir mais a resolução da análise não é a alavanca. O gatilho foi `low-fps`, não `render-budget` (render p95 `0,7 ms` muito abaixo de `13,33 ms`). Causa **provada**: gargalo no caminho síncrono de leitura de pixels. Causa **ainda não provada**: se o custo está no `drawImage` (cópia GPU→CPU) ou no `getImageData` — é o que `readbackDraw`/`readbackPixels` vão separar na `v65`.

### Segunda amostra em aparelho físico (v65, 27/11/2026)

Também enviada pelo V1su4rt, `recordingState: idle`, perfil `alto`. `fps: 15,4`, `trackingWidth: 240`, análise `240×427`, câmera/frame `540×960`, `pauseReason: low-fps`, `pauseCount: 2`, `effectsPaused: true`.

| Etapa | p50 (ms) | p95 (ms) | máx (ms) |
|---|---:|---:|---:|
| captura | 1,3 | 2,3 | 12,4 |
| readback | 40,3 | 55,81 | 116,1 |
| **readbackDraw** | **0,1** | **0,3** | **2,2** |
| **readbackPixels** | **40,0** | **55,705** | **116,0** |
| analise | 10,1 | 14,32 | 52,2 |
| estipple | 0,8 | 1,2 | 3,7 |
| renderWebGL | 0,2 | 0,4 | 3,1 |
| overlay | 0 | 0 | 0,2 |
| composicao | 2,3 | 3,405 | 6,8 |
| janelas | 0,3 | 0,7 | 2,2 |
| audio | 0,1 | 0,2 | 1,4 |
| gravacao | 0,1 | 0,2 | 2,1 |
| **soma dos p50** | **55,5** | — | — |

`longTasks`: 1200 em 1200 quadros, p50 `59 ms`, p95 `77 ms`, máx `162 ms`. `gc`: nenhum. Memória: `9,537 MB` constante.

**Veredito:** a cópia para o canvas de análise custa `0,1 ms`; todo o custo está no `getImageData` (`40 ms` = 99% do `readback`). A soma dos p50 (`54,7 ms`) explica os `15,4 FPS` e o gatilho `low-fps`. Efeitos juntos são `3,6 ms`; áudio e gravação, `0,2 ms`. A hipótese anterior de que o `drawImage` era o gargalo está **descartada por medição**. O que ainda não está provado é se os `40 ms` vêm da sincronização GPU→CPU do `frameCanvas` — que também é textura do WebGL — ou do `getImageData` em si.

### Experimento da v66 — uma mudança, reversível

O `ctx.drawImage(source, ...)` de `analyze()` passou a ser `ctx.drawImage(video, ...)`: o tracker lê direto do vídeo no tamanho da análise, sem passar pelo `frameCanvas` que o WebGL atualiza por `texSubImage2D`. O render continua com `source` (`render.renderFrame(applied, source)`), então a imagem e os efeitos seguem o mesmo quadro capturado. Nenhum efeito, ID, áudio, gravação ou limite de resolução foi alterado.

Para aceitar: `readbackPixels` cair de forma clara e `fps` subir sem que `captura` ou `renderWebGL` subam o suficiente para compensar. Para rejeitar: `git revert` do commit `v66` e seguir para a hipótese de leitura em WebGL (`gl.readPixels` em alvo pequeno) — ainda não implementada. **A v66 não tem medição em aparelho até o V1su4rt enviar um novo JSON.**

### Fase 2 — matriz de ablação para o V1su4rt

Rode cada linha no Realme C67 com `?perf=1`. Toque em **Diagnóstico** no canto do app, **Zerar**, espere ~30 s e **Copiar** (ou **Compartilhar**) — não é preciso PC, cabo USB nem `chrome://inspect`. Anote o p95 de cada etapa. O console com `copy(__blobtrackPerf.json())` continua disponível para quem preferir.

| # | Cenário | O que mede | FPS | p95 da etapa-chave |
|---|---|---|---|---|
| 1 | Câmera + análise, todos os efeitos desligados | custo base | _não medido_ | `readback` + `analise` |
| 2 | Um efeito por vez: Pontilhado, Inverter, P&B, Janela, Vídeo original, malha, rastro, Gear VR | custo individual | _não medido_ | `estipple` / `overlay` / `composicao` |
| 3 | Todos os efeitos | custo combinado | _não medido_ | `composicao` |
| 4 | Todos + áudio reativo ligado | custo do áudio | _não medido_ | `audio` |
| 5 | Gravando sem efeitos | custo do gravador | _não medido_ | `gravacao` |
| 6 | Gravando com todos (pior caso) | soma sob gravação | _não medido_ | `gravacao` + `composicao` |
| 7 | Parar e salvar o MP4 | tempo de bloqueio da UI | _não medido_ | `salvamentoMs` |

Orçamento de referência: `33,3 ms` por quadro a 30 FPS (`24–30 FPS` é a meta declarada). Preencher esta tabela é pré-requisito para os vereditos H1–H8 e para qualquer mudança de performance: sem esses números, não há causa raiz provada nem "depois" para comparar.
