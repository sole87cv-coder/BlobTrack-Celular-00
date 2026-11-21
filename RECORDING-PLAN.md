# Gravação de sessão — BlobTrack Celular-00

## Fase 0 — auditoria somente leitura

Mapeamento feito em 20/11/2026. Nesta fase, somente este plano foi criado; nenhum arquivo de runtime, Android, manifesto, síntese ou captura estática foi alterado.

### Composição visual real

- `#visual` contém o vídeo da câmera após o filtro base (Invert, BW umbral ou BW dither). O renderer usa WebGL2 ou Canvas 2D.
- `#overlay` é uma camada 2D separada. Além das caixas e rótulos controlados por **Overlay**, ela desenha máscara, Rastro, Ondas, Grade e as janelas de vídeo cru dos blobs. Portanto, capturar somente `#visual` perde parte importante do palco.
- A captura estática existente já combina `#visual` e `#overlay`. Seu `captureButton` deve permanecer intacto.
- O `.stage-shade` é uma camada CSS visível sobre a imagem em alguns modos; não está em nenhum canvas. Para que o vídeo corresponda ao palco, a composição de gravação deve reproduzir o gradiente quando visível, entre `#visual` e `#overlay`. A barra flutuante, dock, pílula, mensagens, toast, `focus-hint` e botão de saída Gear VR são elementos de interface e ficam fora da gravação.
- Em Gear VR, os dois canvases já desenham a composição lado a lado e escondem o shade. A gravação composta deve manter as duas vistas, não reconstruir uma vista separada.
- O código atual tem três filtros base e três camadas reativas: Rastro, Ondas e Grade. Não encontrei `src/effects.js` nem efeito `aura`; a descrição do status quo no pedido não corresponde integralmente à árvore atual.
- `state.overlay` controla caixas/labels e retângulos manuais; não desliga todo o `#overlay`. Um toggle de gravação independente para “incluir overlay” poderia divergir do que aparece no palco. A proposta é gravar exatamente a composição visível, sem novo toggle.

### Saída de áudio real

`makeAudio()` cria o `AudioContext`, o AudioWorklet e `state.audioGain`. O grafo atual é `worklet → state.audioGain → audio.destination`. `state.audioGain` é a tomada final apropriada para uma ramificação de gravação: `audioGain → MediaStreamAudioDestinationNode`, sem alterar nem duplicar a síntese. O ganho atual já representa mudo e saída desativada; gravar sua saída preserva essas condições.

Se o contexto/nó de áudio não estiver disponível, a gravação pode continuar somente com vídeo, com aviso claro. O app não captura microfone. A faixa de áudio da gravação deve vir do som sintetizado.

## Decisões de arquitetura propostas

1. **Composição offscreen obrigatória.** Criar um canvas de gravação fora da árvore visível. Depois de `render()` e `drawMaskOverlay()` no frame atual, compor `#visual`, shade quando aplicável e `#overlay`, nessa ordem. Capturar esse canvas com `captureStream(fps)`. Não capturar o DOM nem gravar o próprio indicador REC.
2. **Tamanho e orientação.** Fixar dimensões e aspecto no início da gravação; ao girar o aparelho, desenhar a composição dentro desse quadro com letterbox, sem esticar nem reiniciar o MediaRecorder. Usar as dimensões reais do palco, limitadas a 1280 px no lado maior. `trackingWidth` mede a análise do tracker, não a resolução do vídeo final; não deve decidir entre 720p/1080p.
3. **Frequência.** Solicitar no máximo 30 fps e não exceder o `deviceProfile.fps` ativo (20/24/30). Exibir a taxa e resolução efetivamente selecionadas; não prometer 1080p quando o canvas fonte tiver menos pixels.
4. **Áudio isolado.** O app cria o `MediaStreamAudioDestinationNode` apenas ao iniciar uma gravação, conecta-o em paralelo a `state.audioGain` e injeta sua `stream` no módulo. Ao finalizar, desconecta e libera somente os recursos da gravação. Assim, sessões sem gravação não ganham uma ramificação de áudio permanente.
5. **Negociação de formato.** Consultar `MediaRecorder`, `canvas.captureStream`, `MediaRecorder.isTypeSupported()` e, ao construir o recorder, capturar erros reais. Tentar MP4 AVC/AAC, WebM VP9/Opus, WebM VP8/Opus e fallbacks apenas quando suportados; usar `recorder.mimeType` real para extensão e metadados. Não detectar suporte apenas pelo user-agent.
6. **Compatibilidade honesta.** Navegadores variam em container, codec e compartilhamento. Não é possível garantir que todo arquivo seja aceito por VLC, QuickTime, Fotos e WhatsApp em todas as versões. A UI informa o formato gerado; a matriz de dispositivos verifica os destinos disponíveis. Se nenhum formato compatível for reportado, controles ficam desabilitados com `title` explicativo.
7. **Exportação por gesto explícito.** Ao terminar, guardar o Blob e mostrar uma ação acessível **Salvar/compartilhar**. O clique dessa ação tenta Web Share para arquivo, depois File System Access quando disponível e, por fim, download. Não depender de abrir share sheet no callback assíncrono de `MediaRecorder.stop()`, pois a ativação do usuário pode já ter expirado.
8. **Limites e pausa.** Modo manual com limite de 10 minutos. Pausar o MediaRecorder quando `visibilityState` ficar `hidden` e retomá-lo ao voltar, sem incluir o tempo pausado. Aplicar também um limite explícito ao total de bytes; `performance.memory` não existe de forma portátil e não pode ser a única proteção contra memória alta. Erros preservam e oferecem chunks parciais quando formam um Blob válido.
9. **Troca de câmera.** Como o recorder lê o canvas composto, a troca do stream não reinicia a gravação. Durante o intervalo sem frame novo, conservar o último frame composto; retomar quando a câmera entregar imagem.
10. **UI mínima.** Adicionar botão de gravação à barra flutuante e ação sincronizada em `panelEffects`, mais indicador/timer fora do canvas. Estados e ARIA devem refletir idle/recording/paused/stopping. `captureButton` e seus IDs existentes permanecem inalterados.

