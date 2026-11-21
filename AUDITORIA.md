# Auditoria técnica — BlobTrack Celular-00

Revisão do estado do projeto em 21/11/2026. A árvore estava limpa antes desta revisão; a branch local era `main`, sem divergência reportada em relação a `origin/main`. O inventário inclui o PWA, os fontes Android, os documentos e o APK debug rastreado. A auditoria é estática e não equivale a teste de hardware.

## Arquitetura e estado

- `index.html` carrega `src/app.css` e `src/app.js`; o app importa o tracker e o helper de limpeza.
- `src/app.js` coordena câmera, captura de frame, análise, envelopes compartilhados, renderização WebGL/Canvas 2D, áudio, interface e ciclo de sessão.
- `src/recorder.js`, `src/recording-canvas.js` e `src/recording-export.js` isolam gravação, composição do palco e exportação manual.
- `src/preferences.js` valida a leitura das preferências locais e retorna defaults se o valor estiver corrompido.
- `src/blob-tracker.js` faz diferença de luminância, componentes conectados e associação gulosa de IDs. `src/audio-processor.js` executa a síntese no AudioWorklet.
- `sw.js` pré-cacheia a interface, os módulos usados em runtime, o manifesto, o ícone e a página de diagnóstico. A versão de cache atual é `v24`; shell estático: **155.694 bytes sem compressão**.
- `android/` empacota os assets web por `WebViewAssetLoader`. `dist/BlobTrack-Celular-00-debug.apk` é rastreado pelo Git; `android/build-apk.ps1` o substitui quando recompila.
- O código de interface e ciclo de vida permanece concentrado em `src/app.js`; a suíte Node testa módulos isolados e regressões selecionadas, não toda a UI.
- O inventário inicial tinha 34 arquivos rastreados, sem faltantes ou arquivos não rastreados. Todos os fontes de runtime em `src/` e o ícone tinham referências; `teste.html` é o diagnóstico acessível, e o APK em `dist/` é um artefato de distribuição rastreado, não órfãos. `.vs/` e `android/.local-build/` são diretórios locais ignorados.

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
| Shell Android incompleto | A página de diagnóstico e seu script agora são incluídos nos assets Android; a entrada de diretório duplicada foi removida | Teste compara todos os assets do shell com os padrões `include` do Gradle e build empacotado |
| Preferências locais corrompidas | JSON inválido, conteúdo que não é objeto e storage indisponível retornam defaults; o app lê as preferências uma vez | Teste unitário dedicado |
| IDs entre frames e reset do fundo | Estado do tracker coberto por fixtures sintéticas | Testes de continuidade e reset |

`npm test` passou com 20 testes. O projeto não requer dependências npm externas. A cobertura não simula permissões, câmera, áudio do aparelho ou interrupções do sistema.

## Riscos e limites

- `getImageData()` e flood fill percorrem os pixels em cada análise. A resolução adaptativa reduz o trabalho, mas FPS, latência, memória e consumo não foram medidos em celular.
- Mudanças abruptas de iluminação podem criar componentes falsos; movimento sustentado, blobs que se tocam e rastreamento por distância podem causar perda ou troca de identidade.
- A composição de vídeo, Gear VR, rotação e acessibilidade foram revisadas estaticamente; não houve validação visual em aparelhos nem medição formal de contraste.
- Resolução/fps codificados dependem do canvas, câmera e WebView; a gravação não promete 1080p e pode ficar sem áudio se `MediaStreamAudioDestinationNode` não estiver disponível. O tamanho de saída é limitado a 1280 px no lado maior, 10 minutos e 350 MiB.
- Permissões, seleção de lente, retomada de câmera/áudio, Wake Lock e tela cheia variam conforme navegador e versão do Android/iOS.
- O APK é debug. A build do Android pode emitir aviso de compatibilidade do SDK XML v4 com as ferramentas locais.
- `lintDebug` mantém dois avisos: JavaScript habilitado é necessário ao app local, e WebKit 1.18 requer API 24; foi mantido WebKit 1.12.1 para preservar `minSdk 23`.
- O compartilhamento de captura agora verifica a presença de `navigator.share` antes de usar a Web Share API e mantém o download como fallback.
- O dock e a barra flutuante usam fundos translúcidos com desfoque e acentos da paleta reativa. A ação de gravação e o salvamento ficam na faixa principal do dock, fora das abas; o atalho de gravação permanece fixo ao rolar a faixa.
- O cartão inicial usa o espaço livre entre a barra superior e o dock no celular e se mantém fora da área do painel lateral em desktop; o botão “Ligar” não fica encoberto pelos controles.

