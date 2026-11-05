@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos da SAHRA (so admin)...
git add "js/portal-37-sahra.js" "assets/sahra/sahra-avatar.webp" "assets/sahra/sahra-neutra.webp" "assets/sahra/sahra-oi.webp" "assets/sahra/sahra-paleta.webp" "assets/sahra/sahra-pensando.webp" "assets/sahra/sahra-apresenta.webp" "assets/sahra/sahra-joinha.webp" "subir-sahra.bat" "publicar-funcao-sahra.bat" "supabase/functions/sahra-chat/index.ts" "supabase/functions/sahra-chat/conhecimento.ts" "database/migration_268_sahra_aprendizado.sql" "database/migration_269_sahra_centrais.sql"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
