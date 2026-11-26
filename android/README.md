# APK Android — BlobTrack Celular-00

O módulo Android hospeda os assets web por `WebViewAssetLoader` em uma origem HTTPS local. A câmera só é concedida após a permissão do Android e a solicitação de captura do WebView. A síntese de áudio continua sendo feita pelo AudioWorklet. Os dados do app ficam excluídos de backup em nuvem e transferência entre dispositivos.

## Compilar

Na pasta `android`, execute no PowerShell:

```powershell
.\build-apk.ps1
```

O script compila `:app:assembleDebug` e copia o APK para:

- `app/build/outputs/apk/debug/app-debug.apk`
- `..\dist\BlobTrack-Celular-00-debug.apk`

O APK de `dist/` é rastreado pelo Git; recompilar atualiza esse artefato. A variante debug é assinada com chave debug e não deve ser publicada na Play Store.

O script usa JDK 17, Android SDK 35 e Gradle 8.9 em `.local-build`. Não é necessário instalar Gradle globalmente. `android/local.properties` é gerado localmente e não deve ser versionado.

## Emulador em um comando

Na raiz do projeto, dê dois cliques em `start-emulador.bat` (ou rode `.\start-emulador.bat`). Ele inicia o AVD `BlobTrackEmulator` se ele não estiver ligado, espera o boot, instala `dist/BlobTrack-Celular-00-debug.apk`, concede câmera/áudio ao Chrome, refaz o `adb forward tcp:9222 localabstract:chrome_devtools_remote` e abre o site publicado. Se o AVD não existir, o erro lista os nomes disponíveis; escolha outro com `-Avd NOME`. Para encerrar, `.\start-emulador.bat -Parar`.

Depois de pronto, rode `node scripts/qa-emulador.mjs` na raiz: o script usa `fetch` e `WebSocket` do próprio Node (sem pacotes extras), conecta em `http://127.0.0.1:9222` e imprime um JSON com sessão, efeitos, toggles, abas, blobs, ROI, suporte à gravação, service worker e erros de console. Ele é uma pré-checagem funcional: não mede bateria, GPU, câmera real nem aparência final. Resultados e limites em [`../docs/device-matrix.md`](../docs/device-matrix.md); explicação didática no [`../README.md`](../README.md).

Para abrir outra URL HTTPS, use `.\start-emulador.bat -Url 'https://...'`; para não reinstalar o APK, `-SemApk`. Evite `http://localhost:8000` dentro do emulador: para o Android, `localhost` é o próprio emulador, não o notebook, e a câmera exige origem segura.

## Instalar e validar por USB

Ative as opções de desenvolvedor e a depuração USB no telefone. Conecte-o e, na pasta `android`, execute:

```powershell
.\.local-build\android-sdk\platform-tools\adb.exe devices -l
.\.local-build\android-sdk\platform-tools\adb.exe install -r ..\dist\BlobTrack-Celular-00-debug.apk
```

Confirme a autorização da chave RSA no telefone. Abra **BlobTrack Celular-00**, toque em **Iniciar sessão** e conceda a permissão de câmera. Teste iniciar/parar, troca de câmera, rotação, tela bloqueada/retomada, áudio, gravação e recarga sem rede.

Para validar gravação: inicie uma sessão, toque em **Gravar vídeo**, aguarde alguns segundos, pare e use **Salvar gravação**. O arquivo contém só o palco processado, **sem áudio** (o som reativo continua tocando no app, mas não entra no vídeo). O formato é sempre MP4 desde `4cdf5cc`; se o WebView não oferecer MP4, o botão fica desabilitado. A gravação pausa em segundo plano e retoma quando o app volta. Replay não está incluído. Veja [`../docs/gravacao.md`](../docs/gravacao.md).

Para validar instalação/execução, o primeiro comando precisa listar o serial do dispositivo com estado `device`; uma lista vazia não valida hardware. Em 21/11/2026, foi criado o AVD `BlobTrackCacheV22_API35` (Pixel 6, API 35, imagem Google APIs x86_64) em `android/.local-build/avd`. Nele, o cache v22 foi ativado e os 14 assets foram recuperados com a rede simulada offline. O AVD não substitui validação de câmera e desempenho em telefone físico.

## Diagnóstico

- Build falhou: verifique a mensagem do Gradle e a presença de `android/.local-build/jdk-17`, `android-sdk/platforms/android-35` e `gradle-8.9`.
- Câmera não abre: confirme permissão Android e solicitação do WebView; reinstale ou revogue/conceda a permissão novamente.
- Tela aparece, mas sem atualizações offline: confirme que `sw.js` pré-cacheia cada arquivo carregado em runtime e que sua versão foi incrementada.
- ADB não lista telefone: confirme depuração USB, cabo de dados e aprovação RSA; rode `adb devices -l` novamente.
