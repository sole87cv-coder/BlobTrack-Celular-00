# Relatório de implementação — BlobTrack Celular-00

**Data:** 22/11/2026
**Projeto:** `C:\Users\sole8\OneDrive\Documentos\GitHub\BlobTrack Celular`
**Escopo:** implementação aprovada de correções e melhorias técnicas, execução de testes, verificação do APK em Android API 35 e atualização documental.
**Resultado geral:** correções e melhorias de software implementadas; 107 testes aprovados; build e lint Android aprovados; APK instalado e aberto no emulador. As validações que exigem celular físico, câmera real, leitor de tela e PWA publicada permanecem identificadas como pendentes.

## 1. Descrição e propósito

BlobTrack Celular-00 é um instrumento audiovisual mobile-first. A câmera fornece quadros de vídeo em baixa resolução; o software estima o fundo, detecta regiões em movimento e rastreia componentes (“blobs”). Os sinais de energia, densidade, velocidade, coerência e atividade por zona modulam os efeitos visuais e a síntese de áudio. O usuário pode capturar o palco, gravar vídeo com áudio sintetizado e exportar o resultado.

O rastreio mede movimento na imagem, não profundidade nem identidade de objetos. Um objeto parado pode se incorporar ao fundo; variações de iluminação podem gerar movimento aparente. O app funciona como PWA e como APK Android baseado em WebView local.

### Fluxo de execução

1. `index.html` carrega estilos, metadados PWA e `src/app.js`.
2. O app obtém permissão e quadros da câmera; o adaptador em `src/blob-tracker.js` reduz o frame e lê os pixels pelo Canvas.
3. `src/domain/blobTrackerCore.js` processa o buffer RGBA sem depender de DOM ou câmera: segmenta movimento, agrupa componentes, associa IDs e calcula zonas/sinais.
4. `src/render/render.js` compõe o palco WebGL/Canvas 2D; `src/audio/audio.js` coordena o AudioWorklet e os efeitos sintetizados.
5. `src/recorder.js`, `src/recording-canvas.js` e `src/recording-export.js` gravam e exportam a composição.
6. `sw.js` pré-armazena os recursos locais para uso offline. A aplicação Android empacota as mesmas fontes por `WebViewAssetLoader`.

O projeto não depende de backend nem de serviços remotos em runtime. Não há dependências npm externas; `npm test` usa o executor nativo do Node.

## 2. Melhorias implementadas

### P0 — inicialização e estado

- Movida a criação do renderer para depois da inicialização dos dados que ele captura; isso elimina acesso a `const` ainda não inicializadas que impedia carregar o módulo principal.
- O estado de gravação agora atualiza o mesmo objeto compartilhado com o renderer, evitando que a composição leia um snapshot antigo e permaneça em estado incorreto.
- O app passou a usar as factories de áudio e bloqueio de sessão já existentes, removendo implementações paralelas do caminho de produção.
- O Wake Lock é mantido por um serviço que registra o sentinel, trata pedidos concorrentes, libera ao parar/ocultar a página e tenta reativar ao retornar para primeiro plano.

### P1 — acessibilidade, segurança e offline

- A viewport móvel permite ampliar a página com zoom.
- As abas agora expõem relações tab/tablist/tabpanel, seleção, foco móvel e navegação pelas setas, Home e End.
- O canvas visual tem nome e descrição textual; um resumo anuncia mudanças na quantidade de regiões sem inundar o leitor de tela.
- O indicador de zonas apresenta atividade em texto acessível. O controle de retângulo também pode ser usado por teclado: setas posicionam o cursor, Enter marca os cantos, Shift acelera e Escape cancela.
- O CSS inclui classe para conteúdo apenas para leitores de tela; os estilos da página de diagnóstico passaram para `teste.css`, incluído no PWA e no APK.
- Uma Content Security Policy foi adicionada às páginas e uma política de cabeçalhos ao `vercel.json`, com limites de câmera/microfone, bloqueio de incorporação externa, MIME estrito e política de referenciador. O microfone permanece desabilitado.
- O service worker usa cache v28 com 22 assets. A limpeza de cache apaga apenas versões anteriores do próprio BlobTrack, aguarda escrita no Cache Storage, limita o fallback offline à navegação e deixa falhas de módulos/scripts visíveis em vez de responder HTML.

### P2 — separação e manutenção

