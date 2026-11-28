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

Abra `http://localhost:8000` no navegador e toque em **Iniciar câmera**. Os atalhos `start-local.bat` (Windows) e `start-local.sh` (macOS/Linux) fazem o mesmo e já usam a porta 8000. Permissão de câmera exige HTTPS ou `localhost`; `file://` não funciona. O app não usa microfone. **Link oficial: `https://blobtrak.vercel.app/`.** Cache offline `v92`; o painel no celular entrou em `v64`, o kit começou em `v62` e o P0 anterior foi `v61`. Não use espelhos nem sufixos de prova (`?v=...final`); `(perf removido no v94)` continua servindo só para medir, quando você pedir.

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

Pense no projeto como uma **receita**: alguns ingredientes você pode trocar à vontade, outros mudam o sabor inteiro e alguns são a própria panela — se você mexer neles, a receita para de funcionar. Este guia é o seu semáforo.

**Regra de ouro:** *mude uma coisa pequena por vez, prove antes de seguir e anote honestamente o que mediu.* Em linguagem de todo dia: não mexa em cinco temperos de uma vez, porque se o prato ficar ruim você não sabe qual culpado. Troque um, rode os testes, olhe o resultado, só então troque o próximo. Se não tem o celular na mão, escreva **não medido** — nunca invente um número de FPS.

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
| `src/core/deviceProfile.js` e `src/core/qualityController.js` | Definem a resolução e o custo de rastreio. Desde a `v69`, nunca pausam efeitos — só ajustam a largura. Afetam FPS e bateria. |
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

#### Como manter o app rápido — regra de ouro na prática

O desempenho é como o espaço de uma cozinha pequena: se você deixar tudo espalhado em cima da bancada, cozinhar fica devagar mesmo com um fogão bom. O app repete a mesma operação dezenas de vezes por segundo, então **trabalho repetido dentro do quadro é o inimigo**.

Siga esta ordem sempre que mexer em código que roda no aparelho:

1. **Escolha uma coisa só.** Anote o valor antigo em algum lugar. Exemplo: mudar `STIPPLE_SPACING` de `2` para `3`.
2. **Consulte o semáforo.** 🟢 pode mexer; 🟡 meça e teste; 🔴 pare e peça ajuda. As tabelas acima dizem onde cada arquivo entra.
3. **Troque a etiqueta da garrafa.** Se você mexeu em algo que o celular executa, suba o número do cache em `sw.js` e o `cacheVersion` em `src/app.js`. Sem isso, o aparelho continua pegando a garrafa velha do armário — parece que sua mudança “não funcionou”, mas só não foi servida.
4. **Rode a prova do forno.** Copie e cole na raiz do projeto:

```powershell
npm test
node --check src/app.js
node --check src/render/render.js
node --check sw.js
git diff --check
node scripts/bench-blobtrack.js
node scripts/bench-blobtrack.js
node scripts/bench-blobtrack.js
```

Regra simples: **`npm test` tem que passar inteiro**, `node --check` e `git diff --check` não podem reclamar, e o p95 das três rodadas do bench tem que ficar em ou abaixo de `1,347 ms`. Se uma rodada passar do teto, repita antes de falar em regressão — a máquina tem ruído. O bench mede só o núcleo em Node; não é FPS de celular.

5. **Olhe com os olhos.** Abra `http://localhost:8000`, clique em **Iniciar câmera** e teste exatamente o controle que você mexeu. No Pontilhado, confirme `estipple.n > 0`; com Guias + Distâncias juntos, confira se os números não se encostam; no Recorte, confira se o véu não aparece no MP4.
6. **Escreva a verdade.** Com câmera real, use `(perf removido no v94)` (nunca `&gl=1`) e confira `sondaGl: false` e `glReadback.n: 0`. Sem o aparelho, registre **não medido**. FPS, latência, toque e som só viram afirmação depois de medidos no Realme C67.

**Hábitos que mantêm o quadro leve:**

- Não crie array, gradiente, texto ou leitura de imagem **dentro** do laço de cada quadro. Reutilize o que já existe — o render já guarda gradientes e tabelas para isso.
- Uma leitura da imagem por quadro, nunca duas. O `analyze()` já compartilha o `getImageData` com o rastreador desde o Pacote 2.
- A resolução do rastreio (`trackingWidth`) é o principal botão de desempenho. Prefira baixá-la a desligar efeitos para “maquiar” FPS.
- Os efeitos reativos só são podados no orçamento de gravação com **Todos os efeitos** ligados. Fora dali, desligar efeito para esconder lentidão muda a obra — não é manutenção.
- Se uma mudança deixou o bench pior, desfaça aquela única mudança (`git restore -- <arquivo>`) e tente outro caminho. Não acumule “só mais um ajuste” em cima de uma regressão.
- Um commit conta **uma** ideia. Mensagem boa: `fix: Guias e distâncias se acomodam sem sobrepor rótulos (v89)`.

#### Exemplo prático: ajustar o Pointillism

O Pontilhado transforma a **imagem** em pontos: fundo claro fica vazio, e a pessoa ou o prédio aparecem como pontos de tamanhos diferentes. Desde a `v77` o vídeo não entra na composição: fora dos blobs fica **fundo preto**, e dentro deles o papel (branco, ou preto no negativo) recebe os pontos. Isso é o que o MP4 grava. Tudo vive em `src/render/render.js`, na função `drawStipple`:

```js
const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;
const STIPPLE_SPACING = 2;
const STIPPLE_LEVELS = 24;
const STIPPLE_RADIUS_GAMMA = .68;
const STIPPLE_GRAIN_RATIO = .2;
```

O quadro é reduzido até `200×120`, a luma é lida uma vez, e a escuridão passa por difusão de erro (Floyd–Steinberg) com **24 níveis de tom**. `STIPPLE_SPACING` é a distância entre os pontos: **menor = mais detalhe**. `STIPPLE_LEVELS` define quantos degraus existem entre o pó e o ponto cheio. Desde a `v85` o raio vem de uma tabela com potência `.68` (mais volume entre grão e massa), cada célula ganha um grão fino e a referência de contraste mistura `65%` da média da cena com `35%` da média dos 5 vizinhos. Na `v90`, os níveis subiram de 12 para 24 para suavizar o degradê entre pontos, e o recorte passou a ser **por blob** (cada retângulo de blob), não pela união grande — assim o vão entre dois blobs não ganha papel nem pontos. Para pontos menores, diminua o espaçamento; para transições mais suaves, aumente os níveis. Não mude sem medir e sem conferir no celular. Depois: suba o cache, rode os testes e veja o efeito no navegador.

