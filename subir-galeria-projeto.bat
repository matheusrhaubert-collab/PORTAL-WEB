@echo off
cd /d "%~dp0"
git add "js/portal-54-galeria-projeto.js" "portal.html" "js/portal-44-central-plus.js" "subir-galeria-projeto.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "Galeria do projeto no cartao: setas na foto e tela cheia com todas as imagens"
