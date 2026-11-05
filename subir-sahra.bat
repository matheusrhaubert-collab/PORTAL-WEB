@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos da SAHRA (so admin)...
git add "js/portal-37-sahra.js" "assets/sahra/sahra-avatar.webp" "subir-sahra.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
