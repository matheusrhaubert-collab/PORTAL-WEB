@echo off
cd /d "%~dp0"
echo Adicionando os arquivos novos (boas-vindas + suporte)...
git add "js/portal-50-boas-vindas.js" "js/portal-51-suporte.js" "js/portal-46-sininho.js" "scripts/tests/teste-boas-vindas-tela.js" "scripts/tests/empresas/teste-boas-vindas.mjs" "subir-boas-vindas.bat" "subir-suporte.bat" "portal.html"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
if exist "assets\tutorial\*.mp4" git add "assets/tutorial"
call subir.bat "boas-vindas (cadastro, cozinha de exemplo, video tutorial) + reportar problema/solicitacao + bancada no canto em L"
