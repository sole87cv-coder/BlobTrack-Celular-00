# Auditoria técnica — BlobTrack Celular-00

Revisão do estado do projeto em 20/11/2026. A árvore estava limpa antes desta revisão; a branch local era `main`, sem divergência reportada em relação a `origin/main`. O inventário inclui o PWA, os fontes Android, os documentos e o APK debug rastreado. A auditoria é estática e não equivale a teste de hardware.

## Arquitetura e estado

- `index.html` carrega `src/app.css` e `src/app.js`; o app importa o tracker e o helper de limpeza.
- `src/app.js` coordena câmera, captura de frame, análise, envelopes compartilhados, renderização WebGL/Canvas 2D, áudio, interface e ciclo de sessão.
- `src/recorder.js`, `src/recording-canvas.js` e `src/recording-export.js` isolam gravação, composição do palco e exportação manual.
- `src/blob-tracker.js` faz diferença de luminância, componentes conectados e associação gulosa de IDs. `src/audio-processor.js` executa a síntese no AudioWorklet.
- `sw.js` pré-cacheia a interface, os módulos usados em runtime, o manifesto, o ícone e a página de diagnóstico. A versão de cache atual é `v20`; shell estático: **166.381 bytes sem compressão**.
- `android/` empacota os assets web por `WebViewAssetLoader`. `dist/BlobTrack-Celular-00-debug.apk` é rastreado pelo Git; `android/build-apk.ps1` o substitui quando recompila.
- O código de interface e ciclo de vida permanece concentrado em `src/app.js`; a suíte Node testa módulos isolados e regressões selecionadas, não toda a UI.

## Correções e regressões verificadas

| Item | Estado atual | Verificação |
|---|---|---|
| Threshold inválido (`NaN`) | `BlobTracker.update()` usa valor seguro | Teste sintético detecta seis blobs |
| Composição antiga após parar/trocar câmera | `stopMedia()` chama `clearVideoComposition()` | Testes unitários verificam limpeza WebGL e Canvas 2D; troca física pendente |
| Retorno da aba em primeiro plano | O código consulta `document.visibilityState` | Teste de regressão estático cobre as duas condições; retomada real pendente |
| Composição e orientação da gravação | Canvas offscreen combina visual, shade, overlay e letterbox em dimensões fixas (máximo 1280 px) | Testes sintéticos cobrem ordem, aspecto e limite; orientação física pendente |
| Gravação em segundo plano | MediaRecorder pausa em `hidden` e retoma em `visible`; troca de câmera conserva a sessão | Testes do recorder cobrem pausa e relógio; ciclo de câmera em aparelho pendente |
| Exportação | Share de arquivo, seletor nativo e download usam MIME/extensão negociados | Testes Node cobrem os três caminhos; share sheet e reprodução física pendentes |
| Assets offline | Recursos de runtime estão listados no shell | Teste compara os recursos requeridos e confirma que existem |
| IDs entre frames e reset do fundo | Estado do tracker coberto por fixtures sintéticas | Testes de continuidade e reset |

`npm test` passou com 18 testes. O projeto não requer dependências npm externas. A cobertura não simula permissões, câmera, áudio do aparelho ou interrupções do sistema.

## Riscos e limites

- `getImageData()` e flood fill percorrem os pixels em cada análise. A resolução adaptativa reduz o trabalho, mas FPS, latência, memória e consumo não foram medidos em celular.
- Mudanças abruptas de iluminação podem criar componentes falsos; movimento sustentado, blobs que se tocam e rastreamento por distância podem causar perda ou troca de identidade.
- A composição de vídeo, Gear VR, rotação e acessibilidade foram revisadas estaticamente; não houve validação visual em aparelhos nem medição formal de contraste.
- Resolução/fps codificados dependem do canvas, câmera e WebView; a gravação não promete 1080p e pode ficar sem áudio se `MediaStreamAudioDestinationNode` não estiver disponível. O tamanho de saída é limitado a 1280 px no lado maior, 10 minutos e 350 MiB.
- Permissões, seleção de lente, retomada de câmera/áudio, Wake Lock e tela cheia variam conforme navegador e versão do Android/iOS.
- O APK é debug. A build do Android pode emitir avisos do SDK sem falhar; o aviso observado sobre versão do XML do SDK precisa ser acompanhado ao atualizar as ferramentas.

## Validação executada nesta revisão

- `npm test`: **18/18 aprovados**; inclui seleção/fallback MIME, limites, pausa, composição e exportação.
- Browser desktop em `localhost`: app carregou com WebGL2; sem erros de console ou exceções. Tabs e estados ARIA responderam. Não houve overflow horizontal nos viewports 360×640, 390×844, 412×915 e 844×390.
- Browser desktop com stream sintético: gravação manual de 28 s produziu Blob de 4,2 MB e habilitou salvar. A reprodução do arquivo, share sheet e áudio físico não foram verificados.
- PWA desktop: service worker `blobtrack-celular-00-v20` foi instalado e controlou a página; a lista de cache inclui os módulos de gravação. Recarga offline com essa versão ainda não foi confirmada.
- APK: build debug concluída; assinatura verificada por `apksigner`, alinhamento validado por `zipalign`, e hashes de `index.html`, `sw.js` e dos módulos de gravação empacotados conferem com os fontes. SHA-256 do APK: `8DD5EE4A99D72E0929E3ACBE8AC5A0A4F0B11DA7E04432E70B8AC97C8ADBEE70`.
- Build-tools reportaram que o SDK XML versão 4 excede o formato conhecido pela ferramenta local (até versão 3). É um aviso de compatibilidade, não uma falha de build.
- ADB: `adb devices -l` não listou aparelho conectado; o SDK local não contém emulador. Portanto, **nenhum teste em aparelho foi executado**.
- O smoke test de browser não iniciou câmera nem áudio e não substitui a matriz física abaixo.

## Pendências para aparelho real

Com depuração USB habilitada e aparelho conectado, instalar `dist/BlobTrack-Celular-00-debug.apk` e validar:

1. Permitir/negar câmera; iniciar, parar e iniciar novamente.
2. Trocar frontal/traseira; confirmar que a composição antiga some antes do novo frame.
3. Alternar filtros, máscara, overlay, janelas, captura e os efeitos reativos.
4. Verificar som, mudo, timbres, Eco/Espaço/Chorus e interrupção/retomada.
5. Suspender e restaurar o app; girar a tela e repetir ciclos de sessão.
6. Confirmar instalação/offline, saída do modo Gear VR e layout em 360×640, 390×844, 412×915 e 844×390.

Não declarar metas de FPS, boot ou memória atendidas sem esses dados. Para atualizar a validação, registrar modelo do aparelho, versão do sistema/WebView, passos executados e resultados observados.
