# BlobTrack tracker benchmark

## Baseline antes das mudanças funcionais

- Commit de referência: `967714c` (`main`, 2 commits à frente de `origin/main`).
- Runtime informado pelo `node --version`: Node.js 26.13.1.
- Cenário: `BlobTrackerCore.updatePixels`, quadro RGBA 320 × 180, duas regiões móveis de 14 × 14 pixels sobre fundo uniforme.
- Aquecimento: 30 atualizações. Medição: 300 atualizações. Percentis por nearest rank.
- `node --test`: 148 aprovados, 0 falhas.
- Medição do script reproduzível: p50 `0,835 ms`, p95 `1,171 ms`, pico `3,924 ms`.

Essa medição sintética não representa câmera, composição, aquecimento ou desempenho em celular. O valor de p95 para comparação é `min(8 ms, 1,171 × 1,15) = 1,347 ms`; o pico máximo aceito é `16 ms`. Uma medição avulsa feita durante a preparação deu p95 diferente; para comparações futuras, use o script versionado e compare na mesma máquina e runtime.

## Como repetir

```powershell
node --test
node scripts/bench-blobtrack.js
```

Compare o mesmo cenário e runtime antes/depois de cada etapa. Se o p95 exceder `8 ms`, `1,15 × baseline` ou o pico exceder `16 ms`, reverta a etapa inteira.