#### Manual dos três efeitos — explicado para um jovem de 16 anos

Imagine o app como uma mesa de edição com **duas camadas**:

1. **Palco** (`#visual`): a imagem grande. Quem pinta é o shader (WebGL) ou o plano B em Canvas 2D.
2. **Janelas** (`#overlay`): retângulos que perseguem as pessoas/objetos detectados. É como colar pedaços do vídeo cru por cima do palco.

Os três botões só escolhem qual “filtro” entra nessa montagem. O nome interno fica em `src/app.js` (`state.effect`); os textos dos botões ficam em `index.html` e em `src/ui/i18n/*.js` — por isso **Inverter** aparece como **Invertir** em espanhol, **Invert** em inglês e **Inverser** em francês. É o mesmo efeito, só o rótulo muda.

| Botão | Nome no código | O que o olho vê | Onde mora |
|---|---|---|---|
| Inverter / Invertir | `invert` | negativo de filme no **quadro todo** e também nas janelas (`v72`) | ramo `uEffect==0` do shader + fallback em `src/render/render.js` |
| Preto e branco | `threshold` | cinza com transição suave no **quadro todo** e nas janelas (`v72`/`v73`) | ramo `uEffect==1` do shader + fallback em `src/render/render.js` |
| Pontilhado | `dither` | fundo preto fora dos blobs; dentro de cada blob, pontos formando a imagem — o próprio vídeo gravado (`v77`/`v90`) | `drawStipple` + `blobsClipRect` em `src/render/render.js` + trecho `uEffect==2` do shader em `src/app.js` |

**Inverter e Preto e branco, passo a passo.** Antes da `v72` os dois viviam só nas janelas. Hoje o botão escolhe um número que o shader entende; o fallback 2D usa o mesmo número:

```js
state.effect === 'invert' ? 0 : state.effect === 'threshold' ? 1 : state.effect === 'dither' ? 2 : 3
```

É como trocar o filtro de uma lanterna: o número 0 inverte o quadro inteiro, o 1 pinta em cinza, o 2 prepara o fundo preto do Pontilhado (os pontos vivem no overlay) e o 3 deixa a imagem crua. No fallback (sem WebGL), os mesmos efeitos viram `invert(1)` e `grayscale(1) contrast(4)`.

- `invert(1)` troca claro por escuro, como um negativo de filme.
- `grayscale(1)` tira a cor; o `smoothstep` estreito do shader (`e=0.06`) faz a passagem de preto para branco sem o "corte seco" de antes. No fallback, `contrast(4)` chega perto do mesmo resultado.
- Não confunda isso com **Sensibilidade do movimento** (`state.threshold`, em `src/app.js`): aquele número mexe no **rastreio** (o que o app considera movimento), não na cor da imagem. São coisas diferentes com nomes parecidos; os dois efeitos não o alteram.

**Pontilhado, passo a passo.** Lá em `src/render/render.js`, no topo do arquivo:

```js
const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;
const STIPPLE_SPACING = 2;
const STIPPLE_LEVELS = 24;
const STIPPLE_RADIUS_GAMMA = .68;
const STIPPLE_GRAIN_RATIO = .2;
```

Pense numa caneta: `STIPPLE_SPACING` é a distância entre os pontos (**menos distância = mais detalhe e ponto menor**), `STIPPLE_LEVELS` é quantos tamanhos de ponto existem (mais níveis = transição mais suave), e `MAX_WIDTH/HEIGHT` limita o trabalho da CPU. Desde a `v85`, o ponto grande vem da potência `.68` e o grão fino aparece até nos claros — é o volume da imagem. Desde a `v74`, onde o tom muda depressa (borda), o ponto fica mais perto do centro da célula — é como segurar a caneta com mais firmeza para desenhar o contorno. Na `v90`, `STIPPLE_LEVELS` subiu para `24` (degradê mais suave entre claro e escuro) e `blobsClipRect`/`paintStipple` passaram a recortar **por blob** — o vão entre dois blobs fica preto, sem papel nem pontos. Na `v77`, o shader (`uEffect==2`) e o fallback pintam o **fundo preto**; **Inverter vídeo** vira a polaridade do Pontilhado: ligado = pontos brancos em papel preto; desligado = pontos pretos em papel branco. Fora dos blobs não entra vídeo, nem no palco, nem no MP4. Se você pintar papel e pontos da mesma cor, os pontos desaparecem — já aconteceu na `v56`.

**Regras do jogo, para os três efeitos:**

1. Mude **uma** coisa por vez e anote o valor antigo.
2. Rode `npm test` e `git diff --check`. Se falhar, pare.
3. Abra `http://localhost:8000`, clique em **Iniciar câmera** e alterne os três botões. No Pontilhado, confira que os pontos aparecem só nos blobs, que o resto fica preto e que **Inverter vídeo** troca para negativo. *Janela viva* não acrescenta vídeo quando o Pontilhado está ligado.
4. Suba o número do cache em `sw.js` (de `v60` para `v61`, por exemplo). Sem isso, o celular continua vendo o efeito antigo.
5. Sem aparelho físico na mão, escreva **não medido** na sua anotação.

**Erros clássicos:**

| Sintoma | Causa provável |
|---|---|
| “Apertei Inverter e nada mudou” | Confira se o efeito escolhido é Inverter e se o palco está com a câmera ligada. Desde a `v72` o quadro todo muda, sem precisar de blob. |
| “Quero preto e branco no quadro inteiro” | Já funciona desde a `v72`; na `v73` a passagem ficou suave. Se o app mostrar versão antiga, destrave o cache (janela anônima). |
| “Mudei o código, mas no celular segue igual” | Esqueceu de subir o cache do `sw.js` ou o service worker antigo ainda está ativo (faça Unregister e recarregue duas vezes). |
| “Mudei `threshold` e o rastreio ficou maluco” | Você mexeu na sensibilidade de movimento, não no filtro de cor. Volte o valor e edite `effectFilter`. |

#### Piano do Tom Base no palco (cache v75)

Pense num teclado de piano colado na borda de baixo do palco: quando você entra em **tela cheia** ou no **modo palco**, ele aparece e você troca a nota sem abrir os ajustes. É o mesmo teclado do painel de Som, só que em outro lugar — os dois usam `data-audio-key` e a função `syncAudioKey()`, então a tecla acesa é sempre a mesma nos dois.

