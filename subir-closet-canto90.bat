@echo off
cd /d "%~dp0"
echo Adicionando o closet canto 90 e o passo a passo de montagem...
git add "scripts/tests/teste-closet-canto-90.js" "scripts/tests/teste-montagem-passos.js" "js/portal-40-montagem.js" "subir-closet-canto90.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "closet canto 90 em 2 caixas + passo a passo de montagem (piloto)"
