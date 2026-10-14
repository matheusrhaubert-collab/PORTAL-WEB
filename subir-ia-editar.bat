@echo off
REM Adiciona ao Git os arquivos NOVOS do portal (IA - Editar projeto, Novo modulo) e sobe.
REM E so dar dois cliques.
cd /d "%~dp0"
git add "js/portal-19-ia-editar.js" "js/portal-20-novo-modulo.js" "publicar-funcao-ia.bat" "subir-ia-editar.bat"
if errorlevel 1 (
  echo.
  echo Nao consegui adicionar os arquivos. Mande a mensagem acima pro Claude.
  pause
  exit /b 1
)
call "%~dp0subir.bat"