- Onde mora: `#stageKeyboard` em `index.html`, estilo `.stage-keyboard` em `src/app.css`. Fica acima da barra de ações e respeita `safe-area` (não some atrás da barra do Android).
- Como aparece: o app liga a classe `fullscreen-active` no `body` quando entra em tela cheia (evento `fullscreenchange`, com também `webkitfullscreenchange` para Android/PWA). O css mostra o piano em `body.focus-mode`, `body.fullscreen-active` e, como reforço, `html:fullscreen`. Isso corrige a `v75`, que dependia só de `:fullscreen` e não aparecia no aparelho do V1su4rt. No Gear VR ele fica escondido para não atrapalhar a imagem lado a lado.
- Idiomas: o rótulo **Tom base** e as oito notas já existem em `pt-BR`, `es`, `en` e `fr`; o texto é traduzido automaticamente. Não criamos chave nova.
- Regra de ouro: o piano **não** mexe no rastreio, na gravação nem nos efeitos. Ele só troca `state.audioKey`, exatamente como o seletor antigo.

Para conferir: abra o palco, toque em **Palco** (ou em **Tela**), toque em `G`/`A`/`B♭` e veja a tecla acesa no piano e no painel. Se o celular mostrar versão antiga, abra em janela anônima — o cache costuma grudar nesse app.

#### Reaproveitamento de buffers (Pacote 1)

Sem mudar a imagem, o quadro agora reaproveita o que já existe: a view `Uint32Array` da máscara, as linhas da malha (`xSteps`/`ySteps`), os pontos mapeados de cada blob (uma vez por olho), o gradiente da gravação e as referências `<b>` do HUD. As janelas de vídeo não desenham o quadro-base quando `videoBlend === 0` e há filtro, e o payload de áudio deixa de ser montado com som desligado, mudo ou sem porta. Nada disso altera o contrato congelado.

Para acompanhar o custo, `window.__blobtrackMetrics` ganhou `tOverlay` (tempo dos efeitos no canvas de overlay) e `tComposition` (tempo total de montar o overlay). As chaves antigas (`fps`, `tAnalysis`, `tRender`, `tCapture`, `blobsAtivos`, `idsNovosUltimos60s`, `recordingState`, `effectsPaused`) continuam iguais. Abra o console do navegador e rode `window.__blobtrackMetrics` para comparar.

#### O app virou instrumento: topo = Hi, meio = Mid, baixo = Low (cache v78)

Pense num teclado de três andares colado na imagem. Antes, o som vinha de uma grade de 3 colunas × 2 linhas e as notas eram escolhidas pela posição horizontal (`x`); o `y` (altura) chegava ao áudio mas não era usado. Agora a **altura manda na frequência**:

- **Topo da tela** (`y < 0,34`) → **Hi**, por volta de `523–659 Hz` com o Tom base no dó;
- **Meio** (`0,34` a `0,66`) → **Mid**, por volta de `196–262 Hz`;
- **Baixo** (`y > 0,66`) → **Low**, por volta de `65–78 Hz`.

São três pares de vozes: `0/1 = Low`, `2/3 = Mid`, `4/5 = Hi`. Dentro de cada faixa, a posição horizontal (`x`) escolhe entre as duas notas e o panorama (esquerda/direita); a velocidade do blob dá o volume e a área dá o decaimento. O **Tom base transpõe as três faixas juntas** — mudar a tecla sobe ou desce o instrumento inteiro, não escolhe uma faixa. Uma faixa de histerese de `0,035` impede que um blob parado sobre a linha divisória fique pulando de Hi para Mid a cada quadro. Blob parado não vira drone.

Na sincronia (P0), o pacote de som sai **no mesmo quadro** em que a imagem é analisada, em vez de esperar um `requestAnimationFrame` extra, e carrega `capturedAt` e `audioTime` (relógio do `AudioContext`). O worklet usa esse relógio para alinhar o agendamento e expõe a idade do sinal como `lag` no medidor. Os controles de sliders e do Tom base mantêm o debounce de `80 ms` — só o canal de sinal é liberado na hora.

🟢 Pode mexer: os arquivos são `src/audio-processor.js`, `src/audio/audio.js` e a montagem do payload em `src/app.js`; o rastreador, a assinatura de `src/blob-tracker.js`, a reatividade e a estratégia de cache do `sw.js` continuam intactos. 🟡 Meça e teste: rode `npm test`, `node --check` nos arquivos de runtime, `git diff --check` e o bench 3× (teto p95 ≤ `1,347 ms`). 🔴 Contrato congelado: `baseFrequency` e a suíte de ritmo antiga continuam iguais; o modo de faixas é uma camada separada, ligada pelo app. Nada de latência foi medido no Realme C67 — `lag` no celular e a preferência por faixa ainda precisam de validação no aparelho.

#### BlobTrack cirúrgico: silhueta, absorção, ROI, suavização e IDs (cache v93)

Rodada cirúrgica no rastreamento e nos efeitos dos blobs, sem mexer nos contratos congelados.

- **Silhueta real nas janelas (P1):** Janela viva, Inverter e Preto e branco agora usam o mesmo recorte por máscara real (`destination-in`) que o Pontilhado ganhou no v91. Pense em recortar no contorno do blob, não no retângulo ao redor. A poda rápida por retângulo continua antes, só para economizar trabalho.
- **Absorção estacionária por componente (P2):** quando um blob parado é absorvido pelo fundo, o núcleo apaga só os pixels conectados daquele componente, não o retângulo inteiro. Isso evita “buraco” em blob vizinho que cruzava o bbox.
- **Cache de ROI (P4):** com Recorte ativo, a contagem de pixels da máscara de ROI e das zonas passa a ser reaproveitada quando a ROI não muda.
- **Suavização de apresentação (P3):** a posição/tamanho exibidos recebem EMA leve por id (`tau=0.06s`) só no render/HUD. Os sinais de áudio e a reatividade continuam usando os blobs crus, sem atraso extra no som.
- **Associação ótima (P6):** a associação blob↔trilha passou de greedy global para Hungarian nas trilhas elegíveis, mantendo o gate, o custo e os contratos S3.
- **Estacionaridade normalizada (P8):** deslocamento medido em pixels reais (`hypot(dx*width, dy*height)`), com histerese leve; `>=1 px/quadro` reinicia a contagem (S9).
- **P5 (feather):** testado e removido por risco de halo/vazamento; máscara dura mantida.
- **Hotfix v93:** corrigido travamento total no celular causado por degeneração do Hungarian quando trilhas elegíveis não tinham blob no gate; filtro de trilhas viáveis + guarda segura.

