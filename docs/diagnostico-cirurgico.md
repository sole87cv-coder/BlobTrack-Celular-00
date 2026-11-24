# Diagnóstico cirúrgico do BlobTrack

Atualizado em 24/11/2026. A validação manual de HTTPS foi informada como concluída com sucesso pelo usuário. Esta revisão não substitui teste em aparelho.

## Estado dos cinco achados

| Achado | Estado | Evidência / decisão |
|---|---|---|
| 1. Efeitos fracos com Janela viva | Pendente | `drawMaskOverlay` desenha os efeitos reativos antes de `drawRawVideoWindows`; a janela pode cobrir o centro das ondas e partes da grade. S8 não foi iniciada porque a etapa S4 disparou a regra de parada. |
| 2. Objeto parado continua blob | Pendente | O fundo só se adapta onde `mask[index]` é zero. S9 não foi iniciada. |
| 3. IDs perdem estabilidade em ausência/cruzamento | Corrigido em S3 | Associação por custo global com posição e caixa previstas, IoU, área e EMA de velocidade. Permite reidentificação em até três quadros ausentes. Commit `fdef2f0`. Seis novos testes passaram, incluindo cruzamento diagonal entre amostras, retorno e fórmula de velocidade preservada. |
| 4. Regiões muito pequenas/grandes | Por projeto | `minAreaRatio=0.00025`, piso de 6 pixels, `maxAreaRatio=0.72`. Em 320×180, o arredondamento atual exige pelo menos 14 pixels; componentes acima de 72% do quadro são rejeitados. Contornar aumentando a região no quadro ou enquadrando melhor. Não houve mudança de código. |
| 5. Efeitos pausam sem aviso visível | Pendente | A lógica pausa em baixa taxa de quadros, mas o aviso existente é um texto auxiliar do painel. O badge S8 não foi iniciado. |

## Etapas e orçamento

- Baseline antes de mudanças funcionais: 148 testes aprovados; Node.js `v26.13.1`; quadro 320×180; duas regiões móveis 14×14; aquecimento 30 e medição 300; p95 `1,171 ms`, pico `3,924 ms`. O teto de comparação é p95 `1,347 ms` e pico `16 ms`.
- S3: seis testes novos e os testes congelados passaram. Uma medição pós-S3 foi p95 `1,096 ms`, pico `4,459 ms`.
- S4 foi revertida integralmente. Seus 12 testes direcionados e a suíte completa (160 testes) passaram, mas o benchmark mediu p50 `0,903 ms`, p95 `1,625 ms`, pico `2,412 ms`; o p95 excedeu o limite de `1,347 ms`. O commit da etapa não foi criado.
- Verificação do estado após rollback: `npm test` — 154 aprovados, 0 falhas. Duas novas medições do benchmark deram p95 `1,111 ms` e `1,299 ms`, ambas abaixo do teto; os picos foram `1,506 ms` e `2,334 ms`. As medições variam no host, então compare sempre no mesmo runtime e máquina.
- A grade local de S4 também não foi mantida. A verificação de sombra 0→0,12 não demonstrou redução de 30% contra threshold global 0,18, pois todos os valores já ficam abaixo do threshold. Não foi introduzido um limiar relativo sem cenário que valide o benefício.

## Restante

S5 ROI, S6 calibração/orçamento, S7 gravação, S8 ordem visual/badge, S9 absorção de objeto parado e S10 documentação final não foram executadas. A regra de segurança do roteiro exige parar quando uma etapa excede o orçamento de desempenho.

O inventário de arquivos está em [`faxina-inventario.md`](./faxina-inventario.md). Nenhum arquivo do projeto foi removido ou movido. Os arquivos locais preexistentes de benchmark estão preservados no stash `codex: preserve pre-existing local files before BlobTrack work`.

Teste de câmera em aparelho, efeitos visuais reais, áudio/HUD e botão Fundo: **não verificado neste turno**.
