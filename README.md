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
python -m http.server 8000
```

Abra `http://localhost:8000` no navegador e toque em **Iniciar câmera**. Permissão de câmera e áudio exige HTTPS ou `localhost`; `file://` não funciona. O app não usa microfone. Para instalar no celular, publique num endereço HTTPS; no iPhone, abra no Safari e escolha **Compartilhar → Adicionar à Tela de Início**.

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
| `sw.js`, `manifest.json`, ícones | Instalação e cache offline da PWA. Atualize o número de cache ao alterar recursos de runtime. |
| `tests/` | Testes automatizados sem câmera física. |
| `scripts/bench-blobtrack.js` | Cenário reproduzível de tempo do núcleo de rastreamento. |
| `docs/` | Diagnóstico, medições, matriz física e decisões de manutenção. |
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
| Região de interesse | `src/core/roiMask.js`, integração em `src/app.js` e `docs/ROI-decisao.md`. |
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
| `sw.js` | **Só o número do cache pode mudar.** Se você alterou qualquer arquivo que roda no app, suba o número (ex.: `v52` → `v53`). Sem isso, o celular continua usando a versão antiga. |
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

#### Exemplo prático: ajustar o Pontilhado (Floyd-Steinberg)

Este é um bom primeiro trabalho porque toca só nas 🟢. Em `src/render/render.js` você encontra:

```js
const FLOYD_MAX_WIDTH = 320, FLOYD_MAX_HEIGHT = 240;
const FLOYD_MAX_PIXELS = FLOYD_MAX_WIDTH * FLOYD_MAX_HEIGHT;
const FLOYD_ERROR_LIMIT = 0.35;
```

O Pontilhado não usa mais círculos nem grade: ele transforma o quadro em preto e branco empurrando o erro de cada pixel para os vizinhos. A varredura é **serpenteada** — linha par da esquerda para a direita, linha ímpar da direita para a esquerda — para não aparecerem diagonais. `FLOYD_MAX_*` define o tamanho do mini-quadro: valores menores dão pontos maiores e custam menos; valores maiores dão pontos mais finos e custam mais. Não suba esses números sem medir. `FLOYD_ERROR_LIMIT` segura rastros longos; `0,35` é o valor seguro. Se o canvas 2D falhar, o app desenha o vídeo normal em vez de quebrar. Depois: suba o cache, rode os testes e confira o efeito no navegador.

#### Rotina de segurança antes de publicar

Copie e rode nesta ordem, na raiz do projeto:

```powershell
npm test
node --check src/app.js
node --check src/render/render.js
git diff --check
git status --short
```

- `npm test`: são 214 testes sem câmera física. Se algum falhar, **pare**.
- `node --check`: confere se o JavaScript não tem erro de escrita.
- `git diff --check`: procura espaços e quebras de linha problemáticos.
- `git status --short`: mostra exatamente quais arquivos você mexeu.

Para ver o resultado na tela, inicie o servidor local com `python -m http.server 8000`, abra `http://localhost:8000`, toque em **Iniciar câmera** e teste o controle que você alterou. Se não tiver aparelho físico, escreva **não medido** na sua anotação em vez de inventar um número.

#### Se algo deu errado

1. Veja o que mudou com `git diff` (mostra as diferenças linha a linha).
2. Para descartar as alterações **não salvas** de um arquivo, use `git restore -- <arquivo>`. Atenção: isso apaga o que você escreveu nele desde o último commit — só use quando tiver certeza.
3. Se o problema já entrou num commit, use `git revert <hash>`: ele cria um commit novo que desfaz o anterior sem apagar histórico.
4. Peça ajuda antes de mexer na zona 🔴.

Um commit deve contar **uma** ideia. Exemplo de mensagem boa: `fix: aumenta pontos do efeito Pontilhado e sobe cache v52`.

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

O orçamento comparativo do núcleo é p95 ≤ `8 ms` e ≤ `1,15 × baseline` (`1,347 ms`), além de pico ≤ `16 ms`. O benchmark mede apenas `updatePixels` em Node, 320×180, duas formas sintéticas, 30 quadros de aquecimento e 300 medidos. As últimas execuções: p95 `1,065`, `1,340` e `1,324 ms`; os valores ficam abaixo dos limites, com uma execução perto do teto. Isso não prevê câmera, bateria nem FPS num celular. A contagem atual é 214 testes aprovados.

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