**Contratos preservados:** núcleo puro, `minAreaRatio=0.00025` (piso 6 px), `maxAreaRatio=0.72`, S3, S9, reatividade intocável, Pontilhado = pontos pretos formando a imagem.

🟢 Pode mexer: `src/domain/blobTrackerCore.js`, `src/render/render.js`, `src/app.js`, testes e docs. 🟡 Meça e teste: `npm test`, `node --check` no runtime alterado, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`. **Medido no aparelho: nada.** No Realme C67, conferir vazamento visual em Janela viva/Inverter/P&B, jitter, troca de ID, FPS e MP4; no Pontilhado confirmar `estipple.n > 0`. 🔴 Contrato congelado: S3, S9, rastreador puro, reatividade, composição do MP4 e estratégia do `sw.js` (só o número muda).

#### Pontilhado recortado pela máscara real do blob (cache v91)

O v90 tirou o vão entre blobs, mas o recorte ainda era por **retângulo** de cada blob. Nos cantos do retângulo, fora da silhueta real, o papel/pontos podiam vazar. Agora o Pontilhado é recortado pela **máscara real** dos blobs (`result.mask`): depois de desenhar os pontos, o render aplica `destination-in` com a máscara na mesma transformação (espelho/crop/Gear VR). O que está fora da forma do blob fica transparente.

**O que mudou, em linguagem simples:** antes era como colar um adesivo quadrado em volta da pessoa; agora é como recortar no contorno dela.

**Não muda:** rastreador, reatividade, composição do MP4, Gear VR, Inverter como negativo, difusão Floyd–Steinberg, 24 níveis, grão, potência `.68` e a regra de que o Pontilhado não vira pontos só na máscara.

🟢 Pode mexer: `src/render/render.js`, as travas em `tests/` e o número do cache. 🟡 Meça e teste: `npm test` **280/280**, `node --check` limpo no runtime alterado, `git diff --check` limpo e bench 3× com p95 `1,276 / 1,275 / 1,270 ms` (teto `1,347 ms`; uma rodada inicial deu `3,715 ms` por ruído da máquina e foi repetida). **Medido no aparelho: nada.** A conferência no Realme C67 segue pendente: escolha **Pontilhado**, confirme `estipple.n > 0`, veja se não há vazamento nos cantos/contorno dos blobs, salve um MP4 e. 🔴 Contrato congelado: pointillism continua sendo pontos pretos formando a imagem; rastreador, reatividade, gravação e estratégia do `sw.js` (só o número muda) continuam iguais.

#### Pontilhado com degradê suave e recorte só nos blobs (cache v90)

Dois ajustes pedidos pelo V1su4rt no Pontilhado:

- **Degradê entre os pontos (mais níveis de cinza):** `STIPPLE_LEVELS` subiu de `12` para `24`. Pense numa escada: antes eram 12 degraus entre o claro e o escuro; agora são 24. A passagem de tom fica mais suave, mas a imagem continua sendo feita por **pontos pretos formando a imagem** — não vira foto lisa nem máscara.
- **Efeito só nos blobs:** antes, o Pontilhado recortava pela **união** de todos os blobs (um retângulo grande cobrindo todo mundo). Se dois blobs estavam separados, o vão entre eles também recebia papel e pontos. Agora `blobsClipRect` devolve um retângulo por blob e `paintStipple` recorta/poda por blob: o vão entre blobs fica preto, sem papel e sem pontos. O MP4 e o Gear VR usam o mesmo caminho de desenho.

**Não muda:** o rastreador, a reatividade, a composição do MP4, a estratégia de cache do `sw.js` (só o número muda), o Inverter como negativo, a difusão Floyd–Steinberg, o grão, a potência `.68` e a regra de que o Pontilhado não vira pontos só na máscara.

🟢 Pode mexer: `src/render/render.js`, as travas em `tests/` e o número do cache. 🟡 Meça e teste: `npm test` **280/280**, `node --check` limpo no runtime alterado, `git diff --check` limpo e bench 3× com p95 `1,271 / 1,218 / 1,195 ms` (teto `1,347 ms`). **Medido no aparelho: nada.** A conferência no Realme C67 segue pendente: escolha **Pontilhado**, confirme `estipple.n > 0`, veja se o degradê ficou mais suave e se o vão entre dois blobs separados fica preto, salve um MP4 e. 🔴 Contrato congelado: pointillism continua sendo pontos pretos formando a imagem; rastreador, reatividade, gravação e estratégia do `sw.js` (só o número muda) continuam iguais.

#### Guias e Distâncias em cantos opostos (cache v89)

Quando você liga **Guias** e **Distâncias** ao mesmo tempo, os números pequenos deixam de competir pelo mesmo lugar. Pense em dois adesivos numa janela: o `123px` continua colado à linha entre dois blobs, e os `01 87%` das seis zonas vão para o canto oposto (inferior direito de cada caixa). O `B12` de cada blob também procura um canto livre. Se ainda assim dois textos se encostarem, o app mede a caixinha de cada um e tenta até quatro posições antes de desistir — é a acomodação automática. Com um efeito só, o desenho continua exatamente como antes.

Isso muda só a pintura no canvas de overlay. O rastreio, o som, o Pontilhado e o Recorte não são tocados. Os números **continuam entrando no MP4** (só o véu do recorte fica fora), e no Gear VR a regra vale para cada olho da imagem lado a lado.

🟢 Pode mexer: `src/render/render.js` e as travas em `tests/`; `index.html`, `src/app.css`, o áudio e o rastreador ficam intactos. 🟡 Meça e teste: `npm test` **279/279**, `node --check`, `git diff --check` e bench 3× com p95 `1,214 / 1,148 / 0,929 ms` (teto `1,347 ms`). **Medido no aparelho: nada.** A conferência no Realme C67 segue pendente: ligue Guias e Distâncias juntos, veja se os textos não se encostam, repita no Gear VR e salve um MP4 —. 🔴 Contrato congelado: o comportamento com um efeito só, a composição do MP4, o rastreador, a reatividade, o Ritmo, os efeitos de áudio e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Recorte com véu, cantos arrastáveis e número no painel (cache v88)

Pense numa moldura de papelão sobre a mesa: a área dentro do retângulo continua visível, e o resto do palco fica encoberto por um véu escuro. Isso ajuda a enxergar **onde** o rastreio está olhando — o retângulo sempre esteve ativo, mas antes era sutil demais para perceber. O véu é um desenho à parte, colocado sobre o palco como um adesivo: ele **não entra** no PNG nem no MP4, que continuam gravando só a imagem processada e o overlay. O botão **Ver recorte** liga/desliga esse adesivo e a escolha fica salva nas preferências.

Agora dá para ajustar a moldura com o dedo: arraste um dos quatro cantos para enlargar ou encolher a área. A caixa nunca vira linha nem sai da tela. O botão **Limpar retângulos** apaga todos de uma vez e desliga o modo de desenho. No painel de medições, a linha **Recorte · rastreio** mostra o quanto da imagem está dentro da área e quantos blobs caíram nela (por exemplo `32% · 4/7 blobs`); o primeiro número é a cobertura do recorte e o segundo é a contagem de blobs reconhecidos dentro dele.

🟢 Pode mexer: `index.html`, `src/app.css`, `src/core/roiMask.js`, `src/render/render.js`, `src/app.js`, os quatro idiomas em `src/ui/i18n/` e as travas em `tests/`. 🟡 Meça e teste: `npm test` **275/275**, `node --check`, `git diff --check` e bench 3× com p95 `1,144 / 1,170 / 1,167 ms` (teto `1,347 ms`). **Medido no aparelho: nada.** A conferência no Realme C67 segue pendente: ligue o véu, arraste os quatro cantos, limpe os retângulos, confira o número no painel, salve um MP4 e confirme que o véu não aparece no arquivo —. 🔴 Contrato congelado: `manualRects` continuam sem persistência (só o botão do véu é salvo), o rastreador, a reatividade, o Pontilhado, o Ritmo, os efeitos de áudio, a composição do MP4 e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Eco, Espaço e Chorus com sala, largura e troca limpa (cache v87)

Pense em três controles de som. O **Eco** é a voz voltando depois de um instante — continua igual, com a mesma distância de `240 ms`. O **Espaço** agora é o tamanho da sala: em vez de três toques grudados em `29/41/53 ms`, chegam três reflexos espaçados em `72/113/167 ms`, cada vez mais fracos, e o nível da sala sobe e desce com o movimento do blob. Com a gota do Ritmo ligada, antes quase não dava para ouvir a sala; agora o som fica audível por bem mais tempo. O **Chorus** virou estéreo: o lado direito lê o som com um atraso diferente do esquerdo e o vaivém ficou mais lento e largo (`0,6 Hz`), como duas vozes cantando juntas em vez de uma cópia.

A troca dos botões também ficou suave: cada efeito sobe em cerca de `40 ms` e desce em `80 ms` (sem estalo) e o volume é normalizado quando os três ligam juntos, para não estourar. O Espaço não realimenta mais o buffer do Eco — é um quarto, não um segundo eco. Com os três desligados, o worklet nem lê nem escreve os buffers: é trabalho morto cortado.

🟢 Pode mexer: `src/audio-processor.js` (mistura dos efeitos), as travas em `tests/` e a documentação. 🟡 Meça e teste: `npm test` **272/272**, `node --check`, `git diff --check` e bench 3× com p95 `1,086 / 1,287 / 1,142 ms` (teto `1,347 ms`). Medição em **Node**, não no aparelho: com a gota, o Espaço passou de `56,6%` para `86,7%` de áudio audível; no tom contínuo, o pico subiu de `0,290` para `0,316`. O Chorus passou de diferença `0` entre os canais para `0,02857`; o fade aparece já no primeiro bloco (`0 → 0,0645`) e os buffers ficam parados com os efeitos desligados. **Medido no aparelho: nada.** A conferência no Realme C67 continua pendente: ligue um efeito por vez e depois os três juntos,. 🔴 Contrato congelado: o Ritmo e a gota, `baseFrequency`, o rastreador, a reatividade, o Pontilhado e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Ritmo BlobTrack separado do tom contínuo (cache v86)

Pense numa torneira pingando do lado de um rádio ligado. Antes, ao abrir a torneira (Ritmo ligado), o rádio (tom contínuo das faixas) continuava tocando junto — o ouvido ouvia as duas coisas e parecia que o ritmo estava misturado. Agora são dois estados bem distintos:

- **Ritmo ligado:** só a gota d’água, gerada pelo movimento do blob. As seis vozes contínuas ficam mudas, então entre uma gota e outra há silêncio de verdade.
- **Ritmo desligado:** a gota é cortada e fica só o tom contínuo das faixas, seguindo os blobs.

A troca também ficou limpa: ao apertar o botão, o rastro do modo anterior é apagado (delay, chorus e o nível das vozes). Sem isso, o tom demorava cerca de `110 ms` a sumir e o efeito de eco devolvia o som por mais `320 ms`, colando a rádio na torneira. As dicas dos quatro idiomas agora dizem isso no próprio botão.

O relógio do ritmo não mudou: a gota continua nascendo do movimento do blob, sem pausa sorteada, na mesma faixa (Hi/Mid/Low) e com o mesmo ataque de gota d’água.

🟢 Pode mexer: `src/audio-processor.js` (gate das faixas e limpeza na troca), as dicas em `src/ui/i18n/` e as travas em `tests/`. 🟡 Meça e teste: `npm test` **268/268**, `node --check`, `git diff --check` e bench 3× com p95 `1,181 / 0,979 / 1,085 ms` (teto `1,347 ms`). Medição em **Node**, não no aparelho: com blob em movimento, o Ritmo ligado teve pico `0,358` e som audível em `55,8%` do tempo; desligado, pico `0,290` e `99,6%` — ou seja, gota com silêncio entre elas contra tom contínuo. **Medido no aparelho: nada.** A conferência no Realme C67 ainda pendente: alterne o botão **Ritmo BlobTrack** e escute a troca. 🔴 Contrato congelado: o modo legado fora das faixas, `baseFrequency`, o rastreador, a reatividade, o Pontilhado e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Pontilhado com mais detalhe e volume (cache v85)

Os pontos pareciam bolinhas grandes porque a malha era de `3 px` na amostra: num vídeo 16:9 em tela de celular retrato, o `cover` amplia a imagem cerca de 7 vezes, então cada ponto virava algo em torno de `10 px` no aparelho, com muito espaço entre um e outro. Agora é como trocar uma caneta grossa por uma de ponta fina, sem gastar mais tempo:

- **A — malha fina e poda:** `STIPPLE_SPACING` caiu de `3` para `2`. Cabem mais colunas no quadro, o ponto encolhe e o desenho ganha detalhe. Os pontos fora da tela e fora do recorte dos blobs são descartados antes de entrar no caminho do Canvas, e `Math.min(scaleX,scaleY)` saiu de dentro do laço. Resultado: mais pontos visíveis com **menos** arcos desenhados.
- **B — volume por tamanho:** o raio deixou a raiz quadrada e passou a potência `.68`, com os 12 valores guardados numa tabela (sem `Math.pow` por ponto). Quem é grande fica bem maior que o pó; o jitter também diminui quando o ponto é grande, como se a mão firme segurasse a caneta na massa e soltasse no detalhe.
- **C — grão e massa:** toda célula ganha um grão minúsculo (20% do raio máximo), e o ponto de massa entra só quando há tom escuro. É a textura do papel somada à forma — pointillism de verdade, não só um ponto por célula.
- **D — contraste local:** a referência passou de `75%/25%` para `65%/35%` (cena/vizinhos) e o estiramento de `2,6` para `3`. Claro e escuro se separam melhor, e os tamanhos acompanham essa separação.

Os pontos continuam **pretos formando a imagem** dentro dos blobs, com fundo preto fora eles; o Inverter segue sendo o negativo, e o MP4 continua gravando o overlay. Nenhum novo efeito, nenhuma leitura extra de imagem e nenhuma textura nova.

🟢 Pode mexer: `src/render/render.js`, as travas em `tests/` e o número do cache. 🟡 Meça e teste: `npm test` **267/267**, `node --check`, `git diff --check` e bench 3× com p95 `1,270 / 1,210 / 1,178 ms` (teto `1,347 ms`; rodada anterior `0,981 / 1,193 / 0,990 ms`); o tamanho dos pontos e a sensação de volume no Realme C67 ainda **não foram medidos** — escolha Pontilhado, confira o MP4 e. 🔴 Contrato congelado: o pointillism não pode virar pontos só na máscara, o rastreador, a reatividade, a gravação e a estratégia do `sw.js` (só o número muda) continuam iguais.

#### Paisagem liberada na tela cheia (cache v84)

Antes, ao entrar em tela cheia, o app mandava o celular ficar em retrato — era como prender a dobradiça da câmera. Agora a tela cheia **acompanha o giro do aparelho**: vire o celular de lado e o palco, o piano, o dock e o botão de gravação se reorganizam sozinhos. O layout de paisagem já estava preparado (barra compacta, piano mais alto, dock lateral em telas largas); só faltava soltar o travamento.

O Gear VR continua diferente: ele entra em paisagem travada porque a imagem é lado a lado. Ao sair dele ou da tela cheia, a orientação volta a ser controlada pelo celular.

🟢 Pode mexer: `src/app.js` (travamento) e `src/app.css` (posição do botão na dock lateral). 🟡 Meça e teste: `npm test` **266/266**, `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`; o giro no Realme C67 ainda **não foi medido** — entre em tela cheia e vire o aparelho. 🔴 Contrato congelado: o modo foco, o piano, o MP4 e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Gravar e salvar na base da tela cheia (cache v83)

Pense num controle remoto pequeno encostado no canto da televisão: ele está na tela cheia, mas não tampa o piano nem os menus. Em vez de dois botões, existe **um único botão discreto** no canto inferior direito que muda de função conforme o momento:

- **Gravar** (círculo vazio) — inicia a gravação;
- **Parar** (ponto vermelho com cronômetro) — encerra a gravação;
- **Salvar** (seta para baixo) — guarda ou compartilha o MP4 já pronto.

Ele aparece só na tela cheia, fica com opacidade baixa e ganha brilho quando você encosta ou quando está gravando. O piano continua na faixa de `56 px` e a barra de ações em `12 px`; o botão novo fica em `8 px` no canto, fora dos dois. No Gear VR ele é desligado.

🟢 Pode mexer: `index.html` (botão), `src/app.css` (posição e discretude) e `src/app.js` (texto e ação do botão). 🟡 Meça e teste: `npm test` **265/265**, `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`; o encaixe visual no Realme C67 ainda **não foi medido** — confira em tela cheia. 🔴 Contrato congelado: o piano, a barra de ações, os botões antigos do painel e da barra flutuante, o MP4 (que não desenha botões HTML) e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Inverter e Preto e branco com fundo próprio (cache v82)

Antes os dois efeitos valiam para o quadro inteiro. Agora cada um tem um fundo e um interior:

- **Inverter:** o fundo fora dos blobs fica **preto** (como no Pontilhado) e só a união dos blobs recebe o vídeo invertido. É como recortar o negativo com uma tesoura e colar só esse pedaço sobre uma folha preta.
- **Preto e branco:** o fundo mostra o **vídeo em cinza** (sem o contraste exagerado) e, dentro dos blobs, o cinza fica bem mais contrastado (`contrast(6)` em vez de `4`). A pessoa continua aparecendo, mas com contorno mais firme.

O recorte é a mesma união de retângulos dos blobs usada pelo Pontilhado, e o MP4 grava exatamente o que aparece: base + overlay. O botão **Inverter vídeo** continua valendo como negativo extra dentro da janela; nos dois efeitos ele troca a polaridade do que está dentro dos blobs.

🟢 Pode mexer: `src/render/render.js` (fundo, filtro e passada recortada) e `src/app.js` (shader de fundo). 🟡 Meça e teste: `npm test` **264/264**, `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`; o resultado visual no Realme C67 ainda **não foi medido** — compare os três efeitos no aparelho. 🔴 Contrato congelado: o Pontilhado segue com fundo preto e pontos pretos (ou o negativo com Inverter), o rastreador, a reatividade e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Ritmo BlobTrack virou gota d’água (cache v81)

Pense numa torneira pingando: cada vez que o blob se mexe, cai uma gota. No modo das três faixas, o **movimento do blob abre o pulso**: um blob parado não pinga, e quanto mais ele se mexe, mais rápido vai o pingo (de `58` a `132` gotas por minuto). A nota da gota sai da **mesma faixa** do blob que mais se moveu — topo = Hi, meio = Mid, baixo = Low — e o lado esquerdo/direito escolhe uma das duas notas da dupla. Não há sorteado de nota, de pausa nem de espaçamento: a gota some só quando o blob para.

O som foi trocado de “toque de tambor” por **gota d’água**: começa com um ataque de `3,5 ms` (sem estalo), a altura despenca de cerca de `1,75x` para `0,7x` da nota da faixa em `22 ms` (é o `plop`) e o rastro apaga em `30 ms`. Como a gota é mais curta, o volume dela subiu para ser ouvida mesmo com o silêncio entre pingos. Desde a `v86`, ela é o **único** som quando o Ritmo está ligado.

Ao desligar **Ritmo BlobTrack**, a gota é cortada na hora (inclusive a que ainda estava caindo) e sobram apenas as frequências contínuas das faixas, que continuam seguindo os blobs. **Histórico:** até a `v85` as duas coisas tocavam juntas; a `v86` separou os dois estados — veja a seção da `v86`.

🟢 Pode mexer: `src/audio-processor.js` (detecção de movimento, relógio do pulso, ataque/queda da gota e ganho) e as dicas de texto em `src/ui/i18n/`. 🟡 Meça e teste: `npm test` **262/262**, `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms`; o jeito que a gota soa no Realme C67 ainda **não foi medido** — a conferência no aparelho decide. 🔴 Contrato congelado: o modo legado fora das faixas (com seu beat antigo), `baseFrequency`, o rastreador, a reatividade e a estratégia de cache do `sw.js` (só o número muda) continuam iguais.

#### Pontos menores no claro, maiores no escuro — dissolução por área (cache v79)

Pense numa folha de jornal vista de longe: a foto escura tem pontos grandes e juntos; a clara tem pontos miúdos e espalhados. O olho lê **tinta** (área do ponto), não o raio. Antes o raio crescia em linha reta com o tom, então os degraus do meio pareciam todos iguais e as formas começavam a sumir quando o fundo estava claro. Agora:

- o raio é `maxR * sqrt(tom)` — com isso a **área** cresce em linha reta: do pó quase invisível ao ponto cheio, cada nível escurece o mesmo tanto;
- `STIPPLE_LEVELS` subiu de `8` para `12`, então a passagem entre claro e escuro tem mais degraus (a "dissolução" fica mais macia, sem aquele salto de tamanho);
- a referência de contraste mistura `75%` da média da cena com `25%` da média dos 5 vizinhos — é como olhar a foto inteira e, ao mesmo tempo, a esquina que está sendo desenhada. A silhueta fica mais nítida sem pintar o fundo claro de pontos.

Nada disso cria um novo efeito nem mexe na máscara: os pontos continuam formando a **imagem inteira** dentro da união dos blobs, com fundo preto fora dela, e o MP4 grava exatamente esse overlay (com Inverter virando o negativo). A difusão de erro Floyd–Steinberg e o jitter menor na borda continuam iguais. **Histórico:** a `v85` refinou estas regras — o raio passou para potência `.68` e a referência para `65%/35%`; veja a seção da `v85` mais abaixo.

🟢 Pode mexer: só `src/render/render.js` (e as travas de teste). 🟡 Meça e teste: `npm test` **257/257**, `node --check`, `git diff --check` e bench 3× com p95 ≤ `1,347 ms` antes de publicar; o ganho visual no Realme C67 ainda **não foi medido** — a conferência no aparelho é quem decide. 🔴 Contrato congelado: não troque os pontos por máscara, não mude a estratégia de cache do `sw.js` (só o número) e não mexa no rastreador nem na reatividade.

#### Pontilhado vira a imagem gravada (cache v77)

Você pediu prioridade para o Pontilhado, sem sobrepor o vídeo, com os pontos aparecendo só nos blobs e coerentes com o Inverter. A resposta foi: fora dos blobs = **fundo preto**; com Inverter = **negativo**. Agora `renderFrame` não compõe `drawRawVideoWindows` quando `state.effect === 'dither'`; o shader (`uEffect==2`) e o fallback pintam preto, `blobsClipRect` recorta a união dos blobs, e `paintStipple` pinta o papel e os pontos dentro desse recorte. Como o app permite **um** estilo de imagem por vez, **Inverter vídeo** passou a ser a polaridade do Pontilhado (branco sobre preto); o botão **Inverter** continua sendo o estilo exclusivo de negativo do quadro. `drawRecordingComposite` já junta `canvas` + `overlayCanvas`, então o MP4 registra exatamente esse resultado — sem nova estratégia de gravação.

Na mesma leva, a `v76` corrigiu o piano do Tom Base na tela cheia: o CSS `:fullscreen` não aparecia no seu aparelho, então `syncFullscreenUi()` liga a classe `fullscreen-active` no `body` nos eventos `fullscreenchange` e `webkitfullscreenchange`, e o CSS mostra o piano por essa classe (com `html:fullscreen` como reforço). No Gear VR ele continua escondido.

🟡 Mexa só com medição: `npm test` **249/249**, `node --check` nos dois arquivos de runtime e `git diff --check` limpos; bench do núcleo 3× com p95 `1,134 / 1,225 / 1,262 ms` (teto `1,347 ms`). Nada disso foi medido no Realme C67: a validação final no aparelho, com Pontilhado selecionado (`estipple.n > 0`) e MP4 salvo, ainda está pendente.

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
const enableEffect = state.showOriginalVideo || state.videoBlend > 0;
const effectPart = enableEffect ? effectFilter : '';
const filter = (effectPart + invertPart).trim() || 'none';
```

