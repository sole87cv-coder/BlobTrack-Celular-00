# BlobTrack Celular-00 · APK Android

Este módulo gera um APK debug offline. A interface e o motor continuam em HTML/JS; o WebView inclui os arquivos do projeto no pacote. A camada Android só abre os assets por uma origem HTTPS local e concede a permissão de câmera após a confirmação do sistema.

## Gerar

Na pasta `android`, execute no PowerShell:

```powershell
.\build-apk.ps1
```

O APK sai em `dist/BlobTrack-Celular-00-debug.apk` (também fica em `app/build/outputs/apk/debug/app-debug.apk`). Ele é assinado com a chave debug e serve para instalação de teste; não é uma versão de publicação na Play Store.

## Instalar no Android

Copie o APK para o telefone e abra-o para instalar. Se o Android solicitar, permita a instalação de apps pelo navegador ou gerenciador de arquivos usado para abrir o APK. Ao iniciar o app, toque em **Ligar** e conceda a permissão de câmera.

Com depuração USB ativada e telefone conectado, também é possível instalar pelo computador:

```powershell
.\.local-build\android-sdk\platform-tools\adb.exe install -r .\app\build\outputs\apk\debug\app-debug.apk
```

O app não precisa de internet para carregar a interface. A compilação requer JDK 17, Android SDK 35 e Gradle 8.9, instalados pelo script em `.local-build`. O pacote contém a câmera Android e WebView; o som é sintetizado pelo AudioWorklet do app.
