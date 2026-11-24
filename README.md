# Os Corpos Compon o Som — instrumento audiovisual que transforma movimento em som e imagem

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
- `src/app.js`: coordenação da câmera, sessão, renderização e controles.
- `src/audio/`, `src/core/`, `src/domain/`, `src/platform/`, `src/render/` e `src/session/`: áudio, utilitários/perfil, desenho do palco e bloqueio de sessão.
- `src/blob-tracker.js`: fundo, segmentação, componentes conectados e IDs.
- `src/audio-processor.js`: síntese e efeitos no AudioWorklet.
- `src/recorder.js`, `src/recording-canvas.js` e `src/recording-export.js`: MediaRecorder, composição fixa do palco e exportação.
- `src/preferences.js`: leitura tolerante a dados locais ausentes ou corrompidos.
- `src/video-crop.js`: limpeza da composição ao parar/trocar a câmera.
- `src/app.css`: layout responsivo e apresentação.
- `sw.js`: shell offline. Ao adicionar um arquivo carregado em runtime, inclua-o em `SHELL` e incremente a versão do cache.
- `teste.html` e `teste.js`: diagnóstico manual de câmera, rastreio e áudio.
- `tests/`: regressões automatizadas sem câmera ou dependências npm externas.
- `android/`: WebView offline e script de build do APK.

## Desenvolvimento local

Abra um terminal PowerShell na raiz e execute:

```powershell
python -m http.server 8000
```

Abra `http://localhost:8000` e toque em **Iniciar câmera**. Câmera e áudio exigem HTTPS ou `localhost`; `file://` não é suportado.

## Testes automatizados

Requer Node.js 20 ou mais recente; não há dependências npm externas.

```powershell
npm test
```

A suíte cobre threshold inválido, preferências locais inválidas, detecção e persistência de IDs, limpeza WebGL/Canvas 2D, composição e limite de resolução, MIME/estados/limites do MediaRecorder, exportação, assets offline e consistência dos assets empacotados no Android. Os testes usam frames e APIs sintéticos: não substituem validação com câmera e aparelho.

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

A versão atual usa o service worker v34 e 29 recursos no shell offline, totalizando 240.752 bytes sem compressão. A suíte `npm test` contém 147 testes; os testes usam frames e APIs sintéticos e não medem câmera, autonomia ou desempenho em aparelho físico. O APK debug em `dist/` foi recompilado com o seletor de escalas e o shell v34; ele é separado da PWA e não deve ser publicado na Play Store. O arquivo `.vercelignore` exclui Android, APK, documentação e testes do deploy da PWA. Para validar no celular, use o deployment HTTPS do Vercel após o commit correspondente chegar ao repositório remoto.

O núcleo de rastreamento também oferece seleção manual de região de interesse, rede geométrica opcional entre centros de blobs e adaptação gradual de objetos parados. A qualidade automática ajusta resolução e taxa de análise por custo medido, dentro de limites do aparelho. As medições recentes do cenário sintético 320×180 ficaram abaixo do orçamento p95 de 1,347 ms; resultados de computador não representam desempenho garantido em celular. A versão do shell offline é v37. A suíte atual tem 177 testes aprovados.

As pendências de validação em hardware e navegador publicado estão registradas em [`AUDITORIA.md`](AUDITORIA.md) e [`docs/diagnostico-cirurgico.md`](docs/diagnostico-cirurgico.md). O APK em `dist/` é artefato de debug, não destinado à publicação na Play Store.
