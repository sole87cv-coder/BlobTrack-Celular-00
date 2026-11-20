# Auditoria técnica — BlobTrack Celular-00

Auditoria estática realizada em 20/11/2026 antes dos refinamentos desta rodada. A árvore já continha mudanças locais em `README.md`, `index.html`, `src/app.css`, `src/app.js`, `src/audio-processor.js` e `sw.js`; elas foram preservadas e consideradas parte do baseline. Nenhuma medição física foi simulada.

## Inventário do código versionado

| Arquivo | Linhas | Responsabilidade |
|---|---:|---|
| `index.html` | 213 | Estrutura da interface, controles e metadados PWA |
| `src/app.css` | 382 | Layout responsivo, palco, dock, controles e acessibilidade visual |
| `src/app.js` | 758 | Estado, câmera, renderização, envelopes, efeitos, UI, captura e sessões |
| `src/blob-tracker.js` | 201 | Amostragem da imagem e rastreamento de blobs |
| `src/audio-processor.js` | 175 | Síntese e efeitos no AudioWorklet |
| `sw.js` | 5 | Cache offline e atualização do shell |
| `README.md` | 82 | Instalação, uso e documentação do app |
| `teste.html`, `teste.js` | 59, 115 | Página e script auxiliares de teste |
| `manifest.webmanifest`, `icons/icon.svg` | 15, 6 | Instalação e ícone PWA |
| `android/app/src/main/java/com/blobtrack/celular00/MainActivity.java` | 187 | Casca Android/WebView |
| Demais fontes Android | 136 | Gradle, manifesto, recursos e instruções de build |
| `.gitignore`, `vercel.json` | 13, 13 | Exclusões e configuração de publicação |

Artefatos locais ignorados do Gradle/SDK e saídas de build foram excluídos do inventário.

## Mapa de dependências

- `index.html` carrega `src/app.css` e `src/app.js` como módulo; o módulo importa `src/blob-tracker.js`.
- `src/app.js` controla câmera → captura de frame → `BlobTracker` → envelopes compartilhados → renderização WebGL/Canvas 2D → camadas visuais/captura. Também controla tabs, controles, PWA, permissões e ciclo de sessão.
- `src/app.js` carrega `src/audio-processor.js` via `AudioWorklet.addModule()` e envia parâmetros pelo `MessagePort`; o processador não importa o app.
- `sw.js` pré-cacheia HTML, CSS, JS, processador, tracker, manifesto e ícone.
- `android/MainActivity.java` hospeda o app web; `android` depende da estrutura publicada localmente.
- Acoplamento principal: `app.js` concentra UI, renderização e ciclo de vida. O estado visual e os envelopes de áudio/visuais estão no mesmo objeto `state`, evitando smoothing duplicado.

## Pontos quentes e fragilidades encontrados

- **Uniforms WebGL:** `gl.getUniformLocation()` era chamado em cada frame dentro de `render()`, incluindo uniforms escalares e flags. O refinamento desta rodada armazena as localizações depois do link do programa.
- **Alocações no frame:** arrays tipados de trilhas/pontos são pré-alocados. Há closures/objetos pequenos em alguns caminhos e `getBoundingClientRect()` durante interação por ponteiro; não identifiquei `innerHTML` no caminho de frame. O `Float32Array` do quad é criado na inicialização, fora do loop.
- **Canvas e tracker:** `drawImage` ocorre para ingestão da câmera no tracker e para a captura/recortes visuais; há custo proporcional a blobs/retângulos. O tracker percorre pixels e componentes conectados, e faz comparações entre blobs/componentes; o limite de resolução reduz o custo, mas não há perfil real de CPU.
- **Efeitos:** trails, ondas (`drawWaves`) e grade (`drawMesh`) desenham na camada Canvas 2D; não há FBO ping-pong nesta implementação. O prompt descreve `aura`, mas essa implementação não foi encontrada no código atual. A grade limita a influência a oito blobs; seu custo cresce com a densidade da malha da tela. Não há telemetria que isole o tempo do recorte de vídeo.
- **Listeners e ciclo de vida:** muitos listeners são instalados uma vez no carregamento. O áudio mantém listeners `statechange`/`interrupted` sem remoção explícita; como o contexto é singleton da sessão, não parece crescer a cada frame, mas falta uma rotina central de teardown.
- **Timers:** a recuperação de áudio usa espera repetida enquanto a sessão está ativa; o ciclo termina quando `state.active` fica falso. Verificar reinícios repetidos no aparelho permanece teste manual.
- **Preferências:** `localStorage` é lido/escrito com `try/catch`, sem TTL. O payload é pequeno e limitado a preferências, não a dados de sessão.
- **Acessibilidade/visual:** foco visível e `prefers-reduced-motion` existem; botões de alternância principais têm `aria-pressed`. Os efeitos selecionáveis por `data-effect` e as tabs não sincronizam completamente semântica ARIA/estado selecionado. Há texto pequeno de 9–10 px em readouts e hints, contraste AA não foi medido por ferramenta. `backdrop-filter` está presente na barra/toast, podendo custar em aparelhos modestos.
- **Responsividade:** CSS cobre telas estreitas e paisagem; validação visual nos quatro tamanhos solicitados requer emulador/browser.

