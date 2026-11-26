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
- O CSS inclui classe para conteúdo apenas para leitores de tela; os estilos da página de diagnóstico passaram para `teste.css`, incluído no PWA e no APK. **Nota de atualização (25/11/2026):** isto valia no cache `v34` da auditoria; o commit `5bc2b1e` (22/11) removeu `teste.html`, `teste.js` e `teste.css` do `SHELL` do service worker. Hoje o APK inclui os três, mas o cache offline não.
- Uma Content Security Policy foi adicionada às páginas e uma política de cabeçalhos ao `vercel.json`, com limites de câmera/microfone, bloqueio de incorporação externa, MIME estrito e política de referenciador. O microfone permanece desabilitado.
- O service worker atual usa cache v34 com 29 recursos, incluindo a navegação, as escalas e os recursos de marca web. A limpeza de cache apaga apenas versões anteriores do prefixo técnico; o fallback offline continua restrito à navegação e falhas de módulos/scripts não são substituídas por HTML.

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
- `teste.css` é agora asset separado e necessário; `src/domain/blobTrackerCore.js` é importado pelo adaptador. Ambos faziam parte do shell e do pacote Android na auditoria; desde `5bc2b1e`, `teste.*` segue só no pacote Android e é servido pelo deploy, sem entrar no cache offline (`sw.js` em `v59` no site). `blobTrackerCore.js` continua no shell.
- Revisar a configuração de cabeçalhos no ambiente efetivamente usado se a publicação não ocorrer na Vercel; `vercel.json` só configura deploys Vercel.
## Decisão — escalas musicais no painel de áudio

As escalas Livre, Menor, Estranho e Tenso atuam somente na tabela `baseFrequency` do AudioWorklet. Livre preserva exatamente os seis semitons existentes. A seleção usa a chave separada `blobtrack-celular-00-scale`; ausência ou valor inválido mantém Livre sem gravar preferência. Não foram alterados tracker, gravação, Android ou APK. A prévia usa somente um AudioContext que já esteja em execução e termina em dois segundos. O cache offline foi atualizado para v34 e inclui os três módulos de escala. Validação final: `npm test` passou com 147 testes; `node --check` passou em todos os JavaScript alterados; service worker v34 tem 29 recursos e nenhum caminho ausente. O servidor HTTP foi iniciado, mas a requisição local foi bloqueada pelas permissões de soquete deste ambiente; para teste manual, execute `python -m http.server 4173 --bind 127.0.0.1` na raiz do projeto e abra `http://localhost:4173/`. Câmera, Bluetooth e tela bloqueada ainda exigem teste em aparelho físico.
## Diagnóstico geral de release — 22/11/2026

- Estado local: commit `170e620` na branch `main`; a referência local `origin/main` está um commit atrás. O checkout estava limpo durante a inspeção. O Vercel publicado ainda não foi verificado.
- Estrutura e integridade: não encontrei arquivos de código vazios ou truncados. Os arquivos `.js` em `src/` e `tests/` passaram em `node --check`; os JSONs de pacote, manifesto e Vercel são válidos. Os testes de IDs HTML únicos, import graph e shell offline permanecem aprovados.
- Verificação automatizada: `npm test` — 147 aprovados, 0 falhas. O projeto não declara dependências npm externas nem script de build web; o PWA é servido como arquivos estáticos.
- Service worker: v34, 29 recursos, 240.752 bytes sem compressão; todos os caminhos do shell existem.
- APK: recompilado pelo script existente; Gradle `assembleDebug` terminou com BUILD SUCCESSFUL. O pacote atualizado tem 1.269.525 bytes, 81 entradas, painel `audioScales`, os três módulos de escala e service worker v34. `apksigner verify` confirmou assinatura debug válida (esquemas v1 e v2). O build emitiu um aviso de compatibilidade entre versões do SDK XML, sem falha. A PWA de Vercel e o APK continuam sendo vias de teste distintas; não foi instalado em aparelho físico.
- Vercel: `.vercelignore` mantém fora do deploy Android, dist/APK, docs e tests; `vercel.json` define cabeçalhos de segurança, cache e permissões; a documentação oficial descreve `headers[].source` como um padrão de rota. Este checkout não tem vínculo `.vercel`, CLI `vercel` ou URL publicada localizável, então o deployment e os cabeçalhos recebidos pelo celular seguem pendentes de verificação. A referência de configuração é a [documentação oficial de `vercel.json`](https://vercel.com/docs/project-configuration/vercel-json).
- Organização: o APK é versionado apesar da regra ampla anterior `dist/`; a regra foi ajustada para preservar esse APK e continuar ignorando os demais arquivos gerados em `dist/`. Arquivos `teste.*`, relatórios e planos são referenciados/documentados ou servem a validação; nenhum foi removido por parecer inútil.
- Limite da validação: não houve teste em câmera, áudio Bluetooth, tela bloqueada, leitor de tela ou aparelho físico. O commit local ainda precisa ser enviado manualmente antes de poder ser validado pelo Vercel.