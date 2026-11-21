# Changelog — BlobTrack Celular-00

## 2026-11-21 — Ação inicial sem sobreposição

### Ajustado
- O início ganhou um cartão translúcido e responsivo; em celulares ele respeita o espaço livre acima do dock, em paisagem fica compacto, e no desktop evita a área do painel lateral.
- O botão “Ligar” permanece totalmente visível entre a barra superior e os controles.
- Cache do service worker atualizado para `v24`.

### Validação
- Browser preview: 320×480 e 320×569 em retrato, 641×391 em paisagem, 1441×900 em desktop e retrato com safe area simulada; em todos, o botão ficou fora da área do dock. Cache local `v24`: 14 assets disponíveis.
- APK debug recompilado; assinatura, alinhamento e paridade dos 15 assets Android com as fontes validados.
- APK atual instalado e aberto no AVD Pixel 6/API 35; a inspeção offline detalhada do Cache Storage v24 permanece pendente.
- Câmera/gravação real e verificação do cache `v24` no AVD ainda pendentes.

## 2026-11-21 — Menu translúcido e gravação rápida

### Aprimorado
- Dock e barra flutuante ganharam acabamento translúcido com desfoque, realces suaves em verde/azul/violeta e fallback legível sem suporte a `backdrop-filter`.
- A ação para iniciar/parar gravação e o botão para salvar agora ficam na faixa principal em todas as abas; o atalho de gravação permanece fixo ao rolar ações horizontalmente, e os estados gravando/pausado têm indicação visual própria.
- O cache do service worker passou para `v23` para publicar a interface atualizada.

### Validação
- `npm test`: 20/20 aprovados.
- Preview em navegador conferido em retrato (390×844), paisagem (844×390) e desktop (1440×900); a ação de gravação permaneceu visível também durante a rolagem horizontal. Câmera e gravação reais não foram exercitadas.
- APK debug recompilado com os assets atualizados; cache `v23` ainda precisa de verificação offline no AVD.

## 2026-11-21 — Robustez das preferências e compartilhamento

### Corrigido
- Preferências locais inválidas ou inacessíveis não interrompem mais a inicialização nem a restauração do modo palco.
- A captura do palco verifica se `navigator.share` existe antes de chamar a API e usa o download como fallback.
- Removidos estado e trechos de código sem uso identificados na revisão estática.
- WebView verifica suporte antes de configurar Service Worker; regras de backup mantêm os dados fora de backups Android.
- Removida a declaração explícita de orientação não necessária; mantido AndroidX WebKit 1.12.1 para preservar minSdk 23.

### Validação
- `npm test`: 20/20 aprovados; incluídos casos de JSON inválido, valor não objeto, storage indisponível e paridade de assets Android.
- Cache do service worker atualizado para `v22`; a lista não duplica a URL do diretório.
- APK Android passa a empacotar todos os arquivos usados pelo shell offline, incluindo a página de diagnóstico e seu script.
- Inventário inicial: nenhum arquivo rastreado faltante ou não rastreado; arquivos de runtime e ícone referenciados.
- Build Android concluída; lint sem erros e com dois avisos justificados.
- AVD Pixel 6/API 35 confirmou ativação do cache v22 e 14 assets disponíveis no Cache Storage com rede simulada offline.

## 2026-11-20 — Gravação manual de sessão

### Adicionado
- Gravação do palco composto (`#visual`, shade quando visível e `#overlay`) com resolução fixa no início, limite de 1280 px e letterbox ao mudar a orientação.
- Áudio sintetizado em uma ramificação opcional; pausa automática quando a página vai para segundo plano e retomada ao voltar.
- Indicadores e controles de gravação acessíveis; exportação por Web Share de arquivo, seletor de arquivo ou download.
- Negociação de MP4/WebM pelo suporte real e fallback quando o construtor do navegador rejeita um MIME anunciado.

### Validação
- `npm test`: 18/18 aprovados; `node --check` e `git diff --check` também passaram.
- Browser desktop com stream sintético produziu gravações de 28 s/4,2 MB e 1 s/0,1 MB; o controle de salvar foi habilitado. O evento de download/share sheet não foi confirmado pelo harness.
- APK debug recompilado; assinatura, alinhamento e hashes dos assets incluídos foram verificados.
- Cache PWA atualizado para `v20`; instalação/controlador confirmados, mas recarga offline da nova versão continua pendente. Replay permanece adiado.

## 2026-11-20 — Revisão, testes e distribuição

### Adicionado
- Suíte de regressão com `node:test` para rastreamento, limpeza de composição, shell offline e ciclo de visibilidade; comando `npm test`.

### Atualizado
- README, auditoria, registro de bugs e instruções Android sincronizados com o código daquela revisão, cache PWA `v19` e limites de validação.
- APK debug em `dist/` recompilado a partir dos assets atuais e validado; o artefato é rastreado pelo Git.

### Validação
- `npm test`: 7/7 aprovados; smoke test desktop sem erros de console, com WebGL2, quatro viewports e recarga PWA offline.
- APK debug recompilado; assinatura e alinhamento verificados, com hashes dos assets web iguais aos fontes.
- Não foi possível validar em aparelho: ADB não detectou dispositivo e não há emulador instalado.

## Melhorias já presentes no código

- Threshold do tracker normalizado antes da segmentação, inclusive para valores não finitos.
- Composição WebGL/Canvas 2D limpa ao encerrar ou trocar a câmera.
- Retomada de visibilidade usa `document.visibilityState`.
- Localizações de uniforms WebGL cacheadas; atualização do painel de medições limitada a 10 Hz.
- Buffers do tracker e envelopes das zonas reutilizados em caminhos quentes.
- Estados ARIA de tabs, filtros e toggles sincronizados; falhas de áudio/renderização têm feedback na interface.
- Service worker inclui os módulos necessários ao app offline e usa o cache `blobtrack-celular-00-v24`.
