# Diagnóstico de bugs — recorte de vídeo e blob tracking

## Escopo e ambiente

Fase 0 concluída em 20/11/2026, somente leitura. Revisados `src/app.js`, `src/blob-tracker.js`, `src/app.css`, HTML e cache PWA. O repositório estava limpo em `414c07e`. Não há Chrome, Edge, câmera ou `adb` neste ambiente; testes que exigem imagem ao vivo estão marcados como **NÃO REPRODUZIDO**. As conclusões estáticas abaixo identificam bugs demonstráveis pelo fluxo de código, não substituem a matriz de hardware.

O app usa um frame congelado por `captureVideoFrame()` e passa o mesmo canvas a análise, render e composição (`app.js:252–260`, `531`). Os pontos e caixas são normalizados pelo tracker e convertidos para o crop `cover` em `mapVideoPoint()` (`app.js:313–327`). A composição usa um único path/`clip()` e uma chamada `drawImage()` por olho, não uma chamada por blob (`app.js:420–434`).

## Bugs confirmados

### B2 — composição anterior permanece visível durante troca de câmera

- **Reprodução:** iniciar a câmera; alternar para a outra câmera em condições de demora de permissão/inicialização; observar o palco durante a espera.
- **Observado no fluxo:** `switchCamera()` para a sessão e o stream e reseta o tracker, mas não limpa `canvas` nem `overlayCanvas` (`app.js:226`). O loop deixa de atualizar quando `state.active` fica falso (`app.js:519`). Assim, os pixels da composição anterior permanecem estáticos enquanto a nova câmera abre.
- **Esperado:** limpar a composição antiga imediatamente; só mostrar a nova após haver frame válido (`video.readyState >= 2`).
- **Causa:** teardown da câmera não invalida/limpa os canvases de apresentação.
- **Reprodução física:** não executada; o estado congelado é consequência direta do fluxo estático acima.
- **Correção aplicada após a Fase 0:** `stopMedia()` agora limpa o framebuffer visual e o overlay antes de liberar a câmera; `switchCamera()` passa pelo mesmo caminho antes de abrir o novo stream. A espera por `readyState >= 2` continua protegendo a primeira composição nova.
- **Teste de regressão:** o helper de limpeza é testado isoladamente nos caminhos WebGL e Canvas 2D; integração verificada estaticamente (`switchCamera → stopMedia → clearVideoComposition`). Teste de troca real de lente ainda depende de aparelho.
- **Contagem antes/depois:** antes, limpar na troca = 0 chamadas; depois, WebGL = 1 clear do framebuffer + 1 clear do overlay, Canvas 2D = 2 clearRect. FPS não comparável sem câmera.

### B4 — retomada de visibilidade usa propriedade inexistente

- **Reprodução:** suspender a aba/aplicativo e voltar; o callback deve retomar câmera, áudio e wake lock.
- **Observado:** ambos os callbacks comparam `document.visibilitystate` com `'visible'` (`app.js:230`, `760`). A propriedade padrão é `document.visibilityState` (S maiúsculo); portanto, a condição de retorno nunca é verdadeira em navegador conforme padrão. A câmera pode não chamar `play()`/retomada do áudio e o wake lock não é readquirido.
- **Esperado:** executar os caminhos de retomada ao receber `visibilitychange` com `visibilityState === 'visible'`.
- **Causa:** nome de propriedade com capitalização incorreta em dois listeners.
- **Reprodução por contrato:** diferença entre `visibilityState` e `visibilitystate` verificada estaticamente; ciclo real de background não disponível.
- **Correção aplicada após a Fase 0:** ambos os listeners agora usam `document.visibilityState`.
- **Teste antes/depois:** em fixture de documento visível, a expressão antiga retornou `false` (`visibilitystate === undefined`); após a correção, as duas referências usam a propriedade padrão. Verificação estática/regressão executada; ciclo físico de suspender/retomar continua pendente.
- **Contagem antes/depois:** condição de retorno para documento visível, antes 0/2 listeners correta; depois 2/2 referências corretas. Retomada real de mídia/wake lock precisa de navegador.

## Catálogo de investigação A–F

| ID | Passos de reprodução propostos | Observação atual / esperado | Causa ou evidência | Estado |
|---|---|---|---|---|
| A1 espelhamento | Câmera frontal; alternar Flip ligado/desligado; comparar caixa e crop | `mapVideoPoint` e `drawRawVideoWindows` aplicam o mesmo espelho frontal e flip vertical | `app.js:318–327`, `430–434` | NÃO REPRODUZIDO sem câmera; transformação parece coerente |
| A2 facing | Testar frontal/traseira × Flip ligado/desligado | O source do frame é recriado após troca; a cena antiga persiste durante a espera (B2) | `app.js:204–226`, `252–257` | B2 confirmado; alinhamento das quatro combinações não testado em dispositivo |
| A3 aspecto | Comparar vídeo 4:3/16:9 com palco em portrait/landscape | Tracker e composição usam o mesmo source/aspect e cover central | `app.js:313–326`, `420–434` | NÃO REPRODUZIDO; sem stream com aspecto variável |
| A4 `object-fit` | Conferir região vista no crop em telas com proporção diferente | `object-fit` aplica-se aos canvases; shader e recorte calculam cover explicitamente | `app.css:51`, `app.js:283–327`, `420–434` | NÃO REPRODUZIDO visualmente |
| A5 rotação | Girar portrait/landscape sem reiniciar câmera | Há `ResizeObserver` e `orientationchange`; aspecto da câmera é consultado por frame | `app.js:239–249`, `318–327` | NÃO REPRODUZIDO em aparelho |
| B1 frame atrasado | Comparar frame analisado ao frame dentro das caixas | `captureVideoFrame()` retorna um canvas compartilhado por tracking, render e crop | `app.js:252–260`, `531` | Não aplicável ao pipeline atual; mesma referência síncrona |
| B2 troca congelada | Aguardar a nova câmera depois de `switchCamera` | Canvas anterior continua visível até novo frame | `app.js:226`, `519` | BUG confirmado acima |
| B3 captura | Capturar com janelas ligadas, comparar imagem com palco | Captura compõe `canvas` e `overlayCanvas` antes de serializar | `app.js:670`, `698–705` | NÃO REPRODUZIDO visualmente; composição inclui camada do crop |
| B4 suspensão | Suspender e restaurar aba | Check usa `visibilitystate`, não `visibilityState` | `app.js:230`, `760` | BUG confirmado acima |
| C1 bordas | Zoom na borda de um crop retangular | `clip()` retangular pode ter antialiasing do Canvas; sem captura não é possível avaliar percepção | `app.js:421–434` | NÃO REPRODUZIDO |
| C2 jitter de caixa | Mover objeto lentamente com ruído e observar contorno/crop | Caixas usam coordenadas do componente diretamente; não há EMA de bounding box | `blob-tracker.js:158–170`, `app.js:472–482` | Risco conhecido; NÃO REPRODUZIDO com vídeo real |
| C3 fusão | Aproximar dois objetos até tocarem | Componentes conectados se fundem por definição | `blob-tracker.js:113–160` | Limite arquitetural esperado; não há separação/watershed |
| C4 borda da tela | Mover blob parcialmente para fora do conteúdo visível | Componentes ficam dentro do frame; `clip()` do olho e canvas limitam desenho | `blob-tracker.js:144–155`, `app.js:425–434` | NÃO REPRODUZIDO visualmente; sem indicação estática de pintura fora do canvas |
| C5 caixa mínima | Detectar blob próximo do limite de área e avaliar crop | Área mínima do tracker é 6 pixels ou `0.00025 × total`; não há `minCropSize` visual | `blob-tracker.js:118–119` | Risco visual; NÃO REPRODUZIDO em resolução de aparelho |
| C6 z-order | Ativar Overlay e Janela viva | Crop é desenhado antes dos contornos/labels | `app.js:466–482` | Ordem esperada, confirmada estaticamente |
| C7 tom do crop | Comparar vídeo cru e filtro | Crop é deliberadamente imagem crua, acima do efeito | `app.js:466` | Comportamento intencional; não aplicar efeito adicional |
| D1 troca de IDs | Cruzar dois blobs semelhantes em movimento | Associação usa distância de centroides e matching guloso, sem IoU/velocidade | `blob-tracker.js:172–199` | Risco confirmado no algoritmo; troca real NÃO REPRODUZIDA |
| D2 jitter por ruído | Objeto com ruído de borda | Há filtro de área mínima, mas não há morfologia 3×3 | `blob-tracker.js:113–160` | NÃO REPRODUZIDO com câmera |
| D3 fusão indevida | Aproximar objetos até componentes se conectarem | Flood fill 8-vizinhos os considera um componente | `blob-tracker.js:141–160` | Limitação estrutural; watershed seria mudança arriscada |
| D4 fantasma ao parar | Mover e parar objeto por vários segundos | Pixels ativos não são assimilados enquanto diferem do fundo; tendem a continuar como blob | `blob-tracker.js:55–65` | NÃO REPRODUZIDO ao vivo; código não confirma desaparecimento rápido |
| D5 mudança de luz | Alterar exposição/luz global abruptamente | Componentes acima de 72% são descartados; mudanças menores ainda podem criar componentes | `blob-tracker.js:118–119` | Risco conhecido; NÃO REPRODUZIDO em cena real |
| D6 adaptação rápida | Parar objeto sobre fundo previamente aprendido | Fundo atualiza apenas pixels inativos, com taxa fixa 0.006 | `blob-tracker.js:55–65` | Sem evidência de integração rápida de pixels persistentemente ativos |
| D7 threshold inválido | Calibrar fundo preto; enviar frame com seis regiões claras e `threshold=NaN` | `safeThreshold` é calculado, mas a comparação usava o argumento original, suprimindo todos os blobs | `blob-tracker.js:36`, comparação na linha 55 | BUG reproduzido sinteticamente; corrigido para usar `safeThreshold` |
| E1 draw por blob | Ativar muitas janelas | Um path retangular composto e um `drawImage` por olho | `app.js:422–434` | Não aplicável: não há `drawImage` por blob |
| E2 clip por blob | Contar `clip()` com vários blobs | Um `clip()` por olho, após adicionar todas as caixas ao path | `app.js:422–423` | Não aplicável ao código atual |
| E3 leitura de pixels | Medir frame time do tracker | `getImageData()` ocorre a cada análise; é requisito da segmentação Canvas CPU atual e o contexto usa `willReadFrequently` | `app.js:9`, `blob-tracker.js:45–46` | Custo real não medido; remover exige troca de arquitetura |
| E4 canvases temporários | Observar criação por frame | `frameCanvas` e `maskCanvas` são reutilizados; canvas de captura nasce apenas ao clicar | `app.js:10`, `436–450`, `670` | Não reproduzido como alocação por frame |
| E5 cópias do frame | Contar cópias da câmera por frame | `captureVideoFrame()` copia uma vez; o mesmo canvas serve ao tracker, renderer e crop | `app.js:252–260`, `531` | Não aplicável ao pipeline atual |
| F1 mask | Ligar máscara e janela viva | Crop é composto depois da máscara, com opacidade total | `app.js:445–466` | Comportamento definido: crop visível sobre máscara; documentar, sem novo controle |
| F2 focus | Ligar modo palco e observar crop | Modo esconde UI via CSS; loop de composição continua ativo | `app.js:715–727`, `app.css:297–310` | NÃO REPRODUZIDO visualmente |
| F3 Gear VR | Ativar side-by-side e conferir os dois olhos | Overlay desenha por olho usando o mesmo crop e offsets | `app.js:439–442`, `420–434` | NÃO REPRODUZIDO em headset/aparelho |
| F4 captura | Capturar em cada efeito | Captura combina visual e overlay, que inclui crop | `app.js:670`, `698–705` | Composição confirmada estaticamente; screenshots não disponíveis |
| F5 overlay | Alternar overlay ligado/desligado | Contornos são desenhados após crop apenas quando overlay ligado | `app.js:467–482` | Ordem confirmada estaticamente |

## Seção 5 — estabilidade do tracking

| Item | Estado observado | Passos para reproduzir / evidência | Decisão |
|---|---|---|---|
| 5.1 IoU + centróide | Centróide por distância euclidiana, greedy | Cruzar dois objetos visualmente iguais; precisa de câmera para confirmar troca | Não alterar sem reprodução e benchmark |
| 5.2 EMA das caixas | Não existe; caixa renderizada é a bruta do componente | Mover objeto com contorno ruidoso e medir jitter em pixels | Candidato, sem baseline visual |
| 5.3 histerese de área | Só um limiar `minimum` | Variar área do objeto ao redor do limite mínimo | Candidato; requer cena de ruído reproduzível |
| 5.4 idade mínima | IDs aparecem no frame que cria o componente | Gerar blob transitório de um frame | Candidato; sem captura de vídeo |
| 5.5 maxAge/fade | Sem idade/persistência em `assignTracks`; IDs desaparecem quando não há componente | Fazer blob sumir e medir persistência | Não implementar sem decidir semântica do sinal |
| 5.6 morfologia | Não há open/close | Injetar ruído isolado na máscara sintética e medir custo | Experimento não solicitado pelo código atual |
| 5.7 área dinâmica | `minAreaRatio=0.00025`, absoluto mínimo 6 pixels | Comparar tamanhos e `trackingWidth` | Candidato; valores propostos pelo prompt não têm baseline |
| 5.8 watershed | Ausente | Dois objetos conectados com concavidade | Não implementar sem custo ≤1 ms medido |
| 5.9 fundo adaptativo | Taxa fixa 0.006 em pixels inativos | Cena estável vs movimento sustentado | O algoritmo não atualiza pixel ativo; não alterar no escuro |
| 5.10 normalização de luz | Ausente; luma absoluta | Mudar luz >15% e observar blobs falsos | Candidato; sem câmera/medição |