E o Pontilhado dentro da janela tinha o mesmo guard (isto descreve a `v60`; na `v77` o Pontilhado não usa mais janela de vídeo — veja a seção da `v77` acima):

```js
if (state.effect === 'dither' && state.showOriginalVideo) {
  paintStipple(c, viewWidth, viewHeight, offsetX, mirrorX, [clipLeft, clipTop, clipRight, clipBottom]);
}
```

Em palavras de adolescente, naquela versão: **botão ligado = a janela ganha o efeito escolhido** (Inverter, Preto e branco ou Pontilhado com pontos por cima do vídeo). **Botão desligado = lupa limpa**, o vídeo cru entra dentro do retângulo e os pontos não são repintados ali. Inverter vídeo e a mistura continuam com prioridade quando você os aciona.

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
node --check sw.js
git diff --check
git status --short
```

- `npm test`: são 280 testes sem câmera física. Se algum falhar, **pare**.
- `node --check`: confere se o JavaScript não tem erro de escrita.
- `git diff --check`: procura espaços e quebras de linha problemáticos.
- `git status --short`: mostra exatamente quais arquivos você mexeu.

Para ver o resultado na tela, inicie o servidor local com `python -m http.server 8000 --bind 127.0.0.1`, abra `http://localhost:8000`, toque em **Iniciar câmera** e teste o controle que você alterou. Se não tiver aparelho físico, escreva **não medido** na sua anotação em vez de inventar um número.

