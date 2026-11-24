# Desempenho: antes e depois

## Método e limites

O script `scripts/bench-blobtrack.js` mede somente `BlobTrackerCore.updatePixels`: RGBA 320×180, duas regiões sintéticas móveis de 14×14, 30 quadros de aquecimento e 300 medidos em Node.js. Baseline: p50 `0,835 ms`, p95 `1,171 ms`, pico `3,924 ms`. O aceite congelado é p95 ≤ `8 ms`, p95 ≤ baseline × 1,15 (`1,347 ms`) e pico ≤ `16 ms`.

| Etapa | p50 (ms) | p95 (ms) | Pico (ms) | Observação |
|---|---:|---:|---:|---|
| Baseline anterior às mudanças | 0,835 | 1,171 | 3,924 | Node.js 26.13.1 |
| S3 IDs, amostra registrada | — | 1,096 | 4,459 | Uma medição pós-etapa |
| S5 ROI, duas amostras | — | 1,248 / 0,901 | — | Caminho padrão sem ROI também coberto |
| S6–S9, três medições registradas | 0,676 / 0,569 / 0,669 | 1,294 / 1,006 / 1,282 | 1,669 / 2,490 / 1,787 | Histórico deste ciclo |
| Execução final após S7 | 0,676 / 0,675 / 0,687 | 1,065 / 1,340 / 1,324 | 1,525 / 1,969 / 1,724 | Três execuções; abaixo do teto, uma próxima dele |

Não existe medição isolada “com gravação” nem “com S9” neste script. Ele não cria câmera, não compõe canvas e não grava vídeo. Não atribuir a esses recursos os tempos de `updatePixels` nem declarar ganho causal a partir de amostras em máquinas carregadas.

## Memória e caminho quente

As alterações do rastreador mantêm os arrays grandes reutilizados durante o mesmo tamanho de quadro e não adicionam alocação por pixel. ROI e grade usam buffers dimensionados em resize; calibração mantém `Float32Array` e `Uint8Array` no núcleo. A absorção S9 usa contador por trilho de blob, evitando os dois buffers de imagem completos do esboço inicial. Este documento não afirma redução medida do heap; heap e dispositivos físicos: **não medidos**.

## Escolhas não adotadas

- Threshold relativo para sombras: rampa 0→0,12 já fica abaixo do threshold global 0,18, portanto o cenário não provou redução de pelo menos 30% de máscara. Não foi adicionado um segundo caminho quente.
- Hungarian para atribuir IDs: a associação gulosa por custo preservou o teste de cruzamento acima da meta; não foi introduzida complexidade adicional.
- Anel de quadros completos, dependências de visão computacional e segundo ciclo de animação: fora de escopo e sem justificativa de medição.
- Ensaio inicial da grade adaptativa e soma completa de diferença de cena: excediam o orçamento; foram substituídos por cálculo esparso no caminho já amostrado e pela especialização do caminho sem ROI/calibração. Só a versão otimizada foi mantida.

## Como repetir

```powershell
node scripts/bench-blobtrack.js
```

Execute três vezes na mesma máquina/runtime e compare o mesmo cenário com os três limites. Se qualquer limite estourar, reverta a mudança responsável antes de continuar. Os números de computador não substituem [`device-matrix.md`](device-matrix.md).
