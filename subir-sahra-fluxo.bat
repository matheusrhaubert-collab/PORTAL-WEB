@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos do Fluxo da SAHRA (so admin)...
git add "sahra-fluxo.html" "js/portal-38-sahra-fluxo.js" "assets/sahra/fluxo/sahra-rosto.png" "assets/sahra/fluxo/sahra-busto.png" "assets/sahra/fluxo/sahra-mesa.png" "assets/sahra/fluxo/sahra-escritorio.jpg" "subir-sahra-fluxo.bat" "publicar-funcao-sahra-fluxo.bat" "supabase/functions/sahra-fluxo/index.ts"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
