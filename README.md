# BlobTrack Celular-00

Aplicativo audiovisual PWA mobile-first. A câmera detecta regiões de movimento conectadas (blobs); os envelopes resultantes alimentam o palco visual e o som no mesmo ciclo de processamento.

## Definições

- **Blob**: grupo de pixels de movimento conectado no quadro da câmera. Cada grupo recebe uma caixa, um centro e um identificador que pode persistir entre quadros próximos.
- **Rastreio**: comparação de luminância entre o quadro atual e o fundo aprendido. A imagem é reduzida antes da análise para controlar o custo em celulares.
- **Sinais**: energia, densidade, velocidade dos blobs, coerência entre zonas e nível ambiente.
- **Envelope compartilhado**: suavização temporal dos sinais usada no mesmo ciclo para imagem e áudio.
- **Câmeras**: começa pela traseira principal escolhida pelo navegador; o controle alterna para a câmera frontal. Os nomes e a disponibilidade variam conforme aparelho e navegador.
- **Qualidade automática**: estima um perfil inicial pelo hardware disponível e ajusta a resolução conforme o tempo de processamento observado.

## Arquivos e manutenção

- `index.html`: entrada do app e estrutura da interface.
- `src/app.js`: câmera, renderização, áudio, controles e ciclo principal.
- `src/blob-tracker.js`: fundo, segmentação, componentes conectados e IDs dos blobs.
- `src/audio-processor.js`: síntese e medição no AudioWorklet.
- `src/app.css`: layout adaptativo, áreas de toque, safe areas e contraste.
- `manifest.webmanifest`: nome, orientação, tela cheia e ícone instalável.
- `sw.js`: cache offline da casca e dos módulos do app.
- ndroid/: APK de teste offline com WebView Android e permissão de câmera.
- `icons/icon.svg`: ícone PWA.

Mantenha a análise em baixa resolução, reutilize buffers e suspenda o processamento ao encerrar a sessão. Ao adicionar um arquivo carregado em runtime, inclua-o na lista `SHELL` do service worker e aumente a versão do cache. O histórico Git ainda pode conter versões antigas do projeto; o diretório de trabalho atual deve conter somente os arquivos do app móvel.

## Teste do índice no laptop

O laptop serve apenas como ambiente de desenvolvimento. Abra um terminal dentro da pasta do projeto e execute:

```powershell
python -m http.server 8000
```

Abra `http://localhost:8000`; o navegador trata localhost como contexto seguro para câmera, áudio e AudioWorklet. O `index.html` inicia o app sem instalação. Toque em **Iniciar sessão** para pedir a câmera.

Para testar no celular pela rede, use um túnel HTTPS ou publique em um host HTTPS. Não abra via `file://`: câmera e áudio exigem contexto seguro.

## Verificação manual

1. Abra o índice em localhost no laptop e inicie a sessão; confira imagem, áudio e console do navegador.
2. Alterne entre a câmera frontal e a traseira principal.
3. Mova um objeto no quadro; confira caixas e IDs dos blobs, seis zonas e sinais.
4. Toque nos efeitos, sensibilidade, qualidade automática/manual, mudo, flip, máscara e captura.
5. Gire a tela; a interface deve redimensionar sem reiniciar câmera ou áudio.
6. Abra outra aba e tente iniciar; apenas uma sessão deve usar a câmera/áudio.
7. Após a primeira carga online, recarregue sem rede para conferir a casca em cache.

## APK de teste Android

O módulo `android/` gera uma versão debug offline. O APK está em `dist/BlobTrack-Celular-00-debug.apk`; consulte `android/README.md` para instalar ou recompilar.
## Efeitos visuais reativos

No painel **Efeito**, os filtros base (Invert, BW umbral e BW dither) podem ser combinados com três camadas reativas: **Rastro** guarda posições recentes de cada blob; **Ondas** emite círculos que variam com velocidade e densidade; **Grade** deforma uma malha ao redor dos blobs. As camadas podem ser ligadas separadamente e seguem o flip e o recorte da câmera.

