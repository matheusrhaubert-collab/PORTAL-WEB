@echo off
REM ==========================================================================
REM Duplo clique aqui para rodar os arquivos de teste em http://localhost
REM ==========================================================================
REM O teste-ia-projeto-com-imagem.html chama a API do Gemini direto do
REM navegador; por file:// o navegador bloqueia (CORS, origem "null") e o erro
REM aparece como "Failed to fetch". Servido por localhost, funciona.
REM
REM Isto e 100%% local: nao sobe nada, nao toca no Supabase. Feche esta janela
REM (ou Ctrl+C) quando terminar.
REM ==========================================================================

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node nao encontrado no PATH.
  echo   Instale em https://nodejs.org  ^(ou rode: python -m http.server 8000^)
  echo.
  pause
  exit /b 1
)

echo.
echo   Iniciando servidor local... o navegador deve abrir sozinho.
echo.
node servir-teste.js %1
pause
