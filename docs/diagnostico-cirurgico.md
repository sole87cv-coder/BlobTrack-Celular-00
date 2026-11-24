# Diagnóstico cirúrgico do BlobTrack

Atualizado em 24/11/2026. A validação manual de HTTPS foi informada como concluída com sucesso pelo usuário. Esta revisão não substitui teste em aparelho.

## Estado dos cinco achados

| Achado | Estado | Evidência / decisão |
|---|---|---|
| 1. Efeitos fracos com Janela viva | Corrigido em S8 | Janelas vivas agora compõem primeiro; rastros, ondas, grade e rede são desenhados acima delas. Teste de ordem confirma a composição. |
| 2. Objeto parado continua blob | Corrigido em S9 | Núcleo puro vem com absorção desligada; a aplicação usa K=8. Um componente estável deixa de ser emitido, e o fundo converge com fator 0,02. Movimento de 1 px/quadro reinicia a contagem. |
| 3. IDs perdem estabilidade em ausência/cruzamento | Corrigido em S3 | Associação por custo global com posição e caixa previstas, IoU, área e EMA de velocidade. Permite reidentificação em até três quadros ausentes. Commit `fdef2f0`. Seis novos testes passaram, incluindo cruzamento diagonal entre amostras, retorno e fórmula de velocidade preservada. |
| 4. Regiões muito pequenas/grandes | Por projeto | `minAreaRatio=0.00025`, piso de 6 pixels, `maxAreaRatio=0.72`. Em 320×180, o arredondamento atual exige pelo menos 14 pixels; componentes acima de 72% do quadro são rejeitados. Contornar aumentando a região no quadro ou enquadrando melhor. Não houve mudança de código. |
| 5. Efeitos pausam sem aviso visível | Corrigido em S8 | Badge de estado persistente no palco, anunciado como status acessível; o painel conserva a explicação de FPS e janela ativa. |

## Etapas e orçamento

- Baseline antes de mudanças funcionais: 148 testes aprovados; Node.js `v26.13.1`; quadro 320×180; duas regiões móveis 14×14; aquecimento 30 e medição 300; p95 `1,171 ms`, pico `3,924 ms`. O teto de comparação é p95 `1,347 ms` e pico `16 ms`.
- S3: seis testes novos e os testes congelados passaram. Uma medição pós-S3 foi p95 `1,096 ms`, pico `4,459 ms`.
- S4 de limiar adaptativo foi mantida após otimizar a atualização esparsa da grade. A suíte e medições passaram; evitar comparação com o ensaio inicial que excedeu o teto antes da otimização.
- S5 adicionou ROI geométrica opcional, aplicada somente quando há retângulos de seleção manual. Sem seleção, o processamento usa caminho de quadro inteiro. 170 testes aprovados; duas medições: p95 `1,248 ms` e `0,901 ms`, ambas abaixo do limite de `1,347 ms`.
- S9: absorção fica desativada por padrão no núcleo puro e usa K=8 na aplicação; o componente deixa de ser emitido após estabilidade, e a taxa de atualização do fundo é 0,02. IDs congelados e cruzamento linear permanecem verdes.
- S6: calibração da aplicação usa média de 8 quadros, ignora amostras acima do threshold, detecta mudança de cena por 40 quadros sem reset automático e publica métricas de FPS/análise/render/captura. A qualidade automática conserva os limites 12/180, passo de 80 px, piso 160 e teto do perfil; análise e render têm orçamentos separados. Três medições mais recentes: p95 `1,294 ms`, `1,006 ms`, `1,282 ms`; picos `1,669 ms`, `2,490 ms`, `1,787 ms`. Todos abaixo do orçamento.
- S8 compõe vídeo da janela viva, máscara e efeitos nessa ordem, e adiciona um badge persistente quando os efeitos são pausados. O shell offline foi atualizado para v39.
- O teste de sombra 0→0,12 não demonstrou redução de 30% contra threshold global 0,18, pois esses valores já ficam abaixo do threshold. Não foi introduzido um limiar relativo sem cenário que valide o benefício.

## Restante

Próximas prioridades: S7 revisar gravação e seus limites; S10 consolidar documentação e medições. S5 ROI, S6 calibração/orçamentos, S8 camadas/aviso e S9 absorção configurável foram concluídas.

O inventário de arquivos está em [`faxina-inventario.md`](./faxina-inventario.md). Nenhum arquivo do projeto foi removido ou movido. Os arquivos locais preexistentes de benchmark estão preservados no stash `codex: preserve pre-existing local files before BlobTrack work`.

Teste de câmera em aparelho, efeitos visuais reais, áudio/HUD, ROI com câmera real e botão Fundo: **não verificado neste turno**.