**Diagnóstico final da `v60` (conferido antes e depois do deploy):** com câmera fake em Chromium, a sessão iniciou (`Traseira principal`, `400×225 · fps 29`, 1 blob), os três efeitos trocaram de estado, os oito botões de efeito voltaram ao valor original, as quatro abas trocaram de painel, o mudo alternou, a gravação foi `idle → recording → idle`, o service worker controlou a página com o cache `blobtrack-celular-00-v60` e o app reabriu offline. Console e rede terminaram com **0 erros**. No site publicado, `sw.js` respondeu `blobtrack-celular-00-v60` com `?cb=<timestamp>` e `cache: 'no-store'`, e o mesmo QA passou sem erros. Câmera real, bateria, gravação em aparelho e aparência final continuam **não medidos**.

**Pacote 3 (25/11/2026, pré-checagem no emulador):** sem aparelho físico, rodamos a parte funcional no AVD Android `BlobTrackEmulator` com Chrome 124, câmera virtual e `WebGL2 ativo`. Sessão em `160×284 · fps 20`, três efeitos, oito toggles, quatro abas, mudo, ROI, blobs `0 → 1 → 2`, retorno do segundo plano e rotação preservaram a sessão; recarga offline reconstruiu o app com o service worker `v60`. Console e rede sem erros. **Gravação ficou desabilitada**: este Chrome só oferece WebM e o gravador da `v60` aceita somente MP4 (`4cdf5cc`) — não é defeito novo, é a limitação da decisão MP4-only (confirmada pelo V1su4rt em 25/11/2026: sem fallback WebM; naquele pedido não houve bump para `v61`); veja [`docs/gravacao.md`](docs/gravacao.md). Bateria, câmera real, calor/GPU, gravação em aparelho, toque na ROI e iPhone/Safari seguem **não medidos**; o emulador não substitui celular. Detalhes em [`docs/device-matrix.md`](docs/device-matrix.md).

