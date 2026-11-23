@echo off
cd /d "%~dp0"
echo Adicionando o arquivo novo do "Preco de:" (portal-47)...
git add "js/portal-47-preco-de.js" "subir-apontar-e-preco-de.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "apontar pecas: etiqueta antiga aceita + gaveta errada so a peca refeita; aba Lost com circulo; Preco de (so admin)"
