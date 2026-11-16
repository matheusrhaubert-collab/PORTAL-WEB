@echo off
cd /d "%~dp0"
echo Adicionando os Documentos do Order Center...
git add "js/portal-41-documentos.js" "subir-documentos.bat" "scripts/tests/teste-closet-canto-90.js" "scripts/tests/teste-montagem-passos.js" "js/portal-40-montagem.js" "subir-closet-canto90.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "documentos por projeto/pasta no Order Center + cotas internas no plano tecnico"