#### Orçamento de gravação (cache v61)

O V1su4rt relatou travamento ao gravar e, sobretudo, ao salvar no Realme C67. Quando **Todos os efeitos** estão ligados e a gravação começa, o app agora mantém o vídeo e o efeito base nas janelas, mas corta só o trabalho repetido: o segundo pontilhado dentro das janelas e os efeitos reativos (rastro, ondas, malha, rede e telemetria). A sua lista de efeitos não é alterada e o arquivo continua **MP4 sem áudio**.

🟢 Mexer nesse orçamento em `src/render/render.js` é seguro: os testes avisam se o shell mudar. 🟡 Como é código de runtime, `sw.js` subiu para `v61`; rode `npm test`, `node --check src/app.js`, `node --check src/render/render.js`, `git diff --check` e `node scripts/bench-blobtrack.js` 3× (teto p95 ≤ `1,347 ms`) antes de publicar.

**Publicado em 27/11/2026:** o site oficial (`blobtrak.vercel.app`) respondeu `sw.js` com `blobtrack-celular-00-v61` e HTTP 200. Antes do deploy, `npm test` passou 232/232, `node --check` e `git diff --check` ficaram limpos, e o bench deu p95 de `1,086 / 0,966 / 1,153 ms` nas 3 rodadas (teto `1,347 ms`). O ganho no Realme C67 ainda é **não medido**: o teste manual no link da Vercel é quem vai confirmar.

