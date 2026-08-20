@echo off
REM ==========================================================================
REM Servidor local na porta 8080 — para o Claude conseguir acessar o portal.
REM
REM Por que existe, se ja tem o servir-teste.bat: aquele so tenta o Node e a
REM janela fecha antes de dar pra ler o erro. Este tenta Node, cai pro Python
REM se o Node nao existir, e NUNCA fecha sozinho — o erro fica na tela.
REM
REM A extensao do Chrome nao abre file:// (o Chrome trata como pagina interna),
REM por isso o teste precisa passar por http://localhost.
REM
REM 100%% local: nao sobe nada, nao publica nada. Ctrl+C ou feche a janela pra
REM parar.
REM ==========================================================================
cd /d "%~dp0"
echo.
echo   Pasta: %CD%
echo.

where node >nul 2>nul
if not errorlevel 1 (
  echo   Node encontrado. Servindo em http://localhost:8080/portal.html
  echo   ^(o navegador abre sozinho no portal.html; deixe esta janela aberta^)
  echo.
  node servir-teste.js 8080 portal.html
  goto fim
)

echo   Node nao esta no PATH. Tentando Python...
where python >nul 2>nul
if not errorlevel 1 (
  echo   Python encontrado. Servindo em http://localhost:8080/portal.html
  echo   ^(deixe esta janela aberta^)
  echo.
  python -m http.server 8080
  goto fim
)

echo.
echo   Nem Node nem Python foram encontrados no PATH.
echo   Instale o Node em https://nodejs.org e rode este arquivo de novo.
echo.

:fim
echo.
echo   O servidor parou. Leia a mensagem acima antes de fechar.
pause
