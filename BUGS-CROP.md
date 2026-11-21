# Registro de bugs e validação — vídeo e rastreamento

Revisado em 20/11/2026 contra a implementação atual. As correções listadas foram verificadas estaticamente e por regressões locais quando indicado. Não havia telefone conectado ao ADB nem emulador instalado; resultados de câmera, tela, áudio e desempenho em aparelho continuam pendentes.

## Bugs corrigidos

### B2 — quadro antigo permanecia após parar/trocar câmera

- **Causa anterior:** a sessão parava de renderizar, mas os pixels já desenhados nos canvases permaneciam na tela enquanto o novo stream iniciava.
- **Correção atual:** `stopMedia()` chama `clearVideoComposition()` antes de liberar o stream. A nova imagem só é renderizada quando há frame disponível.
- **Cobertura:** `tests/core.test.js` verifica a limpeza de framebuffer WebGL e das camadas Canvas 2D.
- **Pendente:** teste end-to-end da troca entre lentes e da primeira imagem em Android/iOS.

### B4 — retomada usava a propriedade errada de visibilidade

- **Causa anterior:** a propriedade era escrita como `document.visibilitystate`; o padrão é `document.visibilityState`.
- **Correção atual:** as duas condições de retomada usam a propriedade padrão.
- **Cobertura:** teste automatizado verifica duas condições e impede a grafia incorreta.
- **Pendente:** suspender e restaurar a aplicação em aparelho para validar câmera, áudio e Wake Lock.

### D7 — threshold não finito suprimia todos os blobs

- **Causa anterior:** o valor seguro era calculado, mas a comparação de pixels ainda usava o argumento original.
- **Correção atual:** a segmentação usa o threshold validado/clampado.
- **Cobertura:** fixture com fundo escuro e seis formas claras passa `NaN` e confirma seis blobs.

### U1 — dock lateral interceptava a barra de gravação em paisagem

- **Causa:** em viewports paisagem com largura mínima de 700 px, o dock lateral direito ocupava a mesma área da barra flutuante.
- **Correção atual:** barra e indicador REC reservam a largura do dock lateral.
- **Cobertura:** viewport desktop/paisagem confirmou que o botão REC permanece clicável e fora dos limites do dock.

### R1 — gravação manual do palco

- **Estado atual:** composição offscreen inclui `#visual`, shade quando visível e `#overlay`; dimensões e orientação ficam fixas por gravação, com letterbox ao girar.
- **Limites:** até 10 min, 350 MiB e 1280 px no lado maior; pausa em segundo plano; sem Replay.
- **Cobertura:** testes automatizados para resolução, MIME, transições, exportação e cache; teste desktop sintético produziu Blob. Câmera real, share sheet, reprodução e desempenho em aparelho permanecem pendentes.

## Limites e riscos ainda conhecidos

Estes pontos não foram reproduzidos como falhas nesta revisão; não devem ser tratados como bugs confirmados sem fixture ou observação:

- **Identidade de blobs:** associação gulosa pela distância dos centroides pode trocar IDs quando objetos se cruzam ou se aproximam.
- **Junção de objetos:** componentes que se tocam são tratados como um único blob pelo flood fill de 8 vizinhos.
- **Iluminação e fundo:** mudanças globais de luz podem gerar regiões falsas; pixels em movimento não são assimilados ao fundo até ficarem abaixo do threshold.
- **Caixas e ruído:** as caixas não têm suavização temporal; contornos ruidosos podem causar jitter.
- **Custo:** cada análise usa `getImageData()` e percorre a máscara. O custo real depende de resolução, câmera e hardware.
- **Composição visual:** aspecto, flip, Gear VR, máscara, captura e antialiasing precisam ser avaliados com câmera e tela reais.

## Matriz de validação

| Área | Estado estático/automatizado | Ainda exige aparelho |
|---|---|---|
| Threshold, blobs sintéticos, continuidade de IDs e reset | Coberto por `npm test` | Variação de iluminação e cenas reais |
| Limpeza de canvas WebGL e 2D | Helper coberto nos dois caminhos | Troca de lente e atualização visual end-to-end |
| Visibilidade da página | Propriedade correta coberta | Bloqueio de tela, retorno ao app, interrupções de mídia |
| Gravação manual | Composição, MIME, limites, pausa e exportação cobertos por testes sintéticos | Câmera, áudio, compartilhamento e reprodução em Android/iOS |
| Cache offline | Assets obrigatórios e existência dos arquivos cobertos | Instalar PWA, primeira carga e modo avião |
| Aspecto, flip, recorte, overlay e Gear VR | Revisão estática do fluxo | Inspeção visual em retrato/paisagem e headset |
| Captura/compartilhamento | Composição revisada estaticamente | Verificar imagem final e Web Share em dispositivo |
| FPS, latência e memória | Nenhuma medição física | Perfil com câmera por vários minutos em aparelhos de referência |

## Passos para validação física

Depois de instalar `dist/BlobTrack-Celular-00-debug.apk` em um telefone Android:

1. Permitir e negar a câmera; testar iniciar, parar e iniciar novamente.
2. Alternar frontal/traseira e confirmar limpeza imediata da imagem anterior.
3. Testar filtros, Rastro, Ondas, Grade, Janela viva, máscara, overlay e captura.
4. Testar timbres, Eco, Espaço, Chorus, mudo e interrupção/retomada de áudio.
5. Bloquear/desbloquear a tela, girar o aparelho e repetir ciclos de sessão.
6. Instalar, carregar uma vez online e abrir novamente sem rede.
7. Registrar modelo, versão do Android/WebView, FPS observado, erros do console e resultados visuais.
8. Gravar por alguns segundos, parar, salvar/compartilhar, abrir o arquivo e verificar vídeo, áudio, orientação e extensão.

Não afirmar FPS, latência ou memória como aprovados sem registrar as medições no aparelho. A suíte automatizada é uma proteção de regressão para lógica isolada, não uma substituição dessa matriz.
