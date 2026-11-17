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
## Limites conhecidos

O rastreador usa mudança de luminância, não profundidade. Um objeto imóvel que passa a integrar o fundo pode deixar de aparecer; iluminação instável pode criar blobs extras. Exposição manual, instalação, tela cheia, Wake Lock e seleção da lente variam por navegador e aparelho. Métricas que o navegador não mede permanecem como `—`.
