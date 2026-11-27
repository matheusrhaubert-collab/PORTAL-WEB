@echo off
cd /d "%~dp0"
echo Adicionando a tela de problemas/solicitacoes (arquivo novo)...
git add "js/portal-51-suporte.js" "js/portal-46-sininho.js" "portal.html" "subir-suporte.bat"
if errorlevel 1 (
  echo Falhou o git add.
  pause
  exit /b 1
)
call subir.bat "reportar problema / abrir solicitacao: Ctrl+V de prints e videos, numero do chamado, acompanhamento e aviso no sininho"