**Janela viva** vem ligada por padrão. O vídeo cru da câmera é composto uma única vez, recortado pela união das caixas dos blobs, acima do filtro e das camadas reativas. O contorno e os rótulos continuam visíveis quando Overlay está ligado. Capturar e compartilhar usam essa composição final. A opção é lembrada no dispositivo.

O painel de medições mostra o custo da composição das janelas. Se a taxa de quadros ficar abaixo do limite adaptado ao perfil do celular, Rastro, Ondas e Grade são pausados; a Janela viva continua ativa. Os efeitos voltam quando o desempenho se estabiliza.

## Timbres e efeitos de áudio

No painel **Som**, selecione os timbres **Suave**, **Sino** e **Pulsante** para alterar a textura das notas por zona. Os botões independentes **Eco**, **Espaço** e **Chorus** podem ser combinados durante a sessão; timbre e efeitos ficam salvos no dispositivo. O processamento usa buffers de atraso reutilizados no AudioWorklet, sem alocações por bloco de áudio.

### Controles de timbre e efeitos de áudio

No painel **Som**, escolha **Suave**, **Sino** ou **Pulsante** para mudar a cor das notas das zonas sem alterar o rastreio. **Eco**, **Espaço** e **Chorus** são botões independentes; podem ser combinados, desligados durante a sessão e ficam salvos no dispositivo. Os buffers de atraso são reutilizados dentro do AudioWorklet.

Checklist rápido: alterne os três timbres com movimento ativo; ligue Eco, Espaço e Chorus um por vez e depois combinados; confirme que Mudo e Som desligado continuam silenciando a saída; encerre e reinicie para verificar as preferências.

### Checklist manual dos efeitos

1. No painel Efeito, teste Rastro, Ondas e Grade separadamente e em conjunto; mova o objeto para conferir a resposta à posição e à velocidade.
2. Com Janela viva ligada, alterne Invert, BW umbral e BW dither: dentro das caixas deve aparecer a imagem crua; fora delas, o filtro.
3. Compare flip ligado/desligado, máscara e câmera frontal; confira o alinhamento dos recortes e efeitos.
4. Capture e compartilhe uma imagem; confira se o resultado inclui filtro, efeitos e janelas cruas. Desligue Janela viva, recarregue e confirme que a preferência foi salva.
5. Teste o Gear VR SM-R323 e gire o telefone; as duas vistas devem manter a composição sem reiniciar a sessão.
6. Deixe o app sob carga para conferir a pausa automática dos efeitos reativos e o custo da composição no painel de medições.

## Limites conhecidos

O rastreador usa mudança de luminância, não profundidade. Um objeto imóvel que passa a integrar o fundo pode deixar de aparecer; iluminação instável pode criar blobs extras. Exposição manual, instalação, tela cheia, Wake Lock e seleção da lente variam por navegador e aparelho. Métricas que o navegador não mede permanecem como `—`.
## Benchmark e auditoria

O shell web principal ocupa 109.466 bytes sem compressao nesta revisao, ante 108.433 bytes antes das alteracoes (HTML, CSS, app, tracker, AudioWorklet e service worker; aumento de 1.033 bytes). FPS, tempo de rastreio, memoria apos 5 minutos e tempo de boot precisam ser medidos em aparelho real com camera e DevTools; nao publicamos valores estimados como benchmarks.

Esta rodada registrou o diagnostico estatico em `AUDITORIA.md`, cacheia uniforms WebGL, reutiliza o array de envelopes das zonas e limita as atualizacoes do painel a 10 Hz sem desacelerar rastreio ou audio. Tambem sincroniza ARIA em tabs/efeitos, comunica falhas de audio/WebGL por toast e registra listeners de interrupcao apenas uma vez por contexto. O cache offline foi versionado para v15. A interface segue em tema escuro e respeita `prefers-reduced-motion`.

## Regra video-dentro-dos-blobs

Quando Janela viva esta ligada, a imagem crua da camera aparece nas janelas dos blobs, enquanto o restante mantem o efeito ativo. Desligue Janela viva no painel Efeito para ver o filtro em toda a imagem.
