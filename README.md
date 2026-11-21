# BlobTrack Celular-00

Aplicativo audiovisual mobile-first. A câmera detecta regiões de movimento conectadas (blobs); os sinais rastreados alimentam o palco visual e a síntese de áudio.

## Recursos

- Segmentação por diferença de luminância, caixas e IDs persistentes dos blobs.
- Filtros visuais Invert, BW umbral e BW dither; camadas Rastro, Ondas e Grade.
- Janelas de vídeo ao vivo recortadas pela união dos blobs, captura e compartilhamento.
- Áudio via AudioWorklet, com timbres Suave, Sino e Pulsante e efeitos Eco, Espaço e Chorus.
- Gravação manual do palco composto com áudio sintetizado, pausa em segundo plano e exportação conforme o suporte do navegador.
- Qualidade adaptativa, alternância de câmeras, modo palco e visualização Gear VR.
- PWA instalável com shell offline e APK Android debug baseado em WebView.

O tracker detecta movimento, não profundidade. Um objeto parado pode ser incorporado ao fundo; iluminação instável pode criar blobs extras.

## Código

- `index.html`: interface e metadados PWA.
- `src/app.js`: câmera, ciclo da sessão, renderização e controles.
- `src/blob-tracker.js`: fundo, segmentação, componentes conectados e IDs.
- `src/audio-processor.js`: síntese e efeitos no AudioWorklet.
- `src/recorder.js`, `src/recording-canvas.js` e `src/recording-export.js`: MediaRecorder, composição fixa do palco e exportação.
- `src/video-crop.js`: limpeza da composição ao parar/trocar a câmera.
- `src/app.css`: layout responsivo e apresentação.
- `sw.js`: shell offline. Ao adicionar um arquivo carregado em runtime, inclua-o em `SHELL` e incremente a versão do cache.
- `teste.html` e `teste.js`: diagnóstico manual de câmera, rastreio e áudio.
- `tests/core.test.js`: regressões automatizadas sem câmera ou dependências externas.
- `android/`: WebView offline e script de build do APK.

## Desenvolvimento local

Abra um terminal PowerShell na raiz e execute:

```powershell
python -m http.server 8000
```

Abra `http://localhost:8000` e toque em **Iniciar sessão**. Câmera e áudio exigem HTTPS ou `localhost`; `file://` não é suportado.

## Testes automatizados

Requer Node.js 20 ou mais recente; não há dependências npm externas.

```powershell
npm test
```

A suíte cobre threshold inválido, detecção e persistência de IDs, limpeza WebGL/Canvas 2D, composição e limite de resolução, MIME/estados/limites do MediaRecorder, exportação, assets offline e ciclo de visibilidade. Os testes usam frames e APIs sintéticos: não substituem validação com câmera e aparelho.

## PWA e instalação em celular

Publique em um host HTTPS ou abra a URL local por HTTPS no celular. No iPhone, use Safari e **Compartilhar → Adicionar à Tela de Início**. Permissões, tela cheia, Wake Lock e seleção de lente variam por sistema e navegador.

Checklist manual: iniciar/parar; permissões concedidas/negadas; câmera frontal/traseira; rotação; filtros e camadas; janela viva e captura; áudio/mudo; gravar/parar/salvar/compartilhar; suspensão/retomada durante gravação; abrir uma segunda aba; recarregar offline após a primeira carga online. A gravação não usa microfone. Replay não está incluído.

## APK Android debug

Na pasta `android`, execute:

```powershell
.\build-apk.ps1
```

O script compila e copia o APK para `dist/BlobTrack-Celular-00-debug.apk`. O arquivo em `dist/` é rastreado pelo Git e será atualizado pelo build. É um APK debug, não destinado à publicação na Play Store. Requisitos e instalação USB estão em [`android/README.md`](android/README.md).

## Medições e validação

O shell pré-cacheado pelo service worker `v20` ocupa **166.381 bytes sem compressão** nesta revisão (incluindo os módulos de gravação). Esse tamanho não é um benchmark de rede.

O smoke test desktop confirmou WebGL2, layout paisagem sem sobreposição do botão REC e gravação sintética de vídeo. Isso não valida câmera/áudio físicos, reprodução ou compartilhamento em aparelho. FPS, latência, memória e retomada em background ainda exigem aparelho real. Consulte [`AUDITORIA.md`](AUDITORIA.md) e [`BUGS-CROP.md`](BUGS-CROP.md) para resultados e pendências.
