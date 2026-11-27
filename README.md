# @V1su4rt

O BlobTrack transforma movimento visto pela câmera em manchas chamadas blobs. Os centros e as trajetórias dos blobs movem efeitos visuais e instrumentos de áudio reativo. É um instrumento audiovisual para navegador móvel; não identifica pessoas nem mede profundidade.

## Como funciona

```text
1. Câmera captura um quadro
          ↓
2. Quadro vira luminância (tons de claro e escuro)
          ↓
3. Cada pixel é comparado com o fundo aprendido
          ↓
4. BFS agrupa pixels vizinhos em manchas (blobs)
          ↓
5. Associação mantém os IDs entre quadros
          ↓
6. Blobs alimentam efeitos visuais e áudio reativo
```

O processamento acontece num ciclo de quadro. Os buffers são reaproveitados; a meta principal é não criar trabalho por pixel em cada quadro. A interface inclui rede geométrica opcional que conecta centros próximos de blobs, ativada por botão.

## Como rodar

Requisitos: Node.js 20 ou mais recente para testes e Python instalado para servir arquivos localmente. Na raiz do projeto:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Abra `http://localhost:8000` no navegador e toque em **Iniciar câmera**. Os atalhos `start-local.bat` (Windows) e `start-local.sh` (macOS/Linux) fazem o mesmo e já usam a porta 8000. Permissão de câmera exige HTTPS ou `localhost`; `file://` não funciona. O app não usa microfone. A versão publicada está em `https://blobtrak.vercel.app` (cache offline `v61` publicado em `027f6c8`; este código prepara o `v62`).

Se a página local parecer desatualizada, o servidor não é o culpado: o service worker pode estar servindo arquivos antigos. Abra DevTools → Application → Service Workers → **Unregister** e recarregue (ou apenas recarregue duas vezes). Para instalar no celular, publique num endereço HTTPS; no iPhone, abra no Safari e escolha **Compartilhar → Adicionar à Tela de Início**.

```powershell
npm test
node scripts/bench-blobtrack.js
```

O benchmark isolado leva alguns segundos e deve ser repetido três vezes na mesma máquina. Para gerar uma única vez o APK Android debug:

```powershell
cd android
.\build-apk.ps1
```

O APK é copiado para `dist/BlobTrack-Celular-00-debug.apk`. É uma compilação de desenvolvimento, não destinada à Play Store. Veja requisitos e instalação USB em [`android/README.md`](android/README.md).

### Testar no Android sem celular (emulador em 1 comando)

Pense no emulador como um **celular de mentira dentro do notebook**: ele tem tela pequena, Android, Chrome e câmera virtual. Ele serve para conferir se o fluxo funciona no Android; **não** serve para dizer que o app está bom em aparelho real. Bateria, calor, GPU, sensor de câmera e iPhone continuam **não medidos**.

Na raiz do projeto, dê dois cliques em **`start-emulador.bat`** (ou rode no PowerShell):

```powershell
.\start-emulador.bat
```

Ele faz, em ordem, o que você fazia na mão:

1. Encontra o Android SDK dentro de `android/.local-build` — não precisa instalar nada globalmente.
2. Se não há emulador ligado, inicia o AVD `BlobTrackEmulator` e espera o Android terminar de carregar (leva um ou dois minutos).
3. Instala o APK de `dist/BlobTrack-Celular-00-debug.apk` com `adb install -r`.
4. Abre a porta `9222` do Chrome para você inspecionar a página como se fosse DevTools (isso é o CDP).
5. Concede câmera e áudio ao Chrome e abre `https://blobtrak.vercel.app/`.

Quando aparecer a mensagem **Pronto**, abra o Chrome do emulador, toque em **Iniciar sessão** e aceite a permissão. A câmera aparece como `Traseira principal` ou `Frontal` e o canto mostra `WebGL2 ativo` com algo como `160×284 · fps 20`.

Para conferir sem clicar em tudo, rode o QA automático (ele abre a sessão, troca os três efeitos, os oito botões e as quatro abas, reaprende o fundo e imprime um relatório em JSON):

```powershell
node scripts/qa-emulador.mjs
```

Outros comandos úteis:

```powershell
.\start-emulador.bat -Url 'https://seu-endereço-https/'   # abrir outra URL HTTPS
.\start-emulador.bat -SemApk                              # só abrir o Chrome, sem reinstalar o APK
.\start-emulador.bat -Parar                               # encerrar o emulador
```

🟢 Escrever e ajustar esses scripts é seguro: eles não tocam no app nem no cache do service worker. 🟡 Se mudar código que roda no app, aí sim vale o semáforo de sempre: suba o número em `sw.js`, rode `npm test` e escreva **não medido** no aparelho físico.

**Quando algo não sair como esperado:**

