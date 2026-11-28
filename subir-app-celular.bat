@echo off
cd /d "%~dp0"
echo Subindo o app do celular da fabrica (erp/celular.html) e a fila da maquina no ERP...
git add "erp/celular.html" "erp/celular.webmanifest" "erp/css/celular.css" "erp/js/celular.js" "erp/js/celular-fila.js" "erp/index.html" "manifest.webmanifest" "subir-app-celular.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "app do celular da fabrica: apontar, refazer peca (plano automatico na fila da maquina), laminacao por lote/cor, retalhos"