### Replay: decisão pendente

O pedido chama Replay de opcional e desligado por padrão, mas a fase 5 e o checklist também pedem o buffer circular. Não recomendo concatenar simplesmente os últimos chunks de 1 segundo de um único `MediaRecorder`: chunks arbitrários podem depender do cabeçalho, timestamps e keyframe inicial do container; o Blob final pode não abrir ou começar corrompido.

Proposta segura: entregar primeiro gravação manual, sem Replay. Para um replay confiável de 15/30/60 s será necessário um muxer com suporte e testes por container, ou uma arquitetura baseada em WebCodecs com remuxing, adicionando custo, dependência e restrições (especialmente iOS/WebView). Essa escolha precisa ser aprovada antes da fase 5.

## Plano das fases 1–6

1. **Módulo base:** adicionar `src/recorder.js` com negociação de MIME, composição já pronta, chunks temporizados, máquina de estados, timeout, pausa/retomada, erro parcial e `dispose()`. Cobrir seleção de formato e transições com mocks Node; validar gravação simples em Chrome desktop antes de integrar UI.
2. **Tomada de áudio:** no app, criar e conectar o destino de mídia somente durante gravação; manter intacta a rota existente para `audio.destination`. Testar áudio ligado, mudo, som desativado e indisponível.
3. **UI:** acrescentar controles sincronizados e indicador/timer; estado de suporte desabilita o controle com motivo; respeitar `prefers-reduced-motion`. Preservar todos os IDs/atributos atuais e `captureButton`.
4. **Composição:** adicionar o canvas offscreen, compor ao final do frame do app e alimentar `captureStream`. Validar filtros, máscara, janelas vivas, overlay, modo palco, rotação e Gear VR.
5. **Ciclo de vida:** ligar/desligar junto da sessão, manter a gravação durante troca de câmera, pausar em background, retomar em foreground, limitar duração/tamanho e tratar encerramento/erro. Replay só entra depois de decisão técnica e aprovação explícita.
6. **Exportação e documentos:** aplicar nome `blobtrack-{efeito}-{YYYYMMDD}-{HHMMSS}.{ext}`, share/file picker/download, atualizar service worker para incluir o novo módulo e incrementar de `v19` para `v20`; atualizar README e CHANGELOG. Testar saída offline.

Cada fase de implementação terá validação própria e commit separado, conforme solicitado. A Fase 0 não cria commit. Nenhum commit será feito sem execução e aprovação das fases correspondentes.

## Testes de aceite e limites conhecidos

- **Automatizáveis:** seleção MIME/extension, estados e timer, timeout, composição simulada, falha parcial, recursos liberados, pausa/retomada e preservação dos arquivos existentes.
- **Browser desktop:** conteúdo do vídeo gravado, áudio paralelo sem mudança de volume, save/share e reprodução do arquivo.
- **Android Chrome e APK WebView:** captura, troca de câmera durante gravação, background, rotação, FPS e memória.
- **iOS Safari:** negociação MP4/WebM real, share sheet, interrupção/background, orientação e limites de gravação.
- **Critério de desempenho:** comparar FPS antes/depois no mesmo aparelho; diferença máxima solicitada de 3 fps. Sem aparelho mid-range e sessão de câmera não é possível declarar esse critério atendido.
- **Limite deste ambiente:** não há telefone ADB conectado nem emulador instalado; gravação de câmera, share sheet e reprodução física não foram testados. Todos esses itens continuarão explicitamente pendentes até haver dispositivos disponíveis.

## Aprovação necessária

Antes de iniciar a Fase 1, aprovar este mapeamento e decidir:

1. Entregar primeiro gravação manual e deixar Replay para uma fase posterior (recomendado), ou incluir muxer/WebCodecs agora.
2. Aceitar formatos validados por suporte real do navegador, sem garantia universal em todos os players/apps.

Não houve alteração de runtime nesta Fase 0.