| Sintoma | O que fazer |
|---|---|
| "adb não encontrado" | Rode `cd android` e `.\build-apk.ps1` uma vez; o script prepara o SDK local. |
| "AVD não existe" | O erro lista os AVDs disponíveis; passe outro com `-Avd NOME`. |
| "BlobTrack Celular-00 já está aberto em outra aba" | Feche as abas duplicadas do app no Chrome. É o controle de aba única, não um defeito. |
| Botão **Gravar vídeo** desabilitado | Este Chrome só oferece WebM e o gravador aceita só MP4 (`4cdf5cc`); decisão confirmada, sem fallback. Veja [`docs/gravacao.md`](docs/gravacao.md). |
| `http://127.0.0.1:9222/json` não responde | Rode `.\start-emulador.bat` de novo para refazer o `adb forward`. |
| Tela preta ou Android travado | Android Studio → Device Manager → **Cold Boot Now** no AVD. |

O passo a passo completo, com os resultados medidos no emulador e o que ainda depende de celular, está em [`docs/device-matrix.md`](docs/device-matrix.md).

## Mapa do projeto

| Caminho | Para que serve |
|---|---|
| `index.html` | Estrutura e acessibilidade da interface web. |
| `src/app.js` | Liga câmera, ciclo de quadros, controles, sessão e serviços. |
| `src/blob-tracker.js` | Adaptador entre imagem da câmera e núcleo de blobs. |
| `src/domain/blobTrackerCore.js` | Núcleo puro: diferença, máscara, componentes e IDs. |
| `src/core/` | Perfil do aparelho, qualidade, ROI e funções utilitárias. |
| `src/render/` | Desenho e composição do palco. |
| `src/audio/`, `src/audio-processor.js` | Áudio reativo e processamento Web Audio. |
| `src/session/`, `src/platform/` | Exclusividade de sessão e integrações do navegador. |
| `src/recorder.js`, `src/recording-canvas.js`, `src/recording-export.js` | Captura de vídeo, composição e salvamento. |
| `src/app.css` | Aparência responsiva. |
| `sw.js`, `manifest.webmanifest`, ícones | Instalação e cache offline da PWA. Atualize o número de cache ao alterar recursos de runtime. |
| `tests/` | Testes automatizados sem câmera física. |
| `scripts/bench-blobtrack.js` | Cenário reproduzível de tempo do núcleo de rastreamento. |
| `scripts/qa-emulador.mjs` | QA funcional no Chrome do emulador via CDP, sem pacotes extras. |
| `start-local.bat`, `start-local.sh` | Atalhos para subir o servidor local na porta 8000. |
| `start-emulador.bat`, `android/start-emulador.ps1` | Um comando para ligar o AVD, instalar o APK, liberar o CDP e abrir o app. |
| `docs/` | Diagnóstico, medições, matriz física e decisões de manutenção. Comece por [`docs/INDICE.md`](docs/INDICE.md). |
| `android/` | Projeto WebView e compilação do APK debug. |
| `teste.html`, `teste.js`, `teste.css` | Ferramentas de diagnóstico manual mantidas no repositório. |

## Guia de manutenção

### Onde mudar

| Quero mudar… | Comece por… |
|---|---|
| Sensibilidade do movimento | `src/app.js` para controle/threshold e `src/domain/blobTrackerCore.js` para segmentação. |
| Quantidade máxima de blobs | `src/domain/blobTrackerCore.js` e os testes de limites. |
| Velocidade e estabilidade dos IDs | Associação de trilhos no núcleo e testes em `tests/`. |
| Cores e efeitos | `src/render/` e controles em `index.html`/`src/app.js`. |
| Perfis do aparelho e taxa de quadros | `src/core/deviceProfile.js`. |
| Gravação | `src/recorder.js`, `src/recording-canvas.js`, `src/recording-export.js` e `docs/gravacao.md`. |
| Região de interesse | `src/core/roiMask.js`, integração em `src/app.js` e `docs/diagnostico-cirurgico.md`. |
| Rede entre blobs | controle persistido em `src/app.js` e desenho em `src/render/`. |

### Manual de manutenção para quem está começando

Pense no projeto como uma **receita**: alguns ingredientes você pode trocar à vontade, outros mudam o sabor inteiro e alguns são a própria panela — se você mexer neles, a receita para de funcionar. Este guia é o seu semáforo. A regra de ouro é **mudar uma coisa pequena por vez e rodar os testes antes de seguir em frente**.

#### 🟢 Pode mexer — é seguro e os testes avisam se algo escapou

| Arquivo | O que pode alterar |
|---|---|
| `src/app.css` | Cores, espaçamento, tamanho de botão e layout. É só aparência. |
| `src/ui/i18n/*.js` | Textos que aparecem na tela. **Sempre altere os quatro idiomas juntos** (pt-BR, es, en, fr). |
| `src/render/render.js` | Cores, espessura de linha e tamanho dos pontos dos efeitos. Não mude o nome nem a ordem dos parâmetros das funções. |
| `index.html` | Rótulos dos botões, ordem dos controles e textos de acessibilidade. |
| `docs/` e `README.md` | Explicações. Não quebram o app. |

#### 🟡 Pode mexer, mas meça e teste

