# Changelog — BlobTrack Celular-00

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
- Service worker inclui os módulos necessários ao app offline e usa o cache `blobtrack-celular-00-v20`.