## Baseline de métricas

| Métrica | Baseline observado | Estado |
|---|---:|---|
| FPS médio | Não medido | Requer câmera e perfil no dispositivo |
| Frame time de rastreio | Não medido | Requer DevTools/Android com câmera |
| Memória após 5 min | Não medida | Requer Allocation timeline em sessão real |
| Boot até primeiro frame | Não medido | Requer navegador e permissão de câmera |
| Tamanho do shell web | 108,433 bytes (HTML, CSS, app, tracker, worklet e SW) | Soma em disco do baseline; nao e bundle comprimido |

| Comparacao estatica | Antes | Depois |
|---|---:|---:|
| Shell web (bytes) | 108,433 | 109,466 (+1,033; +0.95%) |

Metas de FPS, frame time, memória e boot não podem ser declaradas alcançadas sem aparelho/DevTools. `performance.memory` não é padrão confiável em navegadores móveis.

## Cobertura manual necessária

Revalidar: iniciar/parar câmera e áudio; troca frontal/traseira; seis efeitos individualmente; mask/flip/overlay/captura; janela viva; Gear VR; áudio e toggles Eco/Espaço/Chorus; tab/foco por teclado; preferências persistidas; permissões negadas; rotação/paisagem; dimensões 360×640, 390×844, 412×915 e 844×390; instalação e recarga offline; ciclos repetidos de iniciar/parar; tela bloqueada/interrupção de áudio.

## Plano seguro por fase

1. Cachear uniform locations e reduzir alocações do envelope de zonas, sem alterar shaders nem o formato das mensagens do áudio.
2. Limitar atualizações visuais do painel a 10 Hz, mantendo rastreamento e áudio na frequência do processamento.
3. Sincronizar `aria-pressed`, microcopy de início e feedback curto de erro; documentar o estado e as medições pendentes.
4. Fazer validação estática de sintaxe e referências; deixar medições de dispositivo e screenshots como pendências explícitas.

Não será feita extração de módulos, alteração de `blob-tracker.js`/`audio-processor.js`, nem troca da estratégia de renderização sem medições e testes do dispositivo. A aplicação não tem um pipeline de FBO ping-pong nesta versão.

## Alterações aplicadas após o baseline

- Cache de 12 uniform locations WebGL na inicialização do renderer.
- Envelope das seis zonas atualizado em memória sem recriar array por frame.
- Painel de medições atualizado no máximo a cada 100 ms; o ciclo de análise, renderização e áudio mantém a cadência original.
- Estados ARIA das tabs e efeitos sincronizados; zonas identificadas individualmente para leitores de tela.
- Mensagem inicial simplificada e falhas de áudio/WebGL comunicadas também pelo toast.
- A rotina de interrupção do áudio agora registra listeners uma vez por contexto.
- Cache PWA avançou para v15; sem novos arquivos de runtime.
