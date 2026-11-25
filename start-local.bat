@echo off
:: Inicia servidor local para testar o BlobTrack Celular sem CORS
echo.
echo ==========================================
echo   BlobTrack Celular - Servidor Local
echo ==========================================
echo.
echo Iniciando servidor em http://localhost:5173
echo Abra esse endereço no navegador ou no emulador Android.
echo.
npx serve . -l 5173
pause
