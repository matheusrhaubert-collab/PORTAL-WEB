@echo off
cd /d "%~dp0"
echo Adicionando o "Preco de:" (arquivo novo)...
git add "js/portal-47-preco-de.js" "scripts/tests/teste-preco-de.js" "subir-preco-de.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "Preco de: admin escolhe o usuario e o preco/proposta do projeto saem com as margens dele"
