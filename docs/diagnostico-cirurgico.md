# Diagnóstico cirúrgico do BlobTrack

Atualizado em 24/11/2026. A validação manual de HTTPS foi informada como concluída com sucesso pelo usuário. Esta revisão não substitui teste em aparelho.

## Estado dos cinco achados

| Achado | Estado | Evidência / decisão |
|---|---|---|
| 1. Efeitos fracos com Janela viva | Corrigido em S8 | Janelas vivas agora compõem primeiro; rastros, ondas, grade e rede são desenhados acima delas. Teste de ordem confirma a composição. |
| 2. Objeto parado continua blob | Corrigido em S9 | O fundo adapta o componente rastreado após oito quadros estáveis. Movimento contínuo de 1 px/quadro reinicia a janela; testes confirmam absorção e recuperação sem blob fantasma em até 20 quadros após remoção. |
| 3. IDs perdem estabilidade em ausência/cruzamento | Corrigido em S3 | Associação por custo global com posição e caixa previstas, IoU, área e EMA de velocidade. Permite reidentificação em até três quadros ausentes. Commit `fdef2f0`. Seis novos testes passaram, incluindo cruzamento diagonal entre amostras, retorno e fórmula de velocidade preservada. |
| 4. Regiões muito pequenas/grandes | Por projeto | `minAreaRatio=0.00025`, piso de 6 pixels, `maxAreaRatio=0.72`. Em 320×180, o arredondamento atual exige pelo menos 14 pixels; componentes acima de 72% do quadro são rejeitados. Contornar aumentando a região no quadro ou enquadrando melhor. Não houve mudança de código. |
| 5. Efeitos pausam sem aviso visível | Corrigido em S8 | Badge de estado persistente no palco, anunciado como status acessível; o painel conserva a explicação de FPS e janela ativa. |

## Etapas e orçamento

- Baseline antes de mudanças funcionais: 148 testes aprovados; Node.js `v26.13.1`; quadro 320×180; duas regiões móveis 14×14; aquecimento 30 e medição 300; p95 `1,171 ms`, pico `3,924 ms`. O teto de comparação é p95 `1,347 ms` e pico `16 ms`.
- S3: seis testes novos e os testes congelados passaram. Uma medição pós-S3 foi p95 `1,096 ms`, pico `4,459 ms`.
- S4 de limiar adaptativo foi mantida após otimizar a atualização esparsa da grade. A suíte e medições passaram; evitar comparação com o ensaio inicial que excedeu o teto antes da otimização.
- S5 adicionou ROI geométrica opcional, aplicada somente quando há retângulos de seleção manual. Sem seleção, o processamento usa caminho de quadro inteiro. 170 testes aprovados; duas medições: p95 `1,248 ms` e `0,901 ms`, ambas abaixo do limite de `1,347 ms`.
- S9 substituiu adaptação por pixel por persistência do componente rastreado para não absorver blobs que ainda se deslocam. 171 testes aprovados; duas medições atuais: p95 `0,697 ms` e `0,674 ms`, picos `1,133 ms` e `1,281 ms`.
- S6 calibra resolução e FPS de análise em conjunto: reduz resolução primeiro após 12 quadros acima do orçamento; no mínimo de 160 px reduz FPS em passos de 2 até 12; recupera resolução após 180 quadros rápidos e FPS só no limite máximo da resolução. 175 testes aprovados; benchmark-base recente p95 `0,677 ms`, pico `1,341 ms`.
- S8 moveu a Janela viva para baixo dos efeitos gráficos e adicionou um badge persistente quando os efeitos são pausados. 177 testes aprovados; benchmark p95 `0,700 ms`, pico `1,048 ms`. O shell offline foi atualizado para v37.
- O teste de sombra 0→0,12 não demonstrou redução de 30% contra threshold global 0,18, pois esses valores já ficam abaixo do threshold. Não foi introduzido um limiar relativo sem cenário que valide o benefício.

## Restante

Próximas prioridades: S7 revisar gravação e seus limites; S10 consolidar documentação e medições. S5 ROI, S6 qualidade adaptativa, S8 camadas/aviso e S9 adaptação de objetos parados foram concluídas.

O inventário de arquivos está em [`faxina-inventario.md`](./faxina-inventario.md). Nenhum arquivo do projeto foi removido ou movido. Os arquivos locais preexistentes de benchmark estão preservados no stash `codex: preserve pre-existing local files before BlobTrack work`.

Teste de câmera em aparelho, efeitos visuais reais, áudio/HUD, ROI com câmera real e botão Fundo: **não verificado neste turno**.
