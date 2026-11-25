@echo off
:: Inicia servidor local para testar o BlobTrack Celular sem CORS
echo.
echo ==========================================
echo   BlobTrack Celular - Servidor Local
echo ==========================================
echo.
echo Iniciando servidor em http://localhost:8000
echo Abra esse endereco no navegador ou no emulador Android.
echo Para testar no celular pela rede, use python -m http.server 8000 --bind 0.0.0.0
echo.
python -m http.server 8000 --bind 127.0.0.1
pause