- O núcleo de rastreio foi extraído para `src/domain/blobTrackerCore.js`, recebendo apenas dimensões e pixels RGBA. A camada de câmera ficou como adaptador fino em `src/blob-tracker.js`.
- Foram adicionados testes de regressão para acessibilidade, inicialização do app, serviço de Wake Lock, comportamento do service worker e núcleo puro do tracker.
- O README e este relatório foram atualizados; versões e números de assets antigos foram removidos do trecho de validação atual.

## 3. Verificações e resultados

| Verificação | Resultado |
|---|---|
| `npm test` | **107 aprovados, 0 falhas** |
| `node --check src/app.js` | Aprovado |
| `node --check src/domain/blobTrackerCore.js` | Aprovado |
| `node --check src/render/render.js` | Aprovado |
| `git diff --check` | Sem erros de whitespace; Git pode avisar que normalizará LF/CRLF conforme configuração local |
| Shell offline | 22 assets existentes e únicos, **170.519 bytes sem compressão** |
| Build `:app:assembleDebug` | **BUILD SUCCESSFUL** |
| Android `:app:lintDebug` | **BUILD SUCCESSFUL**; sem erro de lint reportado |
| APK instalado no emulador Android API 35 | Instalação concluída; atividade `MainActivity` permaneceu no topo |
| Inicialização WebView | WebView 124 abriu a tela principal; inspeção visual do emulador sem falha de layout evidente |
| Conteúdo APK | Confirmados `index.html`, `sw.js`, `teste.css`, `src/domain/blobTrackerCore.js` e `src/platform/wakeLock.js` |

Comandos reproduzíveis (PowerShell):

```powershell
npm test
node --check src/app.js
node --check src/domain/blobTrackerCore.js
Set-Location android
.\build-apk.ps1
```

O build emitiu um aviso das ferramentas Android: um arquivo SDK XML versão 4 foi lido por ferramenta que reconhece até a versão 3. A compilação não falhou; o alerta indica diferença de versão entre ferramentas SDK locais.

**APK debug gerado:** `dist/BlobTrack-Celular-00-debug.apk`
**SHA-256:** `F37B86FC5659C83E07DA275FF8195F6AC8854746597C7BBEF05957AE9E085736`
**Versão:** 0.0.1; minSdk 23; targetSdk 35. O APK anterior foi preservado separadamente antes do build.

## 4. Prioridades e pendências restantes

As pendências abaixo dependem de equipamentos ou ambiente publicado e não podem ser declaradas resolvidas com segurança por teste sintético/emulador:

| Prioridade | Validação pendente | Critério de aceite |
|---|---|---|
| P1 | Celular real: permissão de câmera, iniciar/parar/reiniciar, alternar frontal/traseira e rotação | Sem crash; composição e tracker acompanham a câmera correta em sessões repetidas |
| P1 | PWA publicada em HTTPS: primeira carga e recarga offline em Chrome/Safari compatíveis | Depois da instalação/carregamento inicial, navegação principal funciona sem rede e assets não recebem fallback HTML indevido |
| P1 | Áudio e gravação em dispositivo real, incluindo interrupção/suspensão e exportação | Sem captura de microfone; retomada/pausa coerente; vídeo e áudio reproduzíveis; compartilhamento/download funcionam |
| P1 | Leitores de tela TalkBack e VoiceOver, navegação completa por teclado e ampliação | Fluxos essenciais são anunciados, focáveis e operáveis; zoom continua disponível; contraste AA verificado manualmente nas combinações da UI |
| P2 | Desempenho, aquecimento e consumo em aparelhos de baixo/médio desempenho | Registrar FPS sustentado, resolução, duração e dispositivo; ajustar perfil se houver degradação observada |
| P2 | Wake Lock em celulares/browser reais | Tela permanece ativa apenas durante sessão permitida e libera ao parar, ocultar ou encerrar |

O teste no emulador comprova empacotamento, instalação e abertura, mas não substitui câmera física, permissões reais, leitor de tela nem autonomia. Não foram publicados arquivos nem feito commit/push.

## 5. Estado de manutenção

- Não foram apagados arquivos do projeto nem removidos os APKs locais. O APK anterior ao build foi copiado para a pasta de resultados desta tarefa.
- O repositório já continha alterações locais e módulos não rastreados quando o trabalho começou. Eles foram preservados; não houve reset, staging, commit ou push.
- `teste.css` é agora asset separado e necessário; `src/domain/blobTrackerCore.js` é importado pelo adaptador. Ambos fazem parte do shell e do pacote Android.
- Revisar a configuração de cabeçalhos no ambiente efetivamente usado se a publicação não ocorrer na Vercel; `vercel.json` só configura deploys Vercel.