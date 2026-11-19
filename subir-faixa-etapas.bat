@echo off
cd /d "%~dp0"
echo Subindo: andamento no portal (Packing, financeira final, alerta 100%, coluna Production)...
git add "subir-faixa-etapas.bat"
call subir.bat "portal: pecas no Packing, liberacao financeira final, alerta 100% e coluna Production embalado/pronto pra coleta"
