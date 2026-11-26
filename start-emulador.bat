@echo off
:: Um clique: inicia o AVD, instala o APK, libera o CDP e abre o app no Chrome
echo.
echo ==========================================
echo   BlobTrack - Emulador Android (1 comando)
echo ==========================================
echo.
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0android\start-emulador.ps1" %*
if errorlevel 1 (
  echo.
  echo Falha ao preparar o emulador. Leia a mensagem em vermelho acima.
  pause
  exit /b 1
)
echo.
echo Pressione uma tecla para fechar esta janela. O emulador continua aberto.
pause >nul