## Validação executada nesta revisão

- `npm test`: **20/20 aprovados**; inclui preferências inválidas, referências do shell Android, seleção/fallback MIME, limites, pausa, composição e exportação.
- `node --check` passou para os scripts e `git diff --check` não reporta erros de whitespace.
- `:app:assembleDebug` e `:app:lintDebug`: build aprovada, **0 erros e 2 avisos**; os avisos restantes são JavaScript necessário e dependência mais recente incompatível com `minSdk 23`.
- O APK em `dist/` foi regenerado com a interface atualizada; assinatura verificada por `apksigner`, alinhamento validado por `zipalign` e os 14 assets do shell, além de `sw.js`, comparados com as fontes. SHA-256: `601EADB801051868DFFE0DFBA54B0BD14FEB77195790A291F76BB1B9C1E5C202`.
- AVD Pixel 6/API 35: APK instalado e iniciado; service worker `v22` ativado, cache com 14/14 assets e todos os 14 `Cache.match()` responderam offline com status 200 e MIME esperado.
- APK atual instalado e iniciado no AVD Pixel 6/API 35; a atividade principal permaneceu ativa. Isso não confirma individualmente os itens do Cache Storage `v24`, nem exercita câmera/gravação.
- Preview da interface atualizada em navegador: 320×480 e 320×569 em retrato, 641×391 em paisagem e 1441×900 em desktop; safe areas também foram simuladas. O botão “Ligar” ficou visível entre barra e dock e fora do painel lateral. Cache local `v24` contém 14 assets; verificação em AVD e gravação/câmera real ainda pendentes.
- A recarga offline do appassets exibiu o shell, mas o novo documento ficou sem controller do service worker e foi servido pelo `WebViewAssetLoader`; isso não substitui a recarga offline de uma PWA publicada em Chrome.
- Smoke tests de browser desktop, gravação sintética e instalação do cache v20 são resultados anteriores de 20/11.
- Build-tools reportaram que o SDK XML versão 4 excede o formato conhecido pela ferramenta local (até versão 3). É um aviso de compatibilidade, não uma falha de build.
- ADB: nenhum aparelho físico estava conectado. O AVD acelerado foi encerrado após o teste e permanece disponível em `android/.local-build/avd/BlobTrackCacheV22_API35`; testes físicos continuam pendentes.
- O smoke test de browser anterior não iniciou câmera nem áudio e não substitui a matriz física abaixo.

## Pendências para aparelho real

Com depuração USB habilitada e aparelho conectado, instalar `dist/BlobTrack-Celular-00-debug.apk` e validar:

1. Permitir/negar câmera; iniciar, parar e iniciar novamente.
2. Trocar frontal/traseira; confirmar que a composição antiga some antes do novo frame.
3. Alternar filtros, máscara, overlay, janelas, captura e os efeitos reativos.
4. Verificar som, mudo, timbres, Eco/Espaço/Chorus e interrupção/retomada.
5. Suspender e restaurar o app; girar a tela e repetir ciclos de sessão.
6. Confirmar instalação/offline, saída do modo Gear VR e layout em 360×640, 390×844, 412×915 e 844×390.

Não declarar metas de FPS, boot ou memória atendidas sem esses dados. Para atualizar a validação, registrar modelo do aparelho, versão do sistema/WebView, passos executados e resultados observados.
