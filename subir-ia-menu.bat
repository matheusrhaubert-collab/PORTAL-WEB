@echo off
REM Adiciona ao Git o arquivo NOVO da barra (menus suspensos - js/portal-25-ia-menu.js) e sobe.
REM E so dar dois cliques.
cd /d "%~dp0"
git add "js/portal-25-ia-menu.js" "subir-ia-menu.bat"
if errorlevel 1 (
  echo.
  echo Nao consegui adicionar os arquivos. Mande a mensagem acima pro Claude.
  pause
  exit /b 1
)
call "%~dp0subir.bat"