## Baseline reproduzível e limites

- **FrameId:** não existe; a chamada síncrona com `source` compartilhado faz tracking → render → crop no mesmo tick. Um `frameId` duplicaria informação sem corrigir defeito atual.
- **Crop:** 1 `drawImage()` por olho por composição, independente do número de blobs; 1 `clip()` por olho. O cronômetro `windowCostReadout` mede essa chamada e montagem de path, mas não foi possível capturar um baseline de dispositivo.
- **Tracking:** `getImageData()` é feito em cada análise. FPS, ms de tracking e custo por 6 blobs não medidos sem câmera e Android mid-range.
- **Sincronia de imagem:** `frameCanvas` é desenhado uma vez a partir do vídeo e reaproveitado no restante do tick. A cópia de tela ocorre apenas sob demanda.

Nenhum efeito, API pública ou síntese de áudio foi alterado na Fase 0. Nenhuma correção deve ser inferida a partir dos itens marcados como risco sem reprodução/teste comparativo. As correções B2 e B4 posteriores não alteram tracking, efeitos nem síntese.

## D7 — teste antes/depois

- Fixture: fundo preto 320×180, seis quadrados brancos de 10×10, segundo frame com limiar `NaN`.
- Antes: **0/6 blobs**; comparação com `NaN` sempre falha.
- Depois: esperado **6/6 blobs**, usando fallback seguro de 0.18.
- Regressão: cenário válido com threshold 0.18, seis regiões, 90 frames; FPS/custo de aparelho não inferidos dessa fixture.
