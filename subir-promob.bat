@echo off
cd /d "%~dp0"
echo Adicionando o pedido PROMOB (arquivo novo + Central + People)...
git add "js/portal-52-promob-pedido.js" "js/portal-44-central-plus.js" "js/portal-43-minha-empresa.js" "erp/js/data-lotes.js" "erp/js/screens-promob-lista.js" "erp/js/app.js" "erp/index.html" "js/portal-06c-projetos-canvas-3d-acoes.js" "css/style.css" "portal.html" "subir-promob.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "pedido PROMOB: Importar PROMOB na aba Orders (XML com preco), coluna Origem LEGNO STUDIO / PROMOB, liberar PROMOB por loja em People, Lista PROMOB no ERP (CSV do lote), People mais largo, painel do modulo redesenhado"
