@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos da SAHRA (so admin)...
git add "js/portal-37-sahra.js" "assets/sahra/sahra-avatar.webp" "subir-sahra.bat" "publicar-funcao-sahra.bat" "supabase/functions/sahra-chat/index.ts" "supabase/functions/sahra-chat/conhecimento.ts"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