| Arquivo | Cuidado necessário |
|---|---|
| `src/app.js` | É o "cérebro" que liga tudo. Mude apenas o trecho do controle que você quer. Nunca altere a lista passada para `createRender({...})` sem entender para que serve cada linha. |
| `src/core/deviceProfile.js` e `src/core/qualityController.js` | Mudam quando o app pausa efeitos e qual resolução usa. Afetam FPS e bateria. |
| `src/audio/scales.js`, `src/audio/scale-router.js` | Notas e escalas. Teste o som depois. |
| `src/recorder.js`, `src/recording-canvas.js`, `src/recording-export.js` | Gravação. Teste um vídeo curto de verdade. |
| `sw.js` | **Só o número do cache pode mudar.** Se você alterou qualquer arquivo que roda no app, suba o número (ex.: `v60` → `v61`). Sem isso, o celular continua usando a versão antiga. |
| `tests/` | Se mudou um comportamento, atualize ou acrescente o teste correspondente. **Nunca apague um teste só para ele passar.** |

#### 🔴 Não mexe sem supervisionar — é contrato congelado

| Arquivo / trecho | Por que não |
|---|---|
| `src/domain/blobTrackerCore.js` | É o coração da detecção. As funções `updatePixels` e `update`, os limites de área e a lógica de IDs/zones são contratos usados por outros arquivos e pelos testes. |
| `src/blob-tracker.js` | A ponte entre a câmera e o núcleo. Mudar a assinatura quebra o ciclo de quadro inteiro. |
| Os testes de contrato congelado em `tests/` | Eles existem para impedir regressão silenciosa. Enfraquecê-los é perder o alarme. |
| `src/session/sessionLock.js` | Garante que só uma sessão use a câmera por vez. |
| Estratégia de cache do `sw.js`, `manifest.webmanifest` e ícones | Mexer neles pode impedir a instalação ou o funcionamento offline. Só o número da versão do cache é permitido. |
| `android/` | É um projeto separado de WebView. Só mexa depois de ler `android/README.md` e saber gerar o APK. |

#### Exemplo prático: ajustar o Pointillism

O Pontilhado transforma a **imagem** em pontos pretos: fundo claro fica vazio, e a pessoa ou o prédio aparecem como pontos de tamanhos diferentes. Tudo vive em `src/render/render.js`, na função `drawStipple`:

```js
const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;
const STIPPLE_SPACING = 3;
const STIPPLE_LEVELS = 6;
```

O quadro é reduzido até `200×120`, a luma é lida uma vez, e a escuridão passa por difusão de erro (Floyd–Steinberg) com **6 níveis de raio**. `STIPPLE_SPACING` define a distância entre os pontos; `STIPPLE_LEVELS` define quantos tamanhos diferentes existem. A média da cena equaliza o contraste, então quarto escuro não vira tela preta. Para pontos maiores, aumente o espaçamento; para transições mais suaves, aumente os níveis. Não mude sem medir e sem conferir no celular. Depois: suba o cache, rode os testes e veja o efeito no navegador.

#### Manual dos três efeitos — explicado para um jovem de 16 anos

Imagine o app como uma mesa de edição com **duas camadas**:

1. **Palco** (`#visual`): a imagem grande. Quem pinta é o shader (WebGL) ou o plano B em Canvas 2D.
2. **Janelas** (`#overlay`): retângulos que perseguem as pessoas/objetos detectados. É como colar pedaços do vídeo cru por cima do palco.

Os três botões só escolhem qual “filtro” entra nessa montagem. O nome interno fica em `src/app.js` (`state.effect`); os textos dos botões ficam em `index.html` e em `src/ui/i18n/*.js` — por isso **Inverter** aparece como **Invertir** em espanhol, **Invert** em inglês e **Inverser** em francês. É o mesmo efeito, só o rótulo muda.

| Botão | Nome no código | O que o olho vê | Onde mora |
|---|---|---|---|
| Inverter / Invertir | `invert` | negativo de filme **dentro das janelas** quando Vídeo original está ligado (`v60`) | `drawRawVideoWindows`, em `src/render/render.js` |
| Preto e branco | `threshold` | cinza com contraste forte **dentro das janelas** quando Vídeo original está ligado (`v60`) | a mesma função |
| Pontilhado | `dither` | papel branco com pontos pretos formando a imagem inteira **e também as janelas** (`v59`) | `drawStipple` em `src/render/render.js` + trecho `uEffect==2` do shader em `src/app.js` |

**Inverter e Preto e branco, passo a passo.** Os dois ficam juntos neste trecho de `src/render/render.js`:

```js
const effectFilter =
  state.effect === 'invert' ? 'invert(1)'
    : state.effect === 'threshold' ? 'grayscale(1) contrast(8)'
      : 'grayscale(1) contrast(2)';
```

É a mesma ideia dos filtros do Photoshop/Canva, só que escrito em código:

