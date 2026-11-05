@echo off
cd /d "%~dp0"
echo Adicionando o arquivo novo do Render decorado...
git add "js/portal-36-render-decorado.js" "database/migration_266_fotos_realistas_camera.sql" "publicar-funcao-render.bat" "subir-render-decorado.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat
