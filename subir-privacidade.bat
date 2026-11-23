@echo off
cd /d "%~dp0"
echo Adicionando a Politica de Privacidade (arquivo novo)...
git add "js/data-terms.js" "subir-privacidade.bat" "scripts/tests/teste-lift-1-ou-2.js"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "politica de privacidade com aceite por usuario + central e my company liberados pros dealers + aba entregues + perdidos em tabela"