- `invert(1)` troca claro por escuro, como um negativo. Quer mais fraco? Teste `invert(0.8)`. Atenção: existe um pedaço antigo no shader (`uEffect==0`, com `1.0-rgb`) que **hoje não é usado** por este botão — mexer nele não muda nada na tela.
- `grayscale(1)` tira a cor; `contrast(8)` empurra o cinza para preto ou branco. Se ficar duro demais, baixe para `contrast(4)`.
- Não confunda isso com **Sensibilidade do movimento** (`state.threshold`, em `src/app.js`): aquele número mexe no **rastreio** (o que o app considera movimento), não na cor da imagem. São coisas diferentes com nomes parecidos.

**Pontilhado, passo a passo.** Lá em `src/render/render.js`, no topo do arquivo:

```js
const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;
const STIPPLE_SPACING = 3;
const STIPPLE_LEVELS = 6;
```

Pense numa caneta: `STIPPLE_SPACING` é a distância entre os pontos (mais distância = pontos maiores), `STIPPLE_LEVELS` é quantos tamanhos de ponto existem (mais níveis = transição mais suave), e `MAX_WIDTH/HEIGHT` limita o trabalho da CPU. O papel branco vem do shader (`uEffect==2`); os pontos pretos são desenhados no overlay. Se você pintar o papel de preto, os pontos pretos desaparecem — já aconteceu na `v56`.

**Regras do jogo, para os três efeitos:**

1. Mude **uma** coisa por vez e anote o valor antigo.
2. Rode `npm test` e `git diff --check`. Se falhar, pare.
3. Abra `http://localhost:8000`, clique em **Iniciar câmera** e alterne os três botões. Confira também **Janela viva** e **Inverter vídeo** — eles podem esconder o efeito.
4. Suba o número do cache em `sw.js` (de `v60` para `v61`, por exemplo). Sem isso, o celular continua vendo o efeito antigo.
5. Sem aparelho físico na mão, escreva **não medido** na sua anotação.

**Erros clássicos:**

| Sintoma | Causa provável |
|---|---|
| “Apertei Inverter e nada mudou” | Inverter e Preto e branco vivem nas janelas: sem blob detectado não há janela. Mova a mão na frente da câmera. |
| “Quero preto e branco no quadro inteiro” | Hoje o botão age só nas janelas. Mudar isso é uma reforma maior: meça antes. |
| “Mudei o código, mas no celular segue igual” | Esqueceu de subir o cache do `sw.js` ou o service worker antigo ainda está ativo (faça Unregister e recarregue duas vezes). |
| “Mudei `threshold` e o rastreio ficou maluco” | Você mexeu na sensibilidade de movimento, não no filtro de cor. Volte o valor e edite `effectFilter`. |

#### Reaproveitamento de buffers (Pacote 1)

Sem mudar a imagem, o quadro agora reaproveita o que já existe: a view `Uint32Array` da máscara, as linhas da malha (`xSteps`/`ySteps`), os pontos mapeados de cada blob (uma vez por olho), o gradiente da gravação e as referências `<b>` do HUD. As janelas de vídeo não desenham o quadro-base quando `videoBlend === 0` e há filtro, e o payload de áudio deixa de ser montado com som desligado, mudo ou sem porta. Nada disso altera o contrato congelado.

Para acompanhar o custo, `window.__blobtrackMetrics` ganhou `tOverlay` (tempo dos efeitos no canvas de overlay) e `tComposition` (tempo total de montar o overlay). As chaves antigas (`fps`, `tAnalysis`, `tRender`, `tCapture`, `blobsAtivos`, `idsNovosUltimos60s`, `recordingState`, `effectsPaused`) continuam iguais. Abra o console do navegador e rode `window.__blobtrackMetrics` para comparar.

#### Pointillism de verdade (cache v57)

Na `v56` eu tinha entendido “só as formas” como “só dentro dos retângulos dos blobs”: a base ficava preta e os pontos brancos apareciam apenas na máscara. Você esclareceu que o certo é a **imagem inteira virar pontilhismo**, como o exemplo de diffusion dither. Agora o branch `uEffect==2` do shader em `src/app.js` e o fallback em `src/render/render.js` pintam papel branco, e `drawStipple` desenha os pontos pretos no overlay com difusão de erro, raio quantizado e leve deslocamento orgânico.

**Janela viva**, **Vídeo original**, **Inverter vídeo** e a mistura continuam funcionando: as janelas são compostas **depois** dos pontos do palco. Na `v59` os pontos passaram a ser pintados também **dentro das janelas**, por cima do vídeo, reaproveitando a mesma grade — sem segundo `getImageData`. Na `v60` o botão **Vídeo original** ganhou a semântica que você pediu: **ligado = efeito na janela; desligado = vídeo cru dentro do blob**, sem pontos. O contrato congelado continua intacto.

🟡 Mexa só com medição: a leitura extra em `200×120` custou p50 `1,5 ms` e p95 `4,7 ms` em Chromium headless; `tComposition` ficou em `2,2 ms` e o FPS em `28,8` — o mesmo do estado anterior. No mesmo teste, o `#visual` ficou com **100%** de branco e os pontos no `#overlay` tinham raios entre `3,5` e `7,5 px`. Suíte atual: **231/231** (inclui Gear VR, readback compartilhado, máscara `dirty`, Pontilhado nas janelas, a semântica ligado/desligado do Vídeo original e as três otimizações da janela). Isso não é medição em aparelho físico: confirme no celular antes de falar em ganho.

