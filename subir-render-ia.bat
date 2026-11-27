@echo off
cd /d "%~dp0"
echo Adicionando o Render com IA (arquivo novo + menu Render + termo assinado)...
git add "js/portal-53-render-ia.js" "js/order-terms.js" "js/portal-48-acervo.js" "portal.html" "supabase/functions/generate-gallery-render/index.ts" "subir-render-ia.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "Render com IA: render realista + IA (mesma camera, poucas decoracoes) + termo assinado com nome gravado no pedido"