Para conferir no celular: abra `https://blobtrak.vercel.app/` e confirme que o app carregou o cache `blobtrack-celular-00-v96` (recarregue duas vezes ou limpe dados do site se aparecer vers?o antiga). Depois ligue os efeitos desejados, grave 1 min, pare e **salve** o MP4; anote se travou em algum passo.

#### Diagn?stico removido (cache v94)

O modo diagn?stico `(perf removido no v94)` e o painel de medi??o foram removidos do app a pedido do V1su4rt. O runtime n?o publica mais `__blobtrackPerf`, painel de diagn?stico, nem coleta por etapa no celular. `__blobtrackMetrics` continua dispon?vel para leitura b?sica.

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
| Aparelho no limite | O aviso discreto no palco é só informativo: efeitos reativos continuam ativos, inclusive gravando. |
| Objeto parado some | Absorção de parado é ativada na aplicação após oito quadros estáveis; mova o objeto para voltar a gerar diferença. |
| Cena mudou | Refaça o fundo pelo botão **Fundo**; a notificação não recalibra sozinha. |
| Gravação não inicia | Verifique suporte a `MediaRecorder`/`captureStream`, sessão ativa e espaço estimado. Veja [`docs/gravacao.md`](docs/gravacao.md). |

## Desempenho e limites

O orçamento comparativo do núcleo é p95 ≤ `8 ms` e ≤ `1,15 × baseline` (`1,347 ms`), além de pico ≤ `16 ms`. O benchmark mede apenas `updatePixels` em Node, 320×180, duas formas sintéticas, 30 quadros de aquecimento e 300 medidos. As últimas execuções (lote v90): p95 `1,271`, `1,218` e `1,195 ms`, todas abaixo do teto. Isso não prevê câmera, bateria nem FPS num celular. A contagem atual é 280 testes aprovados.

O limite mínimo de área é `minAreaRatio=0,00025` (piso de 6 pixels), e o máximo é `maxAreaRatio=0,72`; no quadro 320×180, o arredondamento observado requer cerca de 14 pixels. Para ajudar, enquadre o objeto maior ou reduza o zoom/distância conforme o caso, ou desenhe ROI. A gravação é sem áudio e para em cinco minutos. O suporte a câmera, segundo plano e exportação varia por navegador. Dispositivos físicos: **não medidos**.

## Documentação

- [Diagnóstico atual (v85–v93)](docs/diagnostico-atual.md)
- [Diagnóstico cirúrgico e prioridades](docs/diagnostico-cirurgico.md)
- [Benchmark e baseline](docs/blobtrack-benchmark.md)
- [Medições antes/depois e decisões rejeitadas](docs/perf-antes-depois.md)
- [Matriz de validação física](docs/device-matrix.md)
- [Comportamento da gravação](docs/gravacao.md)
- [Inventário do projeto](docs/faxina-inventario.md)
- [Navegação e interface](docs/ui/navegacao.md)
- [Acessibilidade](docs/ui/acessibilidade.md)

HTTPS foi informado como verificado manualmente. As correções locais só chegam ao endereço publicado quando forem enviadas ao repositório remoto e implantadas.
