# Índice da documentação

Comece aqui para encontrar explicações sem precisar abrir todo o repositório. Nenhum destes arquivos roda no app: mexer neles não altera o instrumento.

## Começar

| Documento | Quando ler |
|---|---|
| [`../README.md`](../README.md) | Instalar, rodar em `http://localhost:8000`, entender o mapa do projeto e o semáforo de manutenção. |
| [`diagnostico-atual.md`](diagnostico-atual.md) | Estado atual de erros, permissões, desempenho e organização, com as rodadas v85–v93 (27/11/2026). |
| [`faxina-inventario.md`](faxina-inventario.md) | Inventário de arquivos e por que `teste.*`, caches e artefatos foram mantidos. |

## Diagnóstico e decisões

| Documento | Quando ler |
|---|---|
| [`diagnostico-cirurgico.md`](diagnostico-cirurgico.md) | Os cinco achados corrigidos (efeitos, blob parado, IDs, ROI, escalas) e o orçamento congelado. |
| [`perf-antes-depois.md`](perf-antes-depois.md) | Histórico de medições por cache (`v34` → `v60`, publicado) e pendência do Pacote 3. |
| [`blobtrack-benchmark.md`](blobtrack-benchmark.md) | Como reproduzir o benchmark do núcleo e o que os números significam. |
| [`device-matrix.md`](device-matrix.md) | Matriz de aparelhos, pré-checagem no emulador Android e o que ainda depende de teste físico. |

## Histórico

| Documento | Quando ler |
|---|---|
| [`historico/`](historico/) | Relatórios encerrados: auditoria, bugs de crop, changelog e plano de gravação. Preservados, não são instrução atual. |

## Uso específico

| Documento | Quando ler |
|---|---|
| [`gravacao.md`](gravacao.md) | Gravação de vídeo, composição e exportação. |
| [`ui/`](ui/) | Notas de interface e acessibilidade. |
| [`../android/README.md`](../android/README.md) | Projeto WebView, requisitos e geração do APK debug. |

## Convenção de semáforo

- 🟢 pode mexer: aparência, textos, documentação.
- 🟡 meça e teste: controles, perfil do aparelho, gravação, número do cache do `sw.js`.
- 🔴 contrato congelado: `src/domain/blobTrackerCore.js`, assinatura de `src/blob-tracker.js`, testes de contrato, estratégia de cache e `android/`.

Regra prática: uma mudança por vez, rode `npm test` e `git diff --check`, e registre **não medido** quando não houver aparelho físico.