#### Pacote 2 — uma leitura por quadro (cache v58)

O Pacote 2 tira o segundo `getImageData` do Pointillism. Agora `analyze` lê os pixels uma única vez em `src/app.js` e entrega esse mesmo buffer ao tracker (`tracker.updatePixels`) e a `drawStipple`; a textura WebGL é alocada uma vez com `texImage2D` e atualizada com `texSubImage2D`; a imagem binarizada só é publicada no canvas quando a máscara muda. Os arquivos congelados (`src/domain/blobTrackerCore.js` e a assinatura de `src/blob-tracker.js`) não foram alterados.

🟡 Mexa só com medição: em Chromium headless com câmera fake, o app passou a fazer **1** `getImageData` por quadro (`400×225`) em vez de 2, com 60 `texSubImage2D` e 0 `texImage2D` em 60 quadros, e `putImageData` da máscara em 25 de 60 quadros. `tRender` caiu de ~`3,15 ms` para ~`1,0 ms` no Pointillism e de `6,59 ms` para `2,28 ms` no Gear VR; FPS seguiu em `28,8`. `npm test`: **226/226**, zero erros de console. Nove rodadas do benchmark do núcleo deram p95 mediano `1,340 ms` (teto `1,347 ms`). Depois do deploy, a prova no site com `?cb=<timestamp>` confirmou `sw.js` em `v58`, `tRender` `0,95–1,22 ms` no Pointillism e `2,71 ms` no Gear VR, FPS `28,8`, `erros []` e a máscara publicada em `400×225`. O tamanho do readback acompanha a qualidade automática (`400×225` ou `480×270`), mas continua sendo **uma** leitura por quadro. Nada disso é aparelho físico: bateria, câmera real e gravação seguem **não medidos**.

#### Pontilhado dentro das janelas (cache v59, publicado)

Você pediu para os pontos também “viverem dentro das janelas dos blobs”. A solução escolhida foi **pontos por cima do vídeo cru**, reaproveitando a grade já calculada para o palco. Em `src/render/render.js`, `prepareStipple` calcula a grade uma vez por quadro e `paintStipple` desenha essa mesma grade duas vezes: uma no palco e outra dentro do `clip` de cada janela, em `drawRawVideoWindows`. `stippleReady` é zerado no começo de `drawMaskOverlay` para a janela nunca usar pontos do quadro anterior.

Resultado: o quadro inteiro continua em pointillism (sua regra de ouro) e a janela vira uma “lupa pontilhada”. Não há segundo `getImageData`, nem nova difusão de erro.

🟡 Mexa só com medição: em Chromium headless com câmera fake, a janela ficou com **100%** dos pixels pintados e **22,2%** pretos (pontos sobre o vídeo); fora dela, **20,1%** pintados e pretos. Em 1 segundo, os arcos no overlay passaram de **64.924** (sem janela) para **130.934** (com janela) e os `clip` de **29** para **58** — ou seja, a grade é pintada duas vezes, sem recalcular. `tRender` foi de `~0,87 ms` sem janela para `~1,59 ms` com janela; com Gear VR, `~3,21 ms`. FPS `28,8` e `erros []`. `npm test`: **230/230**. No site publicado, `sw.js` respondeu `blobtrack-celular-00-v59` com `?cb=<timestamp>` e `cache: 'no-store'`; a prova repetida no deploy mostrou a janela com 100% de pixels pintados e 22,2% a 29,2% pretos, arcos de ~130 mil contra ~65 mil sem janela e `erros []`. CPU, bateria, câmera real, gravação e aparência em aparelho físico: **não medidos**.

#### Vídeo original com efeito legal na janela (cache v60, publicado)

Você pediu: **com o botão ligado, os três efeitos aparecem na janela; desligado, fica só o vídeo dentro do blob, como Janela viva**. A regra em `src/render/render.js` agora é:

```js
const enableEffect = state.originalVideoWindows || state.videoBlend > 0;
const effectPart = enableEffect ? effectFilter : '';
const filter = (effectPart + invertPart).trim() || 'none';
```

E o Pontilhado dentro da janela tem o mesmo guard:

```js
if (state.effect === 'dither' && state.originalVideoWindows) {
  paintStipple(c, viewWidth, viewHeight, offsetX, mirrorX, [clipLeft, clipTop, clipRight, clipBottom]);
}
```

Em palavras de adolescente: **botão ligado = a janela ganha o efeito escolhido** (Inverter, Preto e branco ou Pontilhado com pontos por cima do vídeo). **Botão desligado = lupa limpa**, o vídeo cru entra dentro do retângulo e os pontos não são repintados ali. Inverter vídeo e a mistura continuam com prioridade quando você os aciona.

