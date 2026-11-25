@echo off
cd /d "%~dp0"
echo Adicionando o guia "Qual a diferenca?" (arquivo novo)...
git add "js/portal-49-guia-componentes.js" "subir-guia-componentes.bat" "scripts/tests/teste-gola-gaveteiros.js" "scripts/tests/teste-gola-juncao-recorte.js"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "guia Qual a diferenca na janela Add cabinet + Add cabinet lembra a aba"
