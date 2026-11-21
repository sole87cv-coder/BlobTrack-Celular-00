# APK Android — BlobTrack Celular-00

O módulo Android hospeda os assets web por `WebViewAssetLoader` em uma origem HTTPS local. A câmera só é concedida após a permissão do Android e a solicitação de captura do WebView. A síntese de áudio continua sendo feita pelo AudioWorklet.

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

## Instalar e validar por USB

Ative as opções de desenvolvedor e a depuração USB no telefone. Conecte-o e, na pasta `android`, execute:

```powershell
.\.local-build\android-sdk\platform-tools\adb.exe devices -l
.\.local-build\android-sdk\platform-tools\adb.exe install -r ..\dist\BlobTrack-Celular-00-debug.apk
```

Confirme a autorização da chave RSA no telefone. Abra **BlobTrack Celular-00**, toque em **Iniciar sessão** e conceda a permissão de câmera. Teste iniciar/parar, troca de câmera, rotação, tela bloqueada/retomada, áudio, gravação e recarga sem rede.

Para validar gravação: inicie uma sessão, toque em **Gravar vídeo**, aguarde alguns segundos, pare e use **Salvar gravação**. O app grava o palco processado e o áudio sintetizado, sem usar o microfone; formato e extensão dependem do `MediaRecorder` disponível no WebView. A gravação pausa em segundo plano e retoma quando o app volta. Replay não está incluído.

Para validar instalação/execução, o primeiro comando precisa listar o serial do dispositivo com estado `device`; uma lista vazia não valida hardware. A revisão de 20/11/2026 não encontrou dispositivo conectado nem emulador instalado, então a validação em aparelho permanece pendente.

## Diagnóstico

- Build falhou: verifique a mensagem do Gradle e a presença de `android/.local-build/jdk-17`, `android-sdk/platforms/android-35` e `gradle-8.9`.
- Câmera não abre: confirme permissão Android e solicitação do WebView; reinstale ou revogue/conceda a permissão novamente.
- Tela aparece, mas sem atualizações offline: confirme que `sw.js` pré-cacheia cada arquivo carregado em runtime e que sua versão foi incrementada.
- ADB não lista telefone: confirme depuração USB, cabo de dados e aprovação RSA; rode `adb devices -l` novamente.