Depois de fixada a semântica, três otimizações entraram na mesma rodada, uma de cada vez:

1. **Poda dos pontos na janela:** `paintStipple` recebe a união dos retângulos dos blobs e só coloca no caminho os pontos que cruzam essa caixa. Os arcos por segundo com a janela ligada caíram de **~130 mil** para **~66 mil** — quase o mesmo valor da janela desligada (~65 mil), porque o trabalho duplicado desapareceu.
2. **Higiene de estado do canvas:** `save()`/`restore()` já devolvem `filter` e `globalAlpha`, então os resets manuais depois do `restore()` saíram. As escritas de `filter` caíram de **58** para **29 por segundo**, sem mudar a imagem.
3. **Recorte da origem pelo bbox dos blobs:** o `drawImage` agora amostra só o pedaço do quadro que os blobs ocupam, preservando espelho, `cover`/`contain` e Gear VR. No cenário Inverter ligado, `tRender` passou de `~0,24 ms` para `~0,19 ms`; no Gear VR, de `~4,54 ms` para `~2,69 ms`.

🟡 Mexa só com medição: no local com `?cb=<timestamp>` e blobs detectados, **Inverter ligado** aplicou `invert(1)` (luma ~171) e **desligado** não aplicou filtro (luma ~95). **Preto e branco ligado** aplicou `grayscale(1) contrast(8)` (0% de cor, ~83% de preto) e **desligado** ficou 100% colorido. **Pontilhado ligado** aplicou `grayscale(1) contrast(2)` e repintou só os pontos da janela (~64 mil arcos); **desligado** não aplicou filtro e ficou com ~58 mil arcos (só o palco), 100% colorido. `tRender` do Pontilhado com janela `~1,14 ms`, sem janela `~1,06 ms`, com Inverter `~0,19 ms` e Gear VR `~2,69 ms`; FPS `28,8`; `erros []`. `npm test`: **231/231**. Nada em aparelho físico.

#### Overlay ocioso e traços agrupados (cache v55)

Quando não há máscara, janela viva, rastro, efeito reativo nem grade ligados, o overlay não faz mais `clearRect`, `save`, `clip` e volta por olho a cada quadro: ele só limpa **uma vez**, se o quadro anterior tinha deixado algo desenhado. A malha passou a acumular todas as linhas num único `beginPath`/`stroke` (antes eram dezenas), e os vértices da rede num único `fill`. A imagem é a mesma; o que mudou foi o número de chamadas de desenho.

#### Rotina de segurança antes de publicar

Copie e rode nesta ordem, na raiz do projeto:

```powershell
npm test
node --check src/app.js
node --check src/render/render.js
git diff --check
git status --short
```

- `npm test`: são 231 testes sem câmera física. Se algum falhar, **pare**.
- `node --check`: confere se o JavaScript não tem erro de escrita.
- `git diff --check`: procura espaços e quebras de linha problemáticos.
- `git status --short`: mostra exatamente quais arquivos você mexeu.

Para ver o resultado na tela, inicie o servidor local com `python -m http.server 8000 --bind 127.0.0.1`, abra `http://localhost:8000`, toque em **Iniciar câmera** e teste o controle que você alterou. Se não tiver aparelho físico, escreva **não medido** na sua anotação em vez de inventar um número.

**Diagnóstico final da `v60` (conferido antes e depois do deploy):** com câmera fake em Chromium, a sessão iniciou (`Traseira principal`, `400×225 · fps 29`, 1 blob), os três efeitos trocaram de estado, os oito botões de efeito voltaram ao valor original, as quatro abas trocaram de painel, o mudo alternou, a gravação foi `idle → recording → idle`, o service worker controlou a página com o cache `blobtrack-celular-00-v60` e o app reabriu offline. Console e rede terminaram com **0 erros**. No site publicado, `sw.js` respondeu `blobtrack-celular-00-v60` com `?cb=<timestamp>` e `cache: 'no-store'`, e o mesmo QA passou sem erros. Câmera real, bateria, gravação em aparelho e aparência final continuam **não medidos**.

**Pacote 3 (25/11/2026, pré-checagem no emulador):** sem aparelho físico, rodamos a parte funcional no AVD Android `BlobTrackEmulator` com Chrome 124, câmera virtual e `WebGL2 ativo`. Sessão em `160×284 · fps 20`, três efeitos, oito toggles, quatro abas, mudo, ROI, blobs `0 → 1 → 2`, retorno do segundo plano e rotação preservaram a sessão; recarga offline reconstruiu o app com o service worker `v60`. Console e rede sem erros. **Gravação ficou desabilitada**: este Chrome só oferece WebM e o gravador da `v60` aceita somente MP4 (`4cdf5cc`) — não é defeito novo, é a limitação da decisão MP4-only (confirmada pelo V1su4rt em 25/11/2026: sem fallback WebM; naquele pedido não houve bump para `v61`); veja [`docs/gravacao.md`](docs/gravacao.md). Bateria, câmera real, calor/GPU, gravação em aparelho, toque na ROI e iPhone/Safari seguem **não medidos**; o emulador não substitui celular. Detalhes em [`docs/device-matrix.md`](docs/device-matrix.md).

