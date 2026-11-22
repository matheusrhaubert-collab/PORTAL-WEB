@echo off
cd /d "%~dp0"
echo Adicionando o sininho da fabrica (arquivo novo)...
git add "js/portal-46-sininho.js" "scripts/tests/teste-sininho.js" "subir-sininho.bat" "erp/js/data-lotes.js" "erp/js/screens-lotes.js" "scripts/tests/empresas/teste-pagamento.mjs"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "sininho da fabrica (cadastro novo e pedido novo, so admin) + excluir pedido aguardando aprovacao na Central"
