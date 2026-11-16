@echo off
cd /d "%~dp0"
echo Adicionando o teste do closet canto 90...
git add "scripts/tests/teste-closet-canto-90.js" "subir-closet-canto90.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "closet canto 90 com cabides e suporte em L (migration 300)"