#### Orçamento de gravação (cache v61)

O V1su4rt relatou travamento ao gravar e, sobretudo, ao salvar no Realme C67. Quando **Todos os efeitos** estão ligados e a gravação começa, o app agora mantém o vídeo e o efeito base nas janelas, mas corta só o trabalho repetido: o segundo pontilhado dentro das janelas e os efeitos reativos (rastro, ondas, malha, rede e telemetria). A sua lista de efeitos não é alterada e o arquivo continua **MP4 sem áudio**.

🟢 Mexer nesse orçamento em `src/render/render.js` é seguro: os testes avisam se o shell mudar. 🟡 Como é código de runtime, `sw.js` subiu para `v61`; rode `npm test`, `node --check src/app.js`, `node --check src/render/render.js`, `git diff --check` e `node scripts/bench-blobtrack.js` 3× (teto p95 ≤ `1,347 ms`) antes de publicar.

**Publicado em 27/11/2026:** os dois sites (`blobtrak.vercel.app` e `blobtraking.vercel.app`) responderam `sw.js` com `blobtrack-celular-00-v61` e HTTP 200. Antes do deploy, `npm test` passou 232/232, `node --check` e `git diff --check` ficaram limpos, e o bench deu p95 de `1,086 / 0,966 / 1,153 ms` nas 3 rodadas (teto `1,347 ms`). O ganho no Realme C67 ainda é **não medido**: o teste manual no link da Vercel é quem vai confirmar.

Para conferir no celular: abra `https://blobtrak.vercel.app/`, vá em DevTools → Application → Cache Storage e confirme que só aparece `blobtrack-celular-00-v61`. Se aparecer `v60`, desinstale o service worker (Unregister) e recarregue duas vezes. Depois ligue **Todos os efeitos** por 2 min, grave 1 min, pare e **salve** o MP4; anote se travou em algum passo.

#### Kit de medição — diagnóstico cirúrgico (cache v62)

O app ganhou um medidor **desligado por padrão**. Ele não muda nenhum efeito, nem as chaves antigas de `__blobtrackMetrics`: publica um objeto separado, `__blobtrackPerf`.

**Como usar no celular (Chrome):**

1. Abra `https://blobtrak.vercel.app/?perf=1` no Realme C67. A URL com `?perf=1` liga o medidor; sem ela, o custo é zero.
2. No computador, abra `chrome://inspect` → **Devices** → **Inspect** na aba do app.
3. Rode o cenário que quer medir (ex.: todos os efeitos por 2 min) e, no console, digite:
   ```js
   copy(__blobtrackPerf.json())
   ```
   Cole o JSON recebido na conversa. Para zerar as amostras: `__blobtrackPerf.reset()`.

O JSON traz p50 / p95 / máximo em milissegundos de cada etapa: `captura`, `readback` (`getImageData`), `analise` (rastreador), `estipple` (Pontilhado), `renderWebGL`, `overlay`, `composicao`, `janelas`, `audio`, `gravacao`. Também traz `longTasks` e `gc` (`PerformanceObserver`), `memoria` (`performance.memory`), o tempo de salvamento (`salvamentoMs`), `pauseReason`, `pauseCount`, `effectsPaused`, o perfil do aparelho e as resoluções/DPR reais dos canvases. Cada etapa ainda vira uma marca visível no flame chart via `performance.mark`/`measure`.

🟢 O medidor é somente leitura: está em `src/core/perfProbe.js`, fora do núcleo do rastreador. 🟡 A virada para `v62` é obrigatória porque `app.js`, `render.js`, `sw.js` e os testes mudaram; rode `npm test`, `node --check src/app.js`, `node --check src/render/render.js`, `git diff --check` e `node scripts/bench-blobtrack.js` 3× (teto p95 ≤ `1,347 ms`) antes de publicar. 🔴 Não altere a estratégia de cache do `sw.js`: só o número muda. A matriz de ablação (7 cenários) está em [`docs/perf-antes-depois.md`](docs/perf-antes-depois.md).

**Atenção:** o medidor ainda não tem número nenhum do Realme C67. Rodar o app com `?perf=1` é o que vai transformar "muito pesado" em milissegundos por etapa.

#### Se algo deu errado

1. Veja o que mudou com `git diff` (mostra as diferenças linha a linha).
2. Para descartar as alterações **não salvas** de um arquivo, use `git restore -- <arquivo>`. Atenção: isso apaga o que você escreveu nele desde o último commit — só use quando tiver certeza.
3. Se o problema já entrou num commit, use `git revert <hash>`: ele cria um commit novo que desfaz o anterior sem apagar histórico.
4. Peça ajuda antes de mexer na zona 🔴.

Um commit deve contar **uma** ideia. Exemplo de mensagem boa: `fix: Vídeo original aplica efeito na janela quando ligado (v60)`.

### Alterações de título e marca (manutenção manual)

O nome público exibido no app é **@V1su4rt**. Se precisar alterar o título ou a marca, atualize manualmente nos seguintes locais:

| Arquivo | O que mudar |
|---|---|
| `index.html` (linha 40) | `<strong>@V1su4rt</strong>` na barra de navegação |
| `index.html` (metas) | `<title>`, `application-name`, `apple-mobile-web-app-title`, `og:title`, `twitter:title` |
| `manifest.webmanifest` | `name` e `short_name` |
| `src/ui/i18n/*.js` | `title`, `name`, `shortName`, `motionTitle` em todos os idiomas (pt-BR, es, en, fr) |
| `src/app.css` | `content:"@V1su4rt"` no media query de telas estreitas (linha ~643) |
| `README.md` | Título principal e referências ao nome do projeto |

**Importante**: os testes de acessibilidade e i18n verificam a consistência do título entre idiomas. Rode `npm test` após qualquer alteração de marca para garantir que todos os idiomas estejam sincronizados.

### Receita segura (resumo)

O passo a passo completo está em **Manual de manutenção para quem está começando**. Em resumo: crie uma branch, mude uma coisa pequena e preserve as assinaturas públicas, rode os testes e a rotina de segurança, abra em HTTPS/localhost e valide câmera, blobs, áudio e palco (sem aparelho físico, registre **não medido**) e faça um commit pequeno com o motivo da mudança. Para mexer no núcleo, rode também `node scripts/bench-blobtrack.js` três vezes.

Não altere sem ler [`docs/diagnostico-cirurgico.md`](docs/diagnostico-cirurgico.md) e [`docs/blobtrack-benchmark.md`](docs/blobtrack-benchmark.md): assinaturas de `updatePixels` e `update`, os sete testes de contrato congelado, IDs/zones e o orçamento de desempenho. Não adicione buffers por quadro ou alocações dentro do laço de pixels sem medição e justificativa.

Se uma mudança quebrar os testes ou exceder o orçamento, desfaça o commit com `git revert <hash>`. Para retornar ao ponto de segurança registrado no repositório, consulte `git tag` e a branch de backup antes de trocar de versão.

### Problemas comuns

| Sintoma | O que verificar |
|---|---|
| Blob não aparece | Permissão de câmera, luz/contraste, threshold e se o alvo está dentro do ROI. O tamanho mínimo também é um limite intencional. |
| FPS baixo | Consulte `window.__blobtrackMetrics`, confira análise e render separadamente e reduza a resolução pelo perfil/controle antes de adicionar efeitos. O FPS real por aparelho está **não medido**. |
| Efeitos pausados | Leia o aviso no palco; a qualidade automática pode pausar efeitos quando o custo de renderização fica alto. |
| Objeto parado some | Absorção de parado é ativada na aplicação após oito quadros estáveis; mova o objeto para voltar a gerar diferença. |
| Cena mudou | Refaça o fundo pelo botão **Fundo**; a notificação não recalibra sozinha. |
| Gravação não inicia | Verifique suporte a `MediaRecorder`/`captureStream`, sessão ativa e espaço estimado. Veja [`docs/gravacao.md`](docs/gravacao.md). |

## Desempenho e limites

O orçamento comparativo do núcleo é p95 ≤ `8 ms` e ≤ `1,15 × baseline` (`1,347 ms`), além de pico ≤ `16 ms`. O benchmark mede apenas `updatePixels` em Node, 320×180, duas formas sintéticas, 30 quadros de aquecimento e 300 medidos. As últimas execuções: p95 `1,502`, `1,310` e `1,333 ms`; duas ficaram abaixo do teto e uma acima, sem mudança no núcleo — trate como ruído da máquina e repita antes de falar em regressão. Isso não prevê câmera, bateria nem FPS num celular. A contagem atual é 222 testes aprovados.

O limite mínimo de área é `minAreaRatio=0,00025` (piso de 6 pixels), e o máximo é `maxAreaRatio=0,72`; no quadro 320×180, o arredondamento observado requer cerca de 14 pixels. Para ajudar, enquadre o objeto maior ou reduza o zoom/distância conforme o caso, ou desenhe ROI. A gravação é sem áudio e para em cinco minutos. O suporte a câmera, segundo plano e exportação varia por navegador. Dispositivos físicos: **não medidos**.

## Documentação

- [Diagnóstico cirúrgico e prioridades](docs/diagnostico-cirurgico.md)
- [Benchmark e baseline](docs/blobtrack-benchmark.md)
- [Medições antes/depois e decisões rejeitadas](docs/perf-antes-depois.md)
- [Matriz de validação física](docs/device-matrix.md)
- [Comportamento da gravação](docs/gravacao.md)
- [Inventário do projeto](docs/faxina-inventario.md)
- [Navegação e interface](docs/ui/navegacao.md)
- [Acessibilidade](docs/ui/acessibilidade.md)

HTTPS foi informado como verificado manualmente. As correções locais só chegam ao endereço publicado quando forem enviadas ao repositório remoto e implantadas.
